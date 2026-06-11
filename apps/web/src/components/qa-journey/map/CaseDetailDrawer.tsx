'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    ExternalLink,
    FileText,
    History,
    Image as ImageIcon,
    Link2,
    Loader2,
    Target,
    X,
    XCircle,
} from 'lucide-react';
import { PRIORITY_OPTIONS, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { loadSubflowRuns, type RunEvidence, type SubflowTestRun } from '@/lib/qa-journey/runs';
import type { QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface CaseDetailDrawerProps {
    subflow: QAJourneySubflow;
    case_: QAJourneyCase;
    /** Volta para o drawer do sub-fluxo (mantém-no aberto atrás). */
    onBack: () => void;
    /** Fecha toda a pilha de drawers. */
    onClose: () => void;
}

// Drawer empilhado sobre o SubflowDrawer: detalhe de um caso de teste.
// Mostra a spec (dados do próprio caso) + a execução/evidências do SUB-FLUXO
// (histórico de runs do teste Maestro vinculado + anexos de bug_reports).
// Ver lib/qa-journey/runs.ts para a limitação de modelo de dados.
export function CaseDetailDrawer({ subflow, case_, onBack, onClose }: CaseDetailDrawerProps) {
    const prio = PRIORITY_OPTIONS.find(o => o.value === case_.priority);
    const run = case_.last_run_status ? RUN_STATUS_OPTIONS.find(o => o.value === case_.last_run_status) : null;

    const [loading, setLoading] = useState(true);
    const [runs, setRuns] = useState<SubflowTestRun[]>([]);
    const [evidenceByRun, setEvidenceByRun] = useState<Record<string, RunEvidence[]>>({});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setRuns([]);
        setEvidenceByRun({});
        (async () => {
            const res = await loadSubflowRuns(subflow.test_case_id);
            if (cancelled) return;
            setRuns(res.runs);
            setEvidenceByRun(res.evidenceByRun);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [subflow.test_case_id, case_.id]);

    return (
        <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-card border-l border-border shadow-2xl z-50 flex flex-col"
        >
            {/* Header com breadcrumb + voltar */}
            <div className="p-5 border-b border-border flex items-start gap-3">
                <button
                    onClick={onBack}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0 mt-0.5"
                    aria-label="Voltar"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1 truncate">
                        <button onClick={onBack} className="hover:text-foreground truncate">{subflow.title}</button>
                        <ChevronRight className="w-3 h-3 shrink-0" />
                        <span className="text-brand">Caso</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        {case_.external_id && (
                            <span className="text-[11px] font-mono text-muted-foreground shrink-0">{case_.external_id}</span>
                        )}
                        <h2 className="text-lg font-bold text-foreground leading-tight">{case_.title}</h2>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0"
                    aria-label="Fechar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
                {/* Badges: prioridade + último status */}
                <div className="flex flex-wrap items-center gap-2">
                    {prio && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${prio.color}`}>
                            {prio.label}
                        </span>
                    )}
                    {run && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${run.color}`}>
                            {run.label}
                        </span>
                    )}
                    {case_.last_run_at && (
                        <span className="text-[11px] text-muted-foreground">
                            Última execução: {formatDate(case_.last_run_at)}
                        </span>
                    )}
                </div>

                {/* Spec: passos + resultado esperado */}
                <Section icon={<FileText className="w-4 h-4 text-brand" />} title="Passos">
                    {case_.steps_summary
                        ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{case_.steps_summary}</p>
                        : <Empty>Nenhum passo descrito.</Empty>}
                </Section>

                <Section icon={<Target className="w-4 h-4 text-brand" />} title="Resultado esperado">
                    {case_.expected_result
                        ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{case_.expected_result}</p>
                        : <Empty>Não informado.</Empty>}
                </Section>

                {/* Execução + evidências (nível sub-fluxo) */}
                <Section
                    icon={<History className="w-4 h-4 text-brand" />}
                    title="Execução & evidências"
                    subtitle="Histórico do teste Maestro vinculado ao sub-fluxo"
                >
                    {!subflow.test_case_id ? (
                        <div className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                            Este sub-fluxo não está vinculado a um teste Maestro, então não há execuções para exibir.
                        </div>
                    ) : loading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando execuções…
                        </div>
                    ) : runs.length === 0 ? (
                        <Empty>Nenhuma execução registrada para o teste vinculado ainda.</Empty>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {runs.map(r => (
                                <RunRow key={r.id} run={r} evidence={evidenceByRun[r.id] || []} />
                            ))}
                        </ul>
                    )}
                </Section>
            </div>
        </motion.div>
    );
}

function RunRow({ run, evidence }: { run: SubflowTestRun; evidence: RunEvidence[] }) {
    const passed = run.status === 'passed';
    const failed = run.status === 'failed';
    const shots = evidence.filter(e => e.screenshot_url);

    return (
        <li className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {passed ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                ) : failed ? (
                    <XCircle className="w-4 h-4 text-danger shrink-0" />
                ) : (
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                )}
                <span className="text-xs font-bold text-foreground capitalize">{statusLabel(run.status)}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">{formatDate(run.started_at)}</span>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {run.duration_ms != null && <span>⏱ {formatDuration(run.duration_ms)}</span>}
                {run.steps_total != null && (
                    <span>
                        {run.steps_passed ?? 0}/{run.steps_total} passos
                        {run.steps_failed ? ` · ${run.steps_failed} falhou` : ''}
                    </span>
                )}
                {run.triggered_by && <span>via {run.triggered_by}</span>}
            </div>

            {run.error_message && (
                <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1 leading-snug">{run.error_message}</p>
            )}

            {/* Evidências: thumbnails de screenshot + links de PDF/Jira */}
            {(shots.length > 0 || evidence.some(e => e.pdf_url || e.jira_url)) && (
                <div className="flex flex-col gap-2 pt-1">
                    {shots.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {shots.map(e => (
                                <a
                                    key={e.id}
                                    href={e.screenshot_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative w-16 h-16 rounded-md overflow-hidden border border-border hover:border-brand/50"
                                    title={e.title}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={e.screenshot_url || ''} alt={e.title} className="w-full h-full object-cover" />
                                    <span className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
                                </a>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {evidence.map(e => (
                            <span key={`links-${e.id}`} className="contents">
                                {e.pdf_url && (
                                    <a href={e.pdf_url} target="_blank" rel="noopener noreferrer"
                                       className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                                        <FileText className="w-3 h-3" /> PDF
                                    </a>
                                )}
                                {e.jira_url && (
                                    <a href={e.jira_url} target="_blank" rel="noopener noreferrer"
                                       className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                                        <ExternalLink className="w-3 h-3" /> Jira
                                    </a>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {failed && shots.length === 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <ImageIcon className="w-3 h-3" /> Sem evidência anexada para esta execução.
                </div>
            )}
        </li>
    );
}

function Section({ icon, title, subtitle, children }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {icon}
                <h3 className="text-sm font-bold text-foreground">{title}</h3>
            </div>
            {subtitle && <p className="text-[11px] text-muted-foreground -mt-1">{subtitle}</p>}
            {children}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-muted-foreground italic">{children}</p>;
}

function statusLabel(status: SubflowTestRun['status']): string {
    switch (status) {
        case 'passed': return 'Passou';
        case 'failed': return 'Falhou';
        case 'running': return 'Em execução';
        case 'cancelled': return 'Cancelado';
        default: return status;
    }
}

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}
