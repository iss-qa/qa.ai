'use client';

import { Activity, Bug, Clock, GitBranch, Map as MapIcon, Workflow } from 'lucide-react';
import type { InsightsAggregate } from '@/types/qa-journey-insights';

interface Props {
    aggregate: InsightsAggregate;
}

export function KPICards({ aggregate }: Props) {
    const lastSync = aggregate.last_sync_at ? new Date(aggregate.last_sync_at) : null;
    const lastSyncLabel = lastSync ? lastSync.toLocaleString('pt-BR') : 'nunca';

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI
                icon={<MapIcon className="w-4 h-4" />}
                label="Jornadas"
                value={aggregate.total_journeys.toString()}
                hint={`${aggregate.total_subflows} sub-fluxos · ${aggregate.total_cases} casos`}
            />
            <KPI
                icon={<Activity className="w-4 h-4 text-green-500" />}
                label="% Automação"
                value={`${aggregate.automation_pct}%`}
                hint={`${aggregate.automated_subflows}/${aggregate.total_subflows} sub-fluxos`}
                accent={aggregate.automation_pct >= 70 ? 'green' : aggregate.automation_pct >= 30 ? 'amber' : 'red'}
            />
            <KPI
                icon={<Bug className="w-4 h-4 text-red-500" />}
                label="Bugs abertos"
                value={aggregate.open_bugs_count.toString()}
                hint={aggregate.open_tasks_count > 0 ? `+ ${aggregate.open_tasks_count} tasks` : 'cache Jira'}
                accent={aggregate.open_bugs_count > 0 ? 'red' : 'neutral'}
            />
            <KPI
                icon={<Clock className="w-4 h-4 text-blue-500" />}
                label="Último sync"
                value={lastSync ? formatRelative(lastSync) : '—'}
                hint={lastSyncLabel}
            />
            <KPI
                icon={<GitBranch className="w-4 h-4 text-green-500" />}
                label="Automatizados"
                value={aggregate.automated_subflows.toString()}
                hint="sub-fluxos com cobertura completa"
                accent="green"
            />
            <KPI
                icon={<GitBranch className="w-4 h-4 text-yellow-500" />}
                label="Parcial"
                value={aggregate.partial_subflows.toString()}
                hint="cobertura incompleta"
                accent="amber"
            />
            <KPI
                icon={<GitBranch className="w-4 h-4 text-blue-400" />}
                label="Manual"
                value={aggregate.manual_subflows.toString()}
                hint="executados manualmente"
            />
            <KPI
                icon={<Workflow className="w-4 h-4 text-slate-400" />}
                label="Sem cobertura"
                value={aggregate.no_coverage_subflows.toString()}
                hint="risco — não testados"
                accent={aggregate.no_coverage_subflows > 0 ? 'red' : 'neutral'}
            />
        </div>
    );
}

interface KPIProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    accent?: 'green' | 'amber' | 'red' | 'neutral';
}

function KPI({ icon, label, value, hint, accent = 'neutral' }: KPIProps) {
    const valueColor =
        accent === 'green' ? 'text-green-600'
        : accent === 'amber' ? 'text-amber-600'
        : accent === 'red' ? 'text-red-600'
        : 'text-slate-900';
    return (
        <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <span>{label}</span>
                {icon}
            </div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
        </div>
    );
}

function formatRelative(d: Date): string {
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min atrás`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h atrás`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `${days}d atrás`;
    const months = Math.floor(days / 30);
    return `${months}mes atrás`;
}
