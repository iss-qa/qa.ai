'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink, ChevronDown, ChevronRight, Image, Film, FileSearch, Paperclip, BarChart2 } from 'lucide-react';
import { getWebRun } from './web-api';
import type { WebRun, WebResult, WebResultAttachment } from './web-types';
import { formatDuration, formatRelative, resultStatusStyle, runStatusStyle } from './web-utils';

interface Props {
    runId: string;
    onClose: () => void;
}

// Agrupa resultados por spec_file preservando a ordem original.
function groupBySpec(results: WebResult[]): Array<{ spec: string; items: WebResult[] }> {
    const map = new Map<string, WebResult[]>();
    for (const r of results) {
        const key = r.spec_file || '(sem spec)';
        const arr = map.get(key) ?? [];
        arr.push(r);
        map.set(key, arr);
    }
    return Array.from(map.entries()).map(([spec, items]) => ({ spec, items }));
}

function attachmentIcon(a: WebResultAttachment) {
    const ct = (a.contentType || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    if (ct.startsWith('image/') || name.includes('screenshot')) return <Image className="w-3.5 h-3.5" />;
    if (ct.startsWith('video/') || name.includes('video')) return <Film className="w-3.5 h-3.5" />;
    if (name.includes('trace')) return <FileSearch className="w-3.5 h-3.5" />;
    return <Paperclip className="w-3.5 h-3.5" />;
}

// Attachments do Playwright em CI têm path local do runner — não acessível.
// Detecta se a URL é acessível externamente (http/https absoluta).
function isAccessibleUrl(path: string | null): boolean {
    return !!path && /^https?:\/\//i.test(path);
}

export function WebRunDetailModal({ runId, onClose }: Props) {
    const [run, setRun] = useState<WebRun | null>(null);
    const [results, setResults] = useState<WebResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());
    const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { run, results } = await getWebRun(runId);
                if (!alive) return;
                setRun(run);
                setResults(results);
                // Abre specs com falha automaticamente
                const failedSpecs = new Set(
                    results.filter(r => r.status === 'failed' || r.status === 'timedOut').map(r => r.spec_file || '')
                );
                setExpandedSpecs(failedSpecs);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [runId]);

    const toggleSpec = (spec: string) => setExpandedSpecs(s => {
        const n = new Set(s); if (n.has(spec)) n.delete(spec); else n.add(spec); return n;
    });
    const toggleTest = (id: string) => setExpandedTests(s => {
        const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
    });

    const st = run ? runStatusStyle(run.status) : null;
    const groups = groupBySpec(results);
    const passRate = run && run.total > 0 ? Math.round((run.passed / run.total) * 100) : null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors z-10">
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="p-5 border-b border-border">
                    <div className="flex items-center gap-3 flex-wrap pr-8">
                        <h2 className="text-lg font-bold text-foreground">Execução Web</h2>
                        {st && <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${st.bg} ${st.text}`}>{st.label}</span>}
                        {run?.gh_run_url && (
                            <a href={run.gh_run_url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline flex items-center gap-1 ml-auto">
                                GitHub Actions <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                    {run && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                            {run.branch && <span className="font-mono bg-foreground/10 px-1.5 py-0.5 rounded">{run.branch}</span>}
                            {run.commit_sha && <span className="font-mono">{run.commit_sha.slice(0, 7)}</span>}
                            {run.ended_at && <span>{formatRelative(run.ended_at)}</span>}
                        </div>
                    )}
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-0">
                    {loading && <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>}
                    {error && <p className="m-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>}
                    {run?.error_message && <p className="mx-4 mt-4 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">{run.error_message}</p>}

                    {/* Métricas */}
                    {run && run.total > 0 && (
                        <div className="p-5 border-b border-border">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                                <BarChart2 className="w-3.5 h-3.5" /> Métricas
                            </p>
                            {/* Barra de pass rate */}
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-muted-foreground">Pass rate</span>
                                    <span className={`text-sm font-bold ${passRate === 100 ? 'text-success' : passRate! >= 80 ? 'text-warning' : 'text-danger'}`}>{passRate}%</span>
                                </div>
                                <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${passRate === 100 ? 'bg-success' : passRate! >= 80 ? 'bg-warning' : 'bg-danger'}`}
                                        style={{ width: `${passRate}%` }}
                                    />
                                </div>
                            </div>
                            {/* Grid de contagens */}
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                {[
                                    { label: 'Total', value: run.total, color: 'text-foreground' },
                                    { label: 'Passou', value: run.passed, color: 'text-success' },
                                    { label: 'Falhou', value: run.failed, color: run.failed > 0 ? 'text-danger' : 'text-muted-foreground' },
                                    { label: 'Flaky', value: run.flaky, color: run.flaky > 0 ? 'text-warning' : 'text-muted-foreground' },
                                    { label: 'Pulados', value: run.skipped, color: 'text-muted-foreground' },
                                    { label: 'Duração', value: formatDuration(run.duration_ms), color: 'text-foreground' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="bg-foreground/5 rounded-lg p-2.5 text-center">
                                        <p className={`text-base font-bold ${color}`}>{value}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                                    </div>
                                ))}
                            </div>
                            {run.gh_run_url && (
                                <p className="mt-3 text-[11px] text-muted-foreground">
                                    Screenshots, vídeos e traces estão nos <a href={run.gh_run_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">artifacts do GitHub Actions <ExternalLink className="w-3 h-3 inline" /></a>.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Resultados agrupados por spec */}
                    {!loading && !error && results.length > 0 && (
                        <div className="p-4 flex flex-col gap-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Testes ({results.length})</p>
                            {groups.map(({ spec, items }) => {
                                const specOpen = expandedSpecs.has(spec);
                                const specFailed = items.some(r => r.status === 'failed' || r.status === 'timedOut');
                                const specPassed = items.every(r => r.status === 'passed' || r.status === 'flaky');
                                const specColor = specFailed ? 'text-danger' : specPassed ? 'text-success' : 'text-warning';
                                return (
                                    <div key={spec} className="border border-border rounded-lg overflow-hidden">
                                        {/* Linha do spec */}
                                        <button
                                            onClick={() => toggleSpec(spec)}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-foreground/[0.03] hover:bg-accent/50 transition-colors text-left"
                                        >
                                            {specOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                                            <span className={`text-xs font-mono truncate flex-1 ${specColor}`}>{spec}</span>
                                            <span className="text-[10px] text-muted-foreground shrink-0">{items.length} teste{items.length > 1 ? 's' : ''}</span>
                                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatDuration(items.reduce((s, r) => s + (r.duration_ms ?? 0), 0))}</span>
                                        </button>

                                        {/* Testes do spec */}
                                        {specOpen && (
                                            <div className="divide-y divide-border/60">
                                                {items.map((r) => {
                                                    const rs = resultStatusStyle(r.status);
                                                    const hasDetail = !!r.error_message || r.attachments.length > 0;
                                                    const testOpen = expandedTests.has(r.id);
                                                    return (
                                                        <div key={r.id}>
                                                            <button
                                                                onClick={() => hasDetail && toggleTest(r.id)}
                                                                className={`w-full flex items-center gap-2 px-4 py-2 text-left ${hasDetail ? 'hover:bg-accent/40 cursor-pointer' : 'cursor-default'} transition-colors`}
                                                            >
                                                                {hasDetail
                                                                    ? (testOpen ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />)
                                                                    : <span className="w-3 shrink-0" />}
                                                                <span className={`text-[11px] font-bold shrink-0 ${rs.text}`}>{rs.label}</span>
                                                                <span className="text-sm text-foreground truncate flex-1">{r.title?.replace(/^.*?›\s*/, '') || r.spec_file}</span>
                                                                {r.retries > 0 && <span className="text-[10px] text-warning shrink-0 bg-warning/10 border border-warning/30 px-1 rounded">{r.retries}× retry</span>}
                                                                {r.attachments.length > 0 && (
                                                                    <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                                                                        {r.attachments.map((a, i) => <span key={i}>{attachmentIcon(a)}</span>)}
                                                                    </span>
                                                                )}
                                                                <span className="text-xs text-muted-foreground shrink-0">{formatDuration(r.duration_ms)}</span>
                                                            </button>

                                                            {testOpen && (
                                                                <div className="px-5 pb-3 pt-1 bg-foreground/[0.02] flex flex-col gap-2.5 border-t border-border/40">
                                                                    {r.error_message && (
                                                                        <pre className="text-[11px] text-danger bg-danger/5 border border-danger/20 rounded-lg p-2.5 overflow-x-auto custom-scrollbar whitespace-pre-wrap max-h-48">{r.error_message}</pre>
                                                                    )}
                                                                    {r.attachments.length > 0 && (
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {r.attachments.map((a, i) => {
                                                                                const accessible = isAccessibleUrl(a.path);
                                                                                const label = a.name || `attachment ${i + 1}`;
                                                                                const icon = attachmentIcon(a);
                                                                                return accessible ? (
                                                                                    <a key={i} href={a.path!} target="_blank" rel="noreferrer"
                                                                                        className="text-[11px] text-brand hover:underline flex items-center gap-1 bg-brand/10 border border-brand/30 rounded-md px-2 py-1">
                                                                                        {icon} {label}
                                                                                    </a>
                                                                                ) : (
                                                                                    <span key={i} title="Disponível nos artifacts do GitHub Actions"
                                                                                        className="text-[11px] text-muted-foreground flex items-center gap-1 bg-foreground/5 border border-border rounded-md px-2 py-1">
                                                                                        {icon} {label}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                            {run?.gh_run_url && (
                                                                                <a href={run.gh_run_url} target="_blank" rel="noreferrer"
                                                                                    className="text-[11px] text-muted-foreground hover:text-brand flex items-center gap-1 border border-border rounded-md px-2 py-1">
                                                                                    <ExternalLink className="w-3 h-3" /> Ver no GitHub Actions
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!loading && !error && results.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-16">Sem resultados detalhados ainda.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
