'use client';

import { Loader2, ExternalLink, ChevronRight } from 'lucide-react';
import type { WebRun } from './web-types';
import { isRunActive } from './web-types';
import { formatDuration, formatRelative, runStatusStyle } from './web-utils';

interface Props {
    runs: WebRun[];
    onOpen: (runId: string) => void;
}

export function WebRunsList({ runs, onOpen }: Props) {
    if (runs.length === 0) {
        return (
            <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">Nenhuma execução ainda</p>
                <p className="text-xs mt-1">Aperte <strong>Rodar Testes</strong> para disparar o workflow no GitHub Actions.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[640px]">
                <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="py-2 px-3 font-bold">Status</th>
                        <th className="py-2 px-3 font-bold">Branch / Spec</th>
                        <th className="py-2 px-3 font-bold">Resultados</th>
                        <th className="py-2 px-3 font-bold">Duração</th>
                        <th className="py-2 px-3 font-bold">Quando</th>
                        <th className="py-2 px-3 font-bold"></th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((r) => {
                        const st = runStatusStyle(r.status);
                        const active = isRunActive(r.status);
                        return (
                            <tr
                                key={r.id}
                                onClick={() => onOpen(r.id)}
                                className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                            >
                                <td className="py-2.5 px-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold border ${st.bg} ${st.text}`}>
                                        {active && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {st.label}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3">
                                    <div className="font-mono text-xs text-foreground">{r.branch || '—'}</div>
                                    {r.spec && <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">{r.spec}</div>}
                                </td>
                                <td className="py-2.5 px-3 text-xs">
                                    {r.total > 0 ? (
                                        <span className="flex items-center gap-2">
                                            <span className="text-success">{r.passed}✓</span>
                                            {r.failed > 0 && <span className="text-danger">{r.failed}✗</span>}
                                            {r.flaky > 0 && <span className="text-warning">{r.flaky}~</span>}
                                            <span className="text-muted-foreground">/ {r.total}</span>
                                        </span>
                                    ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatDuration(r.duration_ms)}</td>
                                <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatRelative(r.created_at)}</td>
                                <td className="py-2.5 px-3 text-right">
                                    <span className="inline-flex items-center gap-2">
                                        {r.gh_run_url && (
                                            <a href={r.gh_run_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-brand" title="Abrir no GitHub Actions">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
