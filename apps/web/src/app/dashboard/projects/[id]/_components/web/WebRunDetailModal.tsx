'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink, Paperclip, ChevronDown, ChevronRight } from 'lucide-react';
import { getWebRun } from './web-api';
import type { WebRun, WebResult } from './web-types';
import { formatDuration, resultStatusStyle, runStatusStyle } from './web-utils';

interface Props {
    runId: string;
    onClose: () => void;
}

export function WebRunDetailModal({ runId, onClose }: Props) {
    const [run, setRun] = useState<WebRun | null>(null);
    const [results, setResults] = useState<WebResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { run, results } = await getWebRun(runId);
                if (!alive) return;
                setRun(run); setResults(results);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [runId]);

    const toggle = (id: string) => setExpanded((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const st = run ? runStatusStyle(run.status) : null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors z-10">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3 flex-wrap pr-8">
                        <h2 className="text-lg font-bold text-foreground">Execução Web</h2>
                        {st && <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${st.bg} ${st.text}`}>{st.label}</span>}
                        {run?.gh_run_url && (
                            <a href={run.gh_run_url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline flex items-center gap-1">
                                GitHub Actions <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                    {run && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                            {run.branch && <span className="font-mono">{run.branch}</span>}
                            {run.commit_sha && <span className="font-mono">{run.commit_sha.slice(0, 7)}</span>}
                            <span>{run.total} testes</span>
                            <span className="text-success">{run.passed} ✓</span>
                            {run.failed > 0 && <span className="text-danger">{run.failed} ✗</span>}
                            {run.flaky > 0 && <span className="text-warning">{run.flaky} flaky</span>}
                            {run.skipped > 0 && <span>{run.skipped} pulados</span>}
                            <span>{formatDuration(run.duration_ms)}</span>
                        </div>
                    )}
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                    {loading && <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>}
                    {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>}
                    {run?.error_message && <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3">{run.error_message}</p>}

                    {!loading && !error && results.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-12">Sem resultados detalhados ainda.</p>
                    )}

                    <div className="flex flex-col gap-1.5">
                        {results.map((r) => {
                            const rs = resultStatusStyle(r.status);
                            const hasDetail = !!r.error_message || r.attachments.length > 0;
                            const open = expanded.has(r.id);
                            return (
                                <div key={r.id} className="border border-border rounded-lg bg-foreground/[0.02]">
                                    <button
                                        onClick={() => hasDetail && toggle(r.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${hasDetail ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default'} rounded-lg transition-colors`}
                                    >
                                        {hasDetail ? (open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />) : <span className="w-3.5 shrink-0" />}
                                        <span className={`text-xs font-bold shrink-0 ${rs.text}`}>{rs.label}</span>
                                        <span className="text-sm text-foreground truncate flex-1">{r.title || r.spec_file}</span>
                                        {r.retries > 0 && <span className="text-[10px] text-warning shrink-0">{r.retries}×retry</span>}
                                        <span className="text-xs text-muted-foreground shrink-0">{formatDuration(r.duration_ms)}</span>
                                    </button>
                                    {open && (
                                        <div className="px-4 pb-3 pt-1 flex flex-col gap-2 border-t border-border">
                                            {r.spec_file && <p className="text-[11px] text-muted-foreground font-mono">{r.spec_file}</p>}
                                            {r.error_message && (
                                                <pre className="text-[11px] text-danger bg-danger/5 border border-danger/20 rounded-lg p-2 overflow-x-auto custom-scrollbar whitespace-pre-wrap">{r.error_message}</pre>
                                            )}
                                            {r.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {r.attachments.map((a, i) => a.path ? (
                                                        <a key={i} href={a.path} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:underline flex items-center gap-1 bg-brand/10 border border-brand/30 rounded-md px-2 py-1">
                                                            <Paperclip className="w-3 h-3" /> {a.name}
                                                        </a>
                                                    ) : (
                                                        <span key={i} className="text-[11px] text-muted-foreground flex items-center gap-1 bg-foreground/5 border border-border rounded-md px-2 py-1">
                                                            <Paperclip className="w-3 h-3" /> {a.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
