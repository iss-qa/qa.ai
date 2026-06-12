'use client';

// Linha de KPIs executivos do relatório do projeto.

import { Activity, Bug, CheckCircle2, Clock, FlaskConical, Map as MapIcon, Wrench, XCircle } from 'lucide-react';
import { formatDurationMs, type ProjectReport } from '@/lib/reports/api';

interface Props {
    report: ProjectReport;
    periodLabel: string;
}

export function ReportKpis({ report, periodLabel }: Props) {
    const passAccent = report.passRate == null ? 'neutral' : report.passRate >= 80 ? 'green' : report.passRate >= 50 ? 'amber' : 'red';
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi
                icon={<Activity className="w-4 h-4 text-success" />}
                label="Taxa de sucesso"
                value={report.passRate == null ? '—' : `${report.passRate}%`}
                hint={`${report.passedRuns} pass · ${report.failedRuns} fail (${periodLabel})`}
                accent={passAccent}
            />
            <Kpi
                icon={<CheckCircle2 className="w-4 h-4 text-brand" />}
                label="Execuções"
                value={report.totalRuns.toString()}
                hint={periodLabel}
            />
            <Kpi
                icon={<Clock className="w-4 h-4 text-warning" />}
                label="Duração média"
                value={formatDurationMs(report.avgDurationMs)}
                hint="por execução concluída"
            />
            <Kpi
                icon={<XCircle className="w-4 h-4 text-danger" />}
                label="Falhas"
                value={report.failedRuns.toString()}
                hint={periodLabel}
                accent={report.failedRuns > 0 ? 'red' : 'neutral'}
            />
            <Kpi
                icon={<Bug className="w-4 h-4 text-danger" />}
                label="Bugs abertos"
                value={report.openBugs.toString()}
                hint={`${report.bugsBySeverity.critical} críticos · ${report.bugsBySeverity.high} altos`}
                accent={report.bugsBySeverity.critical > 0 ? 'red' : report.openBugs > 0 ? 'amber' : 'green'}
            />
            <Kpi
                icon={<Wrench className="w-4 h-4 text-success" />}
                label="Bugs resolvidos"
                value={report.resolvedInPeriod.toString()}
                hint={periodLabel}
                accent="green"
            />
            <Kpi
                icon={<FlaskConical className="w-4 h-4 text-brand" />}
                label="Testes ativos"
                value={report.activeTestCases.toString()}
                hint={`${report.totalTestCases} cadastrados`}
            />
            <Kpi
                icon={<MapIcon className="w-4 h-4 text-brand" />}
                label="Automação (jornadas)"
                value={`${report.journeys.automation_pct}%`}
                hint={`${report.journeys.automated_subflows}/${report.journeys.total_subflows} sub-fluxos`}
                accent={report.journeys.automation_pct >= 70 ? 'green' : report.journeys.automation_pct >= 30 ? 'amber' : 'red'}
            />
        </div>
    );
}

function Kpi({ icon, label, value, hint, accent = 'neutral' }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    accent?: 'green' | 'amber' | 'red' | 'neutral';
}) {
    const valueColor =
        accent === 'green' ? 'text-success'
        : accent === 'amber' ? 'text-warning'
        : accent === 'red' ? 'text-danger'
        : 'text-foreground';
    return (
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                <span>{label}</span>
                {icon}
            </div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
    );
}
