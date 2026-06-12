'use client';

// Donut da execução manual dos casos: PASS/FAIL/PULADO/NÃO RODADO/sem registro.
// Alimentado pelo "Registrar execução" do mapa e do admin.

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ClipboardCheck, Paperclip } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import type { InsightsAggregate } from '@/types/qa-journey-insights';

interface Props {
    aggregate: InsightsAggregate;
}

export function ManualRunsCard({ aggregate }: Props) {
    const chart = useChartTheme();

    const slices = useMemo(() => ([
        { name: 'PASS', value: aggregate.cases_pass, color: chart.series.passed },
        { name: 'FAIL', value: aggregate.cases_fail, color: chart.series.failed },
        { name: 'Pulado', value: aggregate.cases_skipped, color: chart.series.medium },
        { name: 'Não rodado', value: aggregate.cases_not_run, color: chart.series.muted },
        { name: 'Sem registro', value: aggregate.cases_unregistered, color: chart.grid },
    ].filter(s => s.value > 0)), [aggregate, chart]);

    const registered = aggregate.cases_pass + aggregate.cases_fail + aggregate.cases_skipped + aggregate.cases_not_run;
    const passPct = registered > 0 ? Math.round((aggregate.cases_pass / registered) * 100) : 0;

    return (
        <div className="bg-card rounded-2xl border border-border flex flex-col">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-brand" />
                    Execução manual
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Resultado registrado nos casos · {registered}/{aggregate.total_cases} executados
                </p>
            </div>

            {aggregate.total_cases === 0 ? (
                <div className="flex-1 p-8 text-center text-sm text-muted-foreground">
                    Nenhum caso cadastrado ainda.
                </div>
            ) : (
                <div className="flex-1 p-4 flex flex-col gap-3">
                    <div className="relative h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={slices}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={56}
                                    outerRadius={82}
                                    paddingAngle={2}
                                    strokeWidth={0}
                                >
                                    {slices.map(s => <Cell key={s.name} fill={s.color} />)}
                                </Pie>
                                <Tooltip
                                    contentStyle={chart.tooltip}
                                    itemStyle={chart.tooltipItem}
                                    formatter={(value, name) => [`${value ?? 0} casos`, String(name ?? '')]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Centro do donut: taxa de PASS entre os executados */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className={`text-2xl font-bold ${passPct >= 70 ? 'text-success' : passPct >= 40 ? 'text-warning' : registered === 0 ? 'text-muted-foreground' : 'text-danger'}`}>
                                {registered === 0 ? '—' : `${passPct}%`}
                            </span>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">pass</span>
                        </div>
                    </div>

                    <ul className="flex flex-col gap-1.5">
                        {slices.map(s => (
                            <li key={s.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                                <span className="flex-1">{s.name}</span>
                                <span className="font-mono text-foreground">{s.value}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-auto pt-2 border-t border-border flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Paperclip className="w-3 h-3" />
                        {aggregate.cases_with_evidence} {aggregate.cases_with_evidence === 1 ? 'caso com evidência anexada' : 'casos com evidência anexada'}
                    </div>
                </div>
            )}
        </div>
    );
}
