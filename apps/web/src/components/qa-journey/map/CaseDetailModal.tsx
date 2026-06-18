'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    ExternalLink,
    FileCode2,
    FileText,
    History,
    Image as ImageIcon,
    Link2,
    Loader2,
    Paperclip,
    Target,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import { PRIORITY_OPTIONS, RUN_STATUS_DISPLAY, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { errorMessage, updateCase, uploadCaseEvidence, type TestCaseOption } from '@/lib/qa-journey/api';
import { GherkinView } from '@/components/qa-journey/GherkinEditor';
import { loadSubflowRuns, type RunEvidence, type SubflowTestRun } from '@/lib/qa-journey/runs';
import type { CaseRunStatus, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface CaseDetailModalProps {
    subflow: QAJourneySubflow;
    case_: QAJourneyCase;
    // Opcional: usado para exibir o NOME do teste Maestro vinculado ao sub-fluxo.
    testCases?: TestCaseOption[];
    /** Volta para o drawer do sub-fluxo (mantém-no aberto atrás). */
    onBack: () => void;
    /** Fecha o modal e o drawer do sub-fluxo. */
    onClose: () => void;
    /** Propaga o caso atualizado (registro manual de execução) ao pai. */
    onCaseUpdated?: (updated: QAJourneyCase) => void;
}

// Modal central de detalhe de um caso de teste: spec (passos + resultado
// esperado), registro MANUAL do resultado da execução (pass/fail/...) e o
// histórico de execuções automatizadas do teste Maestro vinculado ao
// sub-fluxo, quando existir.
export function CaseDetailModal({ subflow, case_, testCases, onBack, onClose, onCaseUpdated }: CaseDetailModalProps) {
    // Cópia local para refletir o registro de execução na hora, mesmo se o
    // pai não repassar onCaseUpdated.
    const [current, setCurrent] = useState<QAJourneyCase>(case_);
    useEffect(() => { setCurrent(case_); }, [case_]);

    // Automatizado = CASO com teste Maestro vinculado (test_case_id).
    const isAutomated = Boolean(current.test_case_id);
    const linkedTest = testCases?.find(t => t.id === current.test_case_id);
    // Teste Maestro cujo histórico de execução exibimos: o vínculo do CASO tem
    // prioridade; cai para o do sub-fluxo (modelos antigos) quando ausente.
    const linkedTestId = current.test_case_id || subflow.test_case_id || null;
    // Caso escrito em Gherkin → exibimos o código do cenário em vez de passos.
    const isGherkin = current.writing_mode === 'gherkin' || Boolean(current.gherkin && current.gherkin.trim());

    const prio = PRIORITY_OPTIONS.find(o => o.value === current.priority);

    const [savingStatus, setSavingStatus] = useState<CaseRunStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);

    const [uploadingEvidence, setUploadingEvidence] = useState(false);
    const evidenceInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [runs, setRuns] = useState<SubflowTestRun[]>([]);
    const [evidenceByRun, setEvidenceByRun] = useState<Record<string, RunEvidence[]>>({});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setRuns([]);
        setEvidenceByRun({});
        (async () => {
            const res = await loadSubflowRuns(linkedTestId);
            if (cancelled) return;
            setRuns(res.runs);
            setEvidenceByRun(res.evidenceByRun);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [linkedTestId, case_.id]);

    // Snapshot dos campos atuais — updateCase regrava o registro inteiro.
    const baseDraft = () => ({
        subflow_id: current.subflow_id,
        external_id: current.external_id,
        title: current.title,
        steps_summary: current.steps_summary,
        expected_result: current.expected_result,
        priority: current.priority,
        platform: current.platform,
        last_run_status: current.last_run_status,
        last_run_at: current.last_run_at,
    });

    const recordResult = async (status: CaseRunStatus) => {
        if (savingStatus) return;
        setSavingStatus(status);
        setStatusError(null);
        try {
            const updated = await updateCase(current.id, {
                ...baseDraft(),
                last_run_status: status,
                last_run_at: new Date().toISOString(),
            });
            setCurrent(updated);
            onCaseUpdated?.(updated);
        } catch (e) {
            setStatusError(errorMessage(e));
        } finally {
            setSavingStatus(null);
        }
    };

    const attachEvidence = async (file: File | undefined) => {
        if (!file || uploadingEvidence) return;
        if (file.size > 50 * 1024 * 1024) {
            setStatusError('Evidência muito grande (máx. 50 MB).');
            return;
        }
        setUploadingEvidence(true);
        setStatusError(null);
        try {
            const { url, type } = await uploadCaseEvidence(current.id, file);
            const updated = await updateCase(current.id, {
                ...baseDraft(),
                evidence_url: url,
                evidence_type: type,
            });
            setCurrent(updated);
            onCaseUpdated?.(updated);
        } catch (e) {
            setStatusError(errorMessage(e));
        } finally {
            setUploadingEvidence(false);
        }
    };

    const removeEvidence = async () => {
        if (uploadingEvidence) return;
        setUploadingEvidence(true);
        setStatusError(null);
        try {
            const updated = await updateCase(current.id, {
                ...baseDraft(),
                evidence_url: null,
                evidence_type: null,
            });
            setCurrent(updated);
            onCaseUpdated?.(updated);
        } catch (e) {
            setStatusError(errorMessage(e));
        } finally {
            setUploadingEvidence(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
            >
                {/* Header com breadcrumb + voltar */}
                <div className="p-5 border-b border-border flex items-start gap-3">
                    <button
                        onClick={onBack}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0 mt-0.5"
                        aria-label="Voltar para o sub-fluxo"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1 truncate">
                            <button onClick={onBack} className="hover:text-foreground truncate">{subflow.title}</button>
                            <ChevronRight className="w-3 h-3 shrink-0" />
                            <span className="text-brand">Caso</span>
                        </div>
                        <h2 className="text-lg font-bold text-foreground leading-snug mt-1 break-words">{current.title}</h2>
                        {current.external_id && (
                            <span className="block text-[11px] font-mono text-muted-foreground truncate mt-0.5" title={current.external_id}>
                                {current.external_id}
                            </span>
                        )}
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
                    {/* Badges: tipo (manual/automatizado) + plataforma + prioridade + último status */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAutomated ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-400'}`}>
                            {isAutomated ? 'Automatizado' : 'Manual'}
                        </span>
                        {isAutomated && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground/5 border border-border text-muted-foreground">
                                <Link2 className="w-3 h-3 text-brand" />
                                Maestro: <span className="text-foreground font-semibold">{linkedTest?.name || current.test_case_id}</span>
                            </span>
                        )}
                        {current.platform && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-brand/15 text-brand">
                                {current.platform}
                            </span>
                        )}
                        {prio && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${prio.color}`}>
                                {prio.label}
                            </span>
                        )}
                        {current.last_run_status && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                RUN_STATUS_OPTIONS.find(o => o.value === current.last_run_status)?.color || ''
                            }`}>
                                {RUN_STATUS_DISPLAY[current.last_run_status]}
                            </span>
                        )}
                        {current.last_run_at && (
                            <span className="text-[11px] text-muted-foreground">
                                Última execução: {formatDate(current.last_run_at)}
                            </span>
                        )}
                    </div>

                    {/* Spec — adapta-se ao modo de escrita do caso */}
                    {isGherkin ? (
                        <Section icon={<FileCode2 className="w-4 h-4 text-brand" />} title="Cenário Gherkin">
                            {current.gherkin && current.gherkin.trim()
                                ? <GherkinView value={current.gherkin} />
                                : <Empty>Nenhum cenário Gherkin informado.</Empty>}
                        </Section>
                    ) : (
                        <>
                            {current.description && current.description.trim() && (
                                <Section icon={<FileText className="w-4 h-4 text-brand" />} title="Descrição">
                                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{current.description}</p>
                                </Section>
                            )}
                            <Section icon={<FileText className="w-4 h-4 text-brand" />} title="Passos">
                                {current.steps_summary
                                    ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{current.steps_summary}</p>
                                    : <Empty>Nenhum passo descrito.</Empty>}
                            </Section>

                            <Section icon={<Target className="w-4 h-4 text-brand" />} title="Resultado esperado">
                                {current.expected_result
                                    ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{current.expected_result}</p>
                                    : <Empty>Não informado.</Empty>}
                            </Section>
                        </>
                    )}

                    {/* Registro manual do resultado + evidência */}
                    <Section
                        icon={<ClipboardCheck className="w-4 h-4 text-brand" />}
                        title="Registrar execução"
                        subtitle="Executou este caso manualmente? Registre o resultado e anexe a evidência."
                    >
                        <div className="flex flex-wrap gap-2">
                            {RUN_STATUS_OPTIONS.map(opt => {
                                const isCurrent = current.last_run_status === opt.value;
                                const isSaving = savingStatus === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => recordResult(opt.value)}
                                        disabled={savingStatus !== null}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide border transition-all disabled:opacity-60 ${
                                            isCurrent
                                                ? `${opt.color} border-transparent ring-2 ring-current/20`
                                                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                        title={opt.label}
                                    >
                                        {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {RUN_STATUS_DISPLAY[opt.value]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Evidência (imagem ou vídeo) */}
                        <div className="flex flex-col gap-2 pt-1">
                            <input
                                ref={evidenceInputRef}
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={e => { attachEvidence(e.target.files?.[0]); e.target.value = ''; }}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => evidenceInputRef.current?.click()}
                                    disabled={uploadingEvidence}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-60"
                                >
                                    {uploadingEvidence
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Paperclip className="w-3 h-3" />}
                                    {current.evidence_url ? 'Substituir evidência' : 'Anexar evidência (imagem/vídeo)'}
                                </button>
                                {current.evidence_url && (
                                    <button
                                        type="button"
                                        onClick={removeEvidence}
                                        disabled={uploadingEvidence}
                                        className="inline-flex items-center gap-1 text-[11px] text-danger hover:underline disabled:opacity-60"
                                    >
                                        <Trash2 className="w-3 h-3" /> Remover
                                    </button>
                                )}
                            </div>

                            {current.evidence_url && (
                                current.evidence_type === 'video' ? (
                                    <video
                                        src={current.evidence_url}
                                        controls
                                        className="w-full max-w-xs rounded-lg border border-border"
                                    />
                                ) : (
                                    <a
                                        href={current.evidence_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative w-32 h-24 rounded-lg overflow-hidden border border-border hover:border-brand/50 self-start"
                                        title="Abrir evidência em tamanho real"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={current.evidence_url}
                                            alt={`Evidência de ${current.title}`}
                                            className="w-full h-full object-cover"
                                        />
                                        <span className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
                                    </a>
                                )
                            )}
                        </div>

                        {statusError && (
                            <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1 whitespace-pre-wrap">{statusError}</p>
                        )}
                    </Section>

                    {/* Execução + evidências automatizadas (nível sub-fluxo) */}
                    <Section
                        icon={<History className="w-4 h-4 text-brand" />}
                        title="Execuções automatizadas"
                        subtitle={linkedTest ? `Histórico do teste Maestro: ${linkedTest.name}` : 'Histórico do teste Maestro vinculado'}
                    >
                        {!linkedTestId ? (
                            <div className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                                <Link2 className="w-3.5 h-3.5 shrink-0" />
                                Sem teste Maestro vinculado a este caso — use &quot;Registrar execução&quot; acima para acompanhar o resultado manual.
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
        </div>
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
