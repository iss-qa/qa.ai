'use client';

// Qualidade: bugs abertos por severidade + lista dos mais recentes.

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bug, ExternalLink } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import type { BugSeverity, ProjectReport } from '@/lib/reports/api';

const SEVERITY_LABELS: Record<BugSeverity, string> = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
};

export function BugsCard({ report }: { report: ProjectReport }) {
    const chart = useChartTheme();
    const severityColor: Record<BugSeverity, string> = {
        critical: chart.series.critical,
        high: chart.series.high,
        medium: chart.series.medium,
        low: chart.series.low,
    };
    const data = (Object.keys(SEVERITY_LABELS) as BugSeverity[]).map(s => ({
        name: SEVERITY_LABELS[s],
        count: report.bugsBySeverity[s],
        color: severityColor[s],
    }));

    return (
        <div className="bg-card rounded-2xl border border-border flex flex-col">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Bug className="w-4 h-4 text-danger" />
                    Bugs abertos por severidade
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    {report.openBugs} em aberto · {report.resolvedInPeriod} resolvidos no período
                </p>
            </div>

            <div className="p-4 flex flex-col gap-4">
                <div className="h-[160px]">
                    {report.openBugs === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                            Nenhum bug aberto. 🎉
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                                <XAxis dataKey="name" stroke={chart.axis} tick={{ fontSize: 10, fill: chart.axis }} tickLine={false} axisLine={false} />
                                <YAxis stroke={chart.axis} tick={{ fontSize: 10, fill: chart.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="count" name="Bugs" radius={[6, 6, 0, 0]} maxBarSize={48}>
                                    {data.map(d => <Cell key={d.name} fill={d.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {report.recentBugs.length > 0 && (
                    <ul className="flex flex-col divide-y divide-border border-t border-border">
                        {report.recentBugs.slice(0, 5).map(b => (
                            <li key={b.id} className="py-2 flex items-center gap-2 text-xs">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: severityColor[b.severity] }}
                                    title={SEVERITY_LABELS[b.severity]}
                                />
                                <span className="flex-1 text-foreground truncate" title={b.title}>{b.title}</span>
                                <span className="text-muted-foreground shrink-0">
                                    {new Date(b.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                {b.jira_url && (
                                    <a href={b.jira_url} target="_blank" rel="noopener noreferrer" className="text-brand shrink-0" title="Abrir no Jira">
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
