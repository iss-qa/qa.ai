'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowLeft,
    Bug,
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
    Play,
    Target,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import { PRIORITY_OPTIONS, RUN_STATUS_DISPLAY, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { errorMessage, updateCase, uploadCaseEvidence, type TestCaseOption } from '@/lib/qa-journey/api';
import { createJiraBugForCase, type CreatedJiraBug } from '@/lib/qa-journey/jira';
import { GherkinView } from '@/components/qa-journey/GherkinEditor';
import { formatExternalId } from '@/components/qa-journey/columns/helpers';
import { loadSubflowRuns, type RunEvidence, type SubflowTestRun } from '@/lib/qa-journey/runs';
import { supabase } from '@/lib/supabase';
import type { CaseRunStatus, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface CaseDetailModalProps {
    subflow: QAJourneySubflow;
    case_: QAJourneyCase;
    testCases?: TestCaseOption[];
    onBack: () => void;
    onClose: () => void;
    onCaseUpdated?: (updated: QAJourneyCase) => void;
    onDelete?: () => void;
}

interface WebRunResult {
    id: string;
    status: string | null;
    duration_ms: number | null;
    error_message: string | null;
    spec_file: string | null;
    web_test_runs: {
        status: string;
        gh_run_url: string | null;
        branch: string | null;
        commit_sha: string | null;
        ended_at: string | null;
        passed: number;
        failed: number;
        total: number;
    } | null;
}

export function CaseDetailModal({ subflow, case_, testCases, onBack, onClose, onCaseUpdated, onDelete }: CaseDetailModalProps) {
    const [current, setCurrent] = useState<QAJourneyCase>(case_);

    const [failDescription, setFailDescription] = useState('');
    const [creatingBug, setCreatingBug] = useState(false);
    const [createdBug, setCreatedBug] = useState<CreatedJiraBug | null>(null);
    const [bugError, setBugError] = useState<string | null>(null);

    useEffect(() => {
        setCurrent(case_);
        setFailDescription('');
        setCreatedBug(null);
        setBugError(null);
    }, [case_]);

    // Detecta motor de automação: Playwright (Web) ou Maestro (Mobile).
    const isPlaywright = current.automation_engine === 'playwright'
        && Boolean(current.playwright_spec || current.playwright_repo);
    const isAutomated = Boolean(current.test_case_id) || isPlaywright;
    const linkedTest = testCases?.find(t => t.id === current.test_case_id);
    const linkedTestId = current.test_case_id || subflow.test_case_id || null;
    const isGherkin = current.writing_mode === 'gherkin' || Boolean(current.gherkin && current.gherkin.trim());

    const prio = PRIORITY_OPTIONS.find(o => o.value === current.priority);

    const [savingStatus, setSavingStatus] = useState<CaseRunStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);

    const [uploadingEvidence, setUploadingEvidence] = useState(false);
    const evidenceInputRef = useRef<HTMLInputElement>(null);

    // Histórico Maestro (mobile)
    const [loading, setLoading] = useState(true);
    const [runs, setRuns] = useState<SubflowTestRun[]>([]);
    const [evidenceByRun, setEvidenceByRun] = useState<Record<string, RunEvidence[]>>({});

    // Histórico Playwright (web)
    const [webRuns, setWebRuns] = useState<WebRunResult[]>([]);
    const [webRunsLoading, setWebRunsLoading] = useState(false);

    useEffect(() => {
        if (isPlaywright) {
            setWebRunsLoading(true);
            supabase
                .from('web_test_results')
                .select('id, status, duration_ms, error_message, spec_file, web_test_runs(status, gh_run_url, branch, commit_sha, ended_at, passed, failed, total)')
                .eq('qa_journey_case_id', current.id)
                .order('created_at', { ascending: false })
                .limit(10)
                .then(({ data }) => {
                    setWebRuns((data as unknown as WebRunResult[]) || []);
                    setWebRunsLoading(false);
                });
        } else {
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
        }
    }, [isPlaywright, linkedTestId, current.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Último run web (para auto-mostrar o status no "Registrar execução")
    const latestWebRun = webRuns[0] ?? null;

    // Quando os runs web carregam, sincroniza last_run_status se o caso ainda
    // não tiver status ou o status do CI for mais recente.
    useEffect(() => {
        if (!latestWebRun || !isPlaywright) return;
        const ciStatus = latestWebRun.status === 'passed' ? 'pass' as const
            : latestWebRun.status === 'failed' || latestWebRun.status === 'timedOut' ? 'fail' as const
            : null;
        if (!ciStatus) return;
        // Só sincroniza se o caso não tiver status ou o CI foi depois do último registro manual.
        const ciDate = latestWebRun.web_test_runs?.ended_at;
        const manualDate = current.last_run_at;
        const ciIsNewer = ciDate && (!manualDate || new Date(ciDate) > new Date(manualDate));
        if (ciIsNewer && current.last_run_status !== ciStatus) {
            void updateCase(current.id, {
                ...baseDraft(),
                last_run_status: ciStatus,
                last_run_at: ciDate!,
            }).then(updated => {
                setCurrent(updated);
                onCaseUpdated?.(updated);
            }).catch(() => {/* silently ignore — status visual ainda atualiza */});
            setCurrent(c => ({ ...c, last_run_status: ciStatus, last_run_at: ciDate! }));
        }
    }, [latestWebRun]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const openJiraBug = async () => {
        if (creatingBug || createdBug) return;
        setCreatingBug(true);
        setBugError(null);
        try {
            const bug = await createJiraBugForCase(current.id, failDescription);
            setCreatedBug(bug);
        } catch (e) {
            setBugError(errorMessage(e));
        } finally {
            setCreatingBug(false);
        }
    };

    const attachEvidence = async (file: File | undefined) => {
        if (!file || uploadingEvidence) return;
        if (file.size > 50 * 1024 * 1024) { setStatusError('Evidência muito grande (máx. 50 MB).'); return; }
        setUploadingEvidence(true);
        setStatusError(null);
        try {
            const { url, type } = await uploadCaseEvidence(current.id, file);
            const updated = await updateCase(current.id, { ...baseDraft(), evidence_url: url, evidence_type: type });
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
            const updated = await updateCase(current.id, { ...baseDraft(), evidence_url: null, evidence_type: null });
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
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
            >
                {/* Header */}
                <div className="p-5 border-b border-border flex items-start gap-3">
                    <button onClick={onBack} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0 mt-0.5" aria-label="Voltar">
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
                            <span className="block text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                                {formatExternalId(current.external_id)}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0" aria-label="Fechar">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAutomated ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-400'}`}>
                            {isAutomated ? 'Automatizado' : 'Manual'}
                        </span>
                        {/* Vínculo Playwright */}
                        {isPlaywright && current.playwright_spec && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground/5 border border-border text-muted-foreground">
                                <Play className="w-3 h-3 text-brand" />
                                Playwright: <span className="text-foreground font-semibold font-mono">{current.playwright_spec.split('/').pop()}</span>
                            </span>
                        )}
                        {/* Vínculo Maestro */}
                        {!isPlaywright && isAutomated && (
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
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${RUN_STATUS_OPTIONS.find(o => o.value === current.last_run_status)?.color || ''}`}>
                                {RUN_STATUS_DISPLAY[current.last_run_status]}
                            </span>
                        )}
                        {current.last_run_at && (
                            <span className="text-[11px] text-muted-foreground">Última execução: {formatDate(current.last_run_at)}</span>
                        )}
                    </div>

                    {/* Spec */}
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

                    {/* Registrar execução */}
                    <Section
                        icon={<ClipboardCheck className="w-4 h-4 text-brand" />}
                        title="Registrar execução"
                        subtitle={isPlaywright
                            ? 'O CI atualiza o status automaticamente. Registre manualmente se testou em outro ambiente.'
                            : 'Executou este caso manualmente? Registre o resultado e anexe a evidência.'}
                    >
                        {/* Banner do último run CI (apenas Playwright) */}
                        {isPlaywright && latestWebRun && (
                            <div className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
                                latestWebRun.status === 'passed' ? 'bg-success/10 border-success/30 text-success' :
                                latestWebRun.status === 'failed' ? 'bg-danger/10 border-danger/30 text-danger' :
                                'bg-foreground/5 border-border text-muted-foreground'
                            }`}>
                                {latestWebRun.status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> :
                                 latestWebRun.status === 'failed' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> :
                                 <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                <span>
                                    Último CI: <strong>{latestWebRun.status === 'passed' ? 'Passou' : latestWebRun.status === 'failed' ? 'Falhou' : latestWebRun.status}</strong>
                                    {latestWebRun.web_test_runs?.ended_at && ` · ${formatDate(latestWebRun.web_test_runs.ended_at)}`}
                                    {latestWebRun.duration_ms && ` · ${formatDuration(latestWebRun.duration_ms)}`}
                                </span>
                                {latestWebRun.web_test_runs?.gh_run_url && (
                                    <a href={latestWebRun.web_test_runs.gh_run_url} target="_blank" rel="noreferrer"
                                        className="ml-auto inline-flex items-center gap-1 font-bold hover:underline shrink-0">
                                        GitHub Actions <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {RUN_STATUS_OPTIONS.map(opt => {
                                const isCurrent = current.last_run_status === opt.value;
                                const isSaving = savingStatus === opt.value;
                                return (
                                    <button key={opt.value} type="button" onClick={() => recordResult(opt.value)}
                                        disabled={savingStatus !== null}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide border transition-all disabled:opacity-60 ${
                                            isCurrent ? `${opt.color} border-transparent ring-2 ring-current/20` : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                    >
                                        {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {RUN_STATUS_DISPLAY[opt.value]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Falhou → descrição + Jira (funciona para Web e Mobile) */}
                        {current.last_run_status === 'fail' && (
                            <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3">
                                <div className="flex items-center gap-2">
                                    <Bug className="w-4 h-4 text-red-500" />
                                    <h4 className="text-xs font-bold text-red-500">Abrir bug no Jira</h4>
                                </div>
                                <p className="text-[11px] text-muted-foreground -mt-1">
                                    Descreva o problema. O título{isGherkin ? ', o cenário Gherkin' : ' e os passos'} são incluídos automaticamente.
                                    {isPlaywright && latestWebRun?.web_test_runs?.gh_run_url && (
                                        <> O link do <a href={latestWebRun.web_test_runs.gh_run_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">GitHub Actions</a> também será anexado.</>
                                    )}
                                </p>
                                <textarea
                                    value={failDescription}
                                    onChange={e => setFailDescription(e.target.value)}
                                    rows={4}
                                    placeholder="Ex.: ao preencher o formulário de cadastro, o botão Enviar não respondia ao clique no Chrome."
                                    disabled={creatingBug || Boolean(createdBug)}
                                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                                />
                                {createdBug ? (
                                    <div className="flex items-center gap-1.5 text-[11px] text-green-500">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        Bug criado:
                                        <a href={createdBug.url} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
                                            {createdBug.key} <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                ) : (
                                    <button type="button" onClick={openJiraBug} disabled={creatingBug}
                                        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-500/90 text-white hover:bg-red-500 transition-colors disabled:opacity-60">
                                        {creatingBug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bug className="w-3.5 h-3.5" />}
                                        {creatingBug ? 'Abrindo bug…' : 'Abrir bug no Jira'}
                                    </button>
                                )}
                                {bugError && <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1 whitespace-pre-wrap">{bugError}</p>}
                            </div>
                        )}

                        {/* Evidência (imagem/vídeo) */}
                        <div className="flex flex-col gap-2 pt-1">
                            <input ref={evidenceInputRef} type="file" accept="image/*,video/*" className="hidden"
                                onChange={e => { attachEvidence(e.target.files?.[0]); e.target.value = ''; }} />
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => evidenceInputRef.current?.click()} disabled={uploadingEvidence}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-60">
                                    {uploadingEvidence ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                                    {current.evidence_url ? 'Substituir evidência' : 'Anexar evidência (imagem/vídeo)'}
                                </button>
                                {current.evidence_url && (
                                    <button type="button" onClick={removeEvidence} disabled={uploadingEvidence}
                                        className="inline-flex items-center gap-1 text-[11px] text-danger hover:underline disabled:opacity-60">
                                        <Trash2 className="w-3 h-3" /> Remover
                                    </button>
                                )}
                            </div>
                            {current.evidence_url && (
                                current.evidence_type === 'video' ? (
                                    <video src={current.evidence_url} controls className="w-full max-w-xs rounded-lg border border-border" />
                                ) : (
                                    <a href={current.evidence_url} target="_blank" rel="noopener noreferrer"
                                        className="group relative w-32 h-24 rounded-lg overflow-hidden border border-border hover:border-brand/50 self-start">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={current.evidence_url} alt={`Evidência de ${current.title}`} className="w-full h-full object-cover" />
                                        <span className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
                                    </a>
                                )
                            )}
                        </div>

                        {statusError && <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1 whitespace-pre-wrap">{statusError}</p>}
                    </Section>

                    {/* Execuções automatizadas */}
                    {isPlaywright ? (
                        <Section
                            icon={<History className="w-4 h-4 text-brand" />}
                            title="Execuções automatizadas"
                            subtitle={`Histórico Playwright · ${current.playwright_spec || 'spec vinculada'}`}
                        >
                            {webRunsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando execuções…
                                </div>
                            ) : webRuns.length === 0 ? (
                                <div className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                                    <Play className="w-3.5 h-3.5 shrink-0 text-brand" />
                                    Sem execuções registradas ainda — aperte <strong className="text-foreground">Rodar Testes</strong> no projeto para disparar o CI.
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {webRuns.map(r => (
                                        <WebRunRow key={r.id} result={r} />
                                    ))}
                                </ul>
                            )}
                        </Section>
                    ) : (
                        <Section
                            icon={<History className="w-4 h-4 text-brand" />}
                            title="Execuções automatizadas"
                            subtitle={linkedTest ? `Histórico do teste Maestro: ${linkedTest.name}` : 'Histórico do teste Maestro vinculado'}
                        >
                            {!linkedTestId ? (
                                <div className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                    {isAutomated
                                        ? 'Teste vinculado — nenhuma execução registrada ainda.'
                                        : 'Sem teste automatizado vinculado — use "Registrar execução" acima para acompanhar o resultado manual.'}
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
                    )}

                    {/* Zona de perigo */}
                    {onDelete && (
                        <div className="border-t border-danger/20 pt-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Trash2 className="w-4 h-4 text-danger" />
                                <h3 className="text-sm font-bold text-danger">Zona de perigo</h3>
                            </div>
                            <p className="text-[11px] text-muted-foreground -mt-1">
                                Remove este caso do fluxo.{isAutomated ? ' O teste vinculado é preservado.' : ''}
                            </p>
                            <button type="button" onClick={onDelete}
                                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-danger/40 text-danger hover:bg-danger/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> Remover caso do fluxo
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

// ─── Row de resultado Playwright ───────────────────────────────────────────────

function WebRunRow({ result }: { result: WebRunResult }) {
    const run = result.web_test_runs;
    const passed = result.status === 'passed';
    const failed = result.status === 'failed' || result.status === 'timedOut';

    return (
        <li className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
                {passed ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    : failed ? <XCircle className="w-4 h-4 text-danger shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
                <span className={`text-xs font-bold ${passed ? 'text-success' : failed ? 'text-danger' : 'text-warning'}`}>
                    {passed ? 'Passou' : failed ? 'Falhou' : result.status ?? '—'}
                </span>
                {result.duration_ms != null && (
                    <span className="text-[11px] text-muted-foreground">⏱ {formatDuration(result.duration_ms)}</span>
                )}
                {run?.branch && <span className="text-[11px] font-mono text-muted-foreground">{run.branch}</span>}
                {run?.commit_sha && <span className="text-[11px] font-mono text-muted-foreground">{run.commit_sha.slice(0, 7)}</span>}
                {run?.ended_at && <span className="text-[11px] text-muted-foreground ml-auto">{formatDate(run.ended_at)}</span>}
                {run?.gh_run_url && (
                    <a href={run.gh_run_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline font-bold shrink-0">
                        GitHub Actions <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
            {result.error_message && (
                <pre className="text-[11px] text-danger bg-danger/5 border border-danger/20 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-32">{result.error_message}</pre>
            )}
            {run?.gh_run_url && (failed) && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Screenshots e traces disponíveis nos
                    <a href={run.gh_run_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">artifacts do GitHub Actions</a>.
                </p>
            )}
        </li>
    );
}

// ─── Row de resultado Maestro (mobile) ─────────────────────────────────────────

function RunRow({ run, evidence }: { run: SubflowTestRun; evidence: RunEvidence[] }) {
    const passed = run.status === 'passed';
    const failed = run.status === 'failed';
    const shots = evidence.filter(e => e.screenshot_url);
    return (
        <li className="bg-foreground/[0.02] border border-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {passed ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    : failed ? <XCircle className="w-4 h-4 text-danger shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
                <span className="text-xs font-bold text-foreground capitalize">{statusLabel(run.status)}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">{formatDate(run.started_at)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {run.duration_ms != null && <span>⏱ {formatDuration(run.duration_ms)}</span>}
                {run.steps_total != null && <span>{run.steps_passed ?? 0}/{run.steps_total} passos{run.steps_failed ? ` · ${run.steps_failed} falhou` : ''}</span>}
                {run.triggered_by && <span>via {run.triggered_by}</span>}
            </div>
            {run.error_message && <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1 leading-snug">{run.error_message}</p>}
            {(shots.length > 0 || evidence.some(e => e.pdf_url || e.jira_url)) && (
                <div className="flex flex-col gap-2 pt-1">
                    {shots.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {shots.map(e => (
                                <a key={e.id} href={e.screenshot_url || '#'} target="_blank" rel="noopener noreferrer"
                                    className="group relative w-16 h-16 rounded-md overflow-hidden border border-border hover:border-brand/50">
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
                                {e.pdf_url && <a href={e.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"><FileText className="w-3 h-3" /> PDF</a>}
                                {e.jira_url && <a href={e.jira_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"><ExternalLink className="w-3 h-3" /> Jira</a>}
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

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-bold text-foreground">{title}</h3></div>
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
        case 'passed': return 'Passou'; case 'failed': return 'Falhou';
        case 'running': return 'Em execução'; case 'cancelled': return 'Cancelado';
        default: return status;
    }
}

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch { return iso; }
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}
