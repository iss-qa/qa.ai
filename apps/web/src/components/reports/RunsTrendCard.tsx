'use client';

// Evolução diária das execuções (pass × fail) + origem dos disparos.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import type { ProjectReport } from '@/lib/reports/api';

const TRIGGER_LABELS: Record<string, string> = {
    editor: 'Editor',
    maestro_studio: 'Maestro Studio',
    cli: 'CLI',
    cron: 'Agendado (cron)',
    desconhecido: 'Desconhecido',
};

export function RunsTrendCard({ report }: { report: ProjectReport }) {
    const chart = useChartTheme();
    const maxTrigger = Math.max(1, ...report.byTrigger.map(t => t.count));

    return (
        <div className="bg-card rounded-2xl border border-border flex flex-col">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand" />
                    Execuções por dia
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Resultados das execuções automatizadas no período.
                </p>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
                <div className="h-[220px]">
                    {report.totalRuns === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                            Nenhuma execução no período.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={report.trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                                <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="day"
                                    stroke={chart.axis}
                                    tick={{ fontSize: 10, fill: chart.axis }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    stroke={chart.axis}
                                    tick={{ fontSize: 10, fill: chart.axis }}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} />
                                <Area
                                    type="monotone"
                                    dataKey="passed"
                                    name="Pass"
                                    stackId="runs"
                                    stroke={chart.series.passed}
                                    fill={chart.series.passed}
                                    fillOpacity={0.25}
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="failed"
                                    name="Fail"
                                    stackId="runs"
                                    stroke={chart.series.failed}
                                    fill={chart.series.failed}
                                    fillOpacity={0.25}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Origem dos disparos */}
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                        Origem das execuções
                    </span>
                    {report.byTrigger.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {report.byTrigger.map(t => (
                                <li key={t.name} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">{TRIGGER_LABELS[t.name] || t.name}</span>
                                        <span className="font-mono text-foreground">{t.count}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-brand/70"
                                            style={{ width: `${Math.round((t.count / maxTrigger) * 100)}%` }}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
