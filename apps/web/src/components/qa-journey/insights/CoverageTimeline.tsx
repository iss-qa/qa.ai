'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import type { QAJourneySnapshot } from '@/types/qa-journey-insights';

interface Props {
    snapshots: QAJourneySnapshot[];
    onSnapshotNow: () => void;
    snapshotting: boolean;
}

// Linha temporal de KPIs por snapshot.
// Eixo Y duplo nao da pra fazer simples sem complicar - mostra so % automacao
// como linha principal e bugs como linha secundaria (mesmo eixo, ok pra MVP).
export function CoverageTimeline({ snapshots, onSnapshotNow, snapshotting }: Props) {
    const chart = useChartTheme();
    const data = snapshots.map(s => {
        const totalSub = s.total_subflows || 1;
        return {
            date: s.snapshot_date,
            automation_pct: Math.round((s.automated_subflows / totalSub) * 100),
            bugs: s.open_bugs_count,
            cases: s.total_cases,
        };
    });

    return (
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-foreground">Evolução semanal</h3>
                    <p className="text-[11px] text-muted-foreground">Snapshots históricos · cron domingo 23h</p>
                </div>
                <button
                    onClick={onSnapshotNow}
                    disabled={snapshotting}
                    className="text-xs text-muted-foreground hover:text-brand border border-border rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
                    title="Captura snapshot do dia agora (idempotente)"
                >
                    {snapshotting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    Snapshot agora
                </button>
            </div>

            {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-2 py-10 text-sm text-muted-foreground">
                    <Sparkles className="w-6 h-6 text-muted-foreground" />
                    <p>Nenhum snapshot histórico ainda.</p>
                    <p className="text-[11px] text-muted-foreground max-w-md">
                        O primeiro snapshot é capturado automaticamente no próximo domingo, ou clique em &quot;Snapshot agora&quot; para criar um ponto inicial.
                    </p>
                </div>
            ) : (
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} />
                            <YAxis tick={{ fontSize: 10, fill: chart.axis }} />
                            <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="automation_pct" name="% Automação" stroke={chart.series.passed} strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="bugs" name="Bugs abertos" stroke={chart.series.failed} strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="cases" name="Total casos" stroke={chart.series.brand} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 4" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
