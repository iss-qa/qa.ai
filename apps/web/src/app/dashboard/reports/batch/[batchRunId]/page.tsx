'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Download, CheckCircle2, XCircle, Loader2, Layers, Clock, Smartphone,
    Calendar, FileCode2, AlertTriangle, ImageIcon, ExternalLink, FileText,
} from 'lucide-react';

const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

interface Evidence { title?: string; severity?: string; screenshot_url?: string | null; pdf_url?: string | null; jira_url?: string | null; }
interface Shot { step_order: number; screenshot_url: string; status?: string }
interface BatchTest {
    test_run_id: string; test_case_id: string | null; name: string; app_id: string | null;
    folder_path: string | null; raw_yaml: string | null; status: string; duration_ms: number | null;
    started_at: string | null; ended_at: string | null; error_message: string | null;
    steps_total: number | null; steps_passed: number | null; steps_failed: number | null;
    evidence: Evidence[];
    screenshots?: Shot[];
}

// Legenda do screenshot a partir da URL (remove prefixo de índice "NN_").
function shotCaption(url: string): string {
    try {
        const base = decodeURIComponent(url.split('/').pop() || '');
        return base.replace(/^\d+_/, '').replace(/\.(png|jpe?g|webp)$/i, '');
    } catch { return ''; }
}
interface Batch {
    id: string; name: string | null; status: string; triggered_by: string | null;
    device_udid: string | null; total_tests: number; passed_tests: number; failed_tests: number;
    started_at: string | null; ended_at: string | null; duration_ms: number | null;
}

function fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
    } catch { return iso; }
}
function fmtDur(ms: number | null): string {
    if (ms == null) return '—';
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${Math.round(s % 60)}s`;
}

export default function BatchReportPage() {
    const params = useParams();
    const batchRunId = String(params?.batchRunId || '');
    const [batch, setBatch] = useState<Batch | null>(null);
    const [tests, setTests] = useState<BatchTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!batchRunId) return;
        (async () => {
            try {
                const res = await fetch(`${DAEMON}/api/batches/${batchRunId}/report`);
                if (!res.ok) { setError(`Não foi possível carregar o lote (${res.status}).`); return; }
                const data = await res.json();
                setBatch(data.batch);
                setTests(Array.isArray(data.tests) ? data.tests : []);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        })();
    }, [batchRunId]);

    if (loading) {
        return <div className="flex items-center justify-center h-64 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando relatório…</div>;
    }
    if (error || !batch) {
        return (
            <div className="p-6">
                <p className="text-sm text-danger">{error || 'Lote não encontrado.'}</p>
                <Link href="/dashboard/reports" className="text-xs text-brand hover:underline mt-2 inline-block">← Relatórios gerais</Link>
            </div>
        );
    }

    const total = batch.total_tests || tests.length;
    const passed = batch.passed_tests ?? tests.filter(t => t.status === 'passed').length;
    const failed = batch.failed_tests ?? tests.filter(t => t.status === 'failed').length;
    const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const allOk = failed === 0 && passed === total && total > 0;
    const barColor = allOk ? 'bg-green-500' : failed > 0 ? 'bg-red-500' : 'bg-amber-500';
    const shortId = `#BATCH-${batchRunId.slice(0, 8).toUpperCase()}`;
    // Um lote pode rodar testes de apps diferentes — lista todos os appIds únicos.
    const appIds = Array.from(new Set(tests.map(t => t.app_id).filter(Boolean))) as string[];
    const appLabel = appIds.length > 0 ? appIds.join(', ') : (batch.device_udid || '—');

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Print isolation: imprime só o #batch-report */}
            <style>{`@media print {
                body * { visibility: hidden !important; }
                #batch-report, #batch-report * { visibility: visible !important; }
                .no-print { display: none !important; }
                .pdf-section { break-inside: avoid; page-break-inside: avoid; }
                pre { white-space: pre-wrap !important; }
                /* App é dark-theme; força tokens CLAROS só no relatório p/ o PDF
                   ficar legível (texto escuro em fundo branco). Cores fixas
                   (verde/vermelho) permanecem. print-color-adjust mantém os
                   fundos coloridos (barra/badges) na impressão. */
                #batch-report {
                    position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                    background: #fff;
                    --background: 255 255 255;
                    --foreground: 15 23 42;
                    --card: 255 255 255;
                    --card-foreground: 15 23 42;
                    --popover: 255 255 255;
                    --surface: 255 255 255;
                    --surface-muted: 238 242 247;
                    --muted: 239 243 248;
                    --muted-foreground: 100 116 139;
                    --border: 226 232 240;
                }
            }`}</style>

            {/* Toolbar (não imprime) */}
            <div className="no-print flex items-center justify-between mb-5 gap-3 flex-wrap">
                <Link href="/dashboard/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" /> Relatórios gerais
                </Link>
                <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 transition-colors"
                >
                    <Download className="w-4 h-4" /> Baixar PDF
                </button>
            </div>

            <div id="batch-report" className="max-w-4xl mx-auto flex flex-col gap-6">
                {/* Capa / cabeçalho */}
                <section className="pdf-section border border-border rounded-2xl p-6 bg-card">
                    <div className="flex items-center gap-2 text-brand mb-1">
                        <Layers className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">Relatório de Execução em Lote</span>
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">{batch.name || 'Lote de testes'}</h1>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                        <Meta icon={<FileText className="w-3.5 h-3.5" />} label="ID do Lote" value={shortId} mono />
                        <Meta icon={<Calendar className="w-3.5 h-3.5" />} label="Início" value={fmtDateTime(batch.started_at)} />
                        <Meta icon={<Clock className="w-3.5 h-3.5" />} label="Duração total" value={fmtDur(batch.duration_ms)} />
                        <Meta icon={<Smartphone className="w-3.5 h-3.5" />} label={appIds.length > 1 ? 'Alvos / Apps' : 'Alvo / App'} value={appLabel} mono />
                    </div>
                </section>

                {/* Métricas */}
                <section className="pdf-section grid grid-cols-3 gap-3">
                    <Kpi label="Total" value={total} tone="muted" />
                    <Kpi label="Sucessos" value={`${passed} (${passPct}%)`} tone="success" />
                    <Kpi label="Falhas" value={`${failed} (${total ? Math.round((failed / total) * 100) : 0}%)`} tone="danger" />
                    <div className="col-span-3">
                        <div className="h-2.5 rounded-full bg-foreground/10 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${passPct}%` }} />
                        </div>
                    </div>
                </section>

                {/* Sumário executivo */}
                <section className="pdf-section border border-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-surface-muted">
                        <h2 className="text-sm font-bold text-foreground">Sumário executivo</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border">
                                    <th className="px-4 py-2 font-bold">#</th>
                                    <th className="px-4 py-2 font-bold">Teste</th>
                                    <th className="px-4 py-2 font-bold">Duração</th>
                                    <th className="px-4 py-2 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tests.map((t, i) => (
                                    <tr key={t.test_run_id} className="border-b border-border/60">
                                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                                        <td className="px-4 py-2 text-foreground">{t.name}</td>
                                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDur(t.duration_ms)}</td>
                                        <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Detalhe por teste */}
                {tests.map((t, i) => (
                    <section key={t.test_run_id} className="pdf-section border border-border rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 bg-surface-muted">
                            <h3 className="text-sm font-bold text-foreground truncate">{i + 1}. {t.name}</h3>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] text-muted-foreground tabular-nums inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDur(t.duration_ms)}</span>
                                <StatusBadge status={t.status} />
                            </div>
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                                {t.app_id && <span>App: <span className="font-mono text-foreground">{t.app_id}</span></span>}
                                {t.folder_path && <span>Pasta: <span className="font-mono text-foreground">{t.folder_path}/</span></span>}
                                {t.steps_total != null && <span>Passos: {t.steps_passed ?? 0}/{t.steps_total}{t.steps_failed ? ` · ${t.steps_failed} falhou` : ''}</span>}
                                <span>Início: {fmtDateTime(t.started_at)}</span>
                            </div>

                            {/* Erro / log de falha */}
                            {t.status === 'failed' && t.error_message && (
                                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-danger mb-1">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Log da falha
                                    </div>
                                    <pre className="text-[11px] text-danger font-mono whitespace-pre-wrap break-words leading-relaxed">{t.error_message}</pre>
                                </div>
                            )}

                            {/* Código executado (YAML) */}
                            <div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mb-1.5">
                                    <FileCode2 className="w-3.5 h-3.5 text-brand" /> Código executado (YAML)
                                </div>
                                {t.raw_yaml ? (
                                    <pre className="text-[11px] font-mono leading-relaxed bg-foreground/[0.03] border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words text-foreground">{t.raw_yaml}</pre>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground italic">YAML não disponível para este teste.</p>
                                )}
                            </div>

                            {/* Evidências */}
                            <div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mb-1.5">
                                    <ImageIcon className="w-3.5 h-3.5 text-brand" /> Evidências
                                </div>
                                {(t.screenshots && t.screenshots.length > 0) || (t.evidence && t.evidence.length > 0) ? (
                                    <div className="flex flex-col gap-3">
                                        {/* Screenshots do takeScreenshot (run_steps) — em ordem, com legenda */}
                                        {t.screenshots && t.screenshots.length > 0 && (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {t.screenshots.map((s, k) => (
                                                    <figure key={`s${k}`} className="pdf-section flex flex-col gap-1">
                                                        <a href={s.screenshot_url} target="_blank" rel="noopener noreferrer">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={s.screenshot_url} alt={shotCaption(s.screenshot_url)}
                                                                className="w-full rounded-lg border border-border" />
                                                        </a>
                                                        <figcaption className="text-[10px] text-muted-foreground font-mono truncate">
                                                            {k + 1}. {shotCaption(s.screenshot_url)}
                                                        </figcaption>
                                                    </figure>
                                                ))}
                                            </div>
                                        )}
                                        {/* Evidências de bug_reports (screenshot/PDF/Jira) */}
                                        {t.evidence && t.evidence.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-wrap gap-2">
                                                    {t.evidence.filter(e => e.screenshot_url).map((e, k) => (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img key={k} src={e.screenshot_url || ''} alt={e.title || 'evidência'}
                                                            className="w-40 rounded-lg border border-border" />
                                                    ))}
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                    {t.evidence.map((e, k) => (
                                                        <span key={`l${k}`} className="contents">
                                                            {e.pdf_url && <a href={e.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"><FileText className="w-3 h-3" />PDF</a>}
                                                            {e.jira_url && <a href={e.jira_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Jira</a>}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground italic">
                                        Sem evidências. Adicione <span className="font-mono">- takeScreenshot</span> no YAML para gerar imagens por passo.
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>
                ))}

                <p className="text-[10px] text-muted-foreground text-center pt-2">
                    Gerado por QAMind · {fmtDateTime(new Date().toISOString())}
                </p>
            </div>
        </div>
    );
}

function Meta({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">{icon}{label}</span>
            <span className={`text-xs text-foreground ${mono ? 'font-mono' : 'font-medium'} truncate`}>{value}</span>
        </div>
    );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone: 'muted' | 'success' | 'danger' }) {
    const color = tone === 'success' ? 'text-green-500' : tone === 'danger' ? 'text-red-500' : 'text-foreground';
    return (
        <div className="border border-border rounded-xl p-3 bg-card text-center">
            <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'passed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-500"><CheckCircle2 className="w-3 h-3" />PASSOU</span>;
    if (status === 'failed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-500"><XCircle className="w-3 h-3" />FALHOU</span>;
    if (status === 'running') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-brand"><Loader2 className="w-3 h-3 animate-spin" />EXECUTANDO</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-muted-foreground">{(status || 'pendente').toUpperCase()}</span>;
}
