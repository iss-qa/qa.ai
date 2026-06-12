'use client';

// Cobertura das Jornadas no relatório: automação por status + execução manual.

import Link from 'next/link';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import { RUN_STATUS_DISPLAY } from '@/lib/qa-journey/constants';
import type { ProjectReport } from '@/lib/reports/api';

export function JourneyCoverageCard({ report, projectId }: { report: ProjectReport; projectId: string }) {
    const j = report.journeys;
    const coverage = [
        { label: 'Automatizados', value: j.automated_subflows, className: 'bg-success' },
        { label: 'Parcial', value: j.partial_subflows, className: 'bg-warning' },
        { label: 'Manual', value: j.manual_subflows, className: 'bg-brand' },
        { label: 'Sem cobertura', value: j.no_coverage_subflows, className: 'bg-danger' },
    ];
    const totalSub = Math.max(1, j.total_subflows);

    const manualRegistered = j.cases_pass + j.cases_fail + j.cases_skipped + j.cases_not_run;
    const manual = [
        { label: RUN_STATUS_DISPLAY.pass, value: j.cases_pass, color: 'text-success' },
        { label: RUN_STATUS_DISPLAY.fail, value: j.cases_fail, color: 'text-danger' },
        { label: RUN_STATUS_DISPLAY.skipped, value: j.cases_skipped, color: 'text-muted-foreground' },
        { label: 'Sem registro', value: j.cases_unregistered + j.cases_not_run, color: 'text-muted-foreground' },
    ];

    return (
        <div className="bg-card rounded-2xl border border-border flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <MapIcon className="w-4 h-4 text-brand" />
                        Cobertura das Jornadas
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        {j.total_journeys} jornadas · {j.total_subflows} sub-fluxos · {j.total_cases} casos
                    </p>
                </div>
                <Link
                    href={`/dashboard/qa-journey?project=${projectId}`}
                    className="text-[11px] text-brand hover:underline inline-flex items-center gap-0.5 shrink-0"
                >
                    Ver mapa <ChevronRight className="w-3 h-3" />
                </Link>
            </div>

            <div className="p-5 flex flex-col gap-5">
                {/* Barra empilhada de automação */}
                <div className="flex flex-col gap-2">
                    <div className="flex h-3 rounded-full overflow-hidden bg-foreground/5">
                        {coverage.filter(c => c.value > 0).map(c => (
                            <div
                                key={c.label}
                                className={c.className}
                                style={{ width: `${(c.value / totalSub) * 100}%` }}
                                title={`${c.label}: ${c.value}`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {coverage.map(c => (
                            <span key={c.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className={`w-2 h-2 rounded-full ${c.className}`} />
                                {c.label}: <span className="font-mono text-foreground">{c.value}</span>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Execução manual dos casos */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                        Execução manual ({manualRegistered}/{j.total_cases} casos com resultado)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {manual.map(m => (
                            <div key={m.label} className="bg-foreground/[0.03] border border-border rounded-lg px-3 py-2 flex flex-col">
                                <span className={`text-lg font-bold ${m.color}`}>{m.value}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{m.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
