'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight, Link2 } from 'lucide-react';
import { AUTOMATION_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { CoverageGap } from '@/types/qa-journey-insights';

interface Props {
    gaps: CoverageGap[];
    projectId: string;
}

// Tabela "onde o QA precisa olhar": sub-fluxos sem cobertura, sem teste
// Maestro vinculado, etc. Ordenado por prioridade (status none > manual).
export function GapsTable({ gaps, projectId }: Props) {
    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Gaps de cobertura
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sub-fluxos sem automação ou sem teste Maestro vinculado — prioridades de QA.
                </p>
            </div>

            {gaps.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum gap. Cobertura de automação está em dia.
                </div>
            ) : (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-surface-muted/50 text-muted-foreground font-bold tracking-widest border-b border-border sticky top-0">
                            <tr>
                                <th className="px-5 py-3">Jornada</th>
                                <th className="px-5 py-3">Sub-fluxo</th>
                                <th className="px-5 py-3 w-32">Status</th>
                                <th className="px-5 py-3 w-24">Casos</th>
                                <th className="px-5 py-3 w-24">Maestro</th>
                                <th className="px-5 py-3 text-right w-24"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {gaps.slice(0, 50).map(g => {
                                const statusOpt = AUTOMATION_STATUS_OPTIONS.find(o => o.value === g.automation_status);
                                return (
                                    <tr key={g.subflow_id} className="hover:bg-accent">
                                        <td className="px-5 py-2 text-xs text-muted-foreground">{g.journey_title}</td>
                                        <td className="px-5 py-2 font-medium text-foreground">{g.subflow_title}</td>
                                        <td className="px-5 py-2">
                                            {statusOpt && (
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${statusOpt.color}`}>
                                                    {statusOpt.label}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-2 text-xs font-mono text-muted-foreground">{g.case_count}</td>
                                        <td className="px-5 py-2 text-xs">
                                            {g.has_test_case ? (
                                                <span className="inline-flex items-center gap-0.5 text-brand">
                                                    <Link2 className="w-3 h-3" /> Sim
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">Não</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-2 text-right">
                                            <Link
                                                href={`/dashboard/qa-journey/admin/${g.journey_id}`}
                                                className="text-xs text-brand hover:underline inline-flex items-center gap-0.5"
                                            >
                                                Abrir <ChevronRight className="w-3 h-3" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {gaps.length > 50 && (
                        <div className="text-[10px] text-muted-foreground italic px-5 py-2 border-t border-border">
                            Mostrando 50 de {gaps.length} gaps.
                            <Link href={`/dashboard/qa-journey/admin?project=${projectId}`} className="text-brand hover:underline ml-1">
                                Ver todos no admin →
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
