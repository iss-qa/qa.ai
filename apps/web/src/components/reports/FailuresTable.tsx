'use client';

// Falhas recentes de execução: o que o QA precisa investigar primeiro.

import { XCircle } from 'lucide-react';
import { formatDurationMs, type ProjectReport } from '@/lib/reports/api';

export function FailuresTable({ report }: { report: ProjectReport }) {
    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-danger" />
                    Falhas recentes
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Últimas execuções com falha no período — priorize a investigação.
                </p>
            </div>

            {report.recentFailures.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma falha no período. ✅
                </div>
            ) : (
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-card text-muted-foreground font-bold tracking-widest shadow-[inset_0_-1px_0_rgb(var(--border))]">
                            <tr>
                                <th className="px-5 py-3">Teste</th>
                                <th className="px-5 py-3 w-36">Quando</th>
                                <th className="px-5 py-3 w-24">Duração</th>
                                <th className="px-5 py-3 w-28">Passos</th>
                                <th className="px-5 py-3">Erro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {report.recentFailures.map(r => (
                                <tr key={r.id} className="hover:bg-accent">
                                    <td className="px-5 py-2 font-medium text-foreground max-w-[260px] truncate" title={r.test_name}>
                                        {r.test_name}
                                    </td>
                                    <td className="px-5 py-2 text-xs">
                                        {new Date(r.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-5 py-2 text-xs font-mono">{formatDurationMs(r.duration_ms)}</td>
                                    <td className="px-5 py-2 text-xs font-mono">
                                        {r.steps_total != null
                                            ? `${(r.steps_total ?? 0) - (r.steps_failed ?? 0)}/${r.steps_total}`
                                            : '—'}
                                    </td>
                                    <td className="px-5 py-2 text-xs text-danger max-w-[320px] truncate" title={r.error_message || ''}>
                                        {r.error_message || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
