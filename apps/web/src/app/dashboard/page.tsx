'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Activity, Bug, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type TestRunRow = {
    id: string;
    test_case_id: string;
    project_id: string | null;
    status: string;
    started_at: string;
    ended_at: string | null;
    duration_ms: number | null;
    steps_total: number | null;
    steps_failed: number | null;
    test_cases?: { name: string | null } | null;
    projects?: { name: string | null } | null;
};

type BugRow = {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    created_at: string;
};

function isoDay(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatWhen(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (isoDay(d) === isoDay(now)) return `Hoje, ${hh}:${mm}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isoDay(d) === isoDay(yesterday)) return `Ontem, ${hh}:${mm}`;
    return d.toLocaleDateString('pt-BR');
}

function dayLabel(d: Date): string {
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

function formatDuration(ms: number | null): string {
    if (ms == null || ms <= 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}m${String(r).padStart(2, '0')}s`;
}

const SEVERITY_META: Record<BugRow['severity'], { label: string; color: string; order: number }> = {
    critical: { label: 'Critical', color: '#E74C3C', order: 0 },
    high:     { label: 'High',     color: '#E67E22', order: 1 },
    medium:   { label: 'Medium',   color: '#F0A500', order: 2 },
    low:      { label: 'Low',      color: '#27AE60', order: 3 },
};

export default function DashboardPage() {
    const [runs, setRuns] = useState<TestRunRow[]>([]);
    const [bugs, setBugs] = useState<BugRow[]>([]);
    const [totalTests, setTotalTests] = useState(0);
    const [testsCreatedToday, setTestsCreatedToday] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Last 30 days of runs (covers all chart/KPI windows the dashboard
            // shows; older runs are still queried separately if needed).
            const since = new Date();
            since.setDate(since.getDate() - 30);
            const sinceIso = since.toISOString();

            const [runsRes, bugsRes, totalRes, todayRes] = await Promise.all([
                supabase
                    .from('test_runs')
                    .select('id, test_case_id, project_id, status, started_at, ended_at, duration_ms, steps_total, steps_failed, test_cases:test_case_id ( name ), projects:project_id ( name )')
                    .gte('started_at', sinceIso)
                    .order('started_at', { ascending: false }),
                supabase
                    .from('bug_reports')
                    .select('id, severity, created_at')
                    .gte('created_at', sinceIso),
                supabase.from('test_cases').select('id', { count: 'exact', head: true }),
                supabase
                    .from('test_cases')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
            ]);

            if (cancelled) return;

            if (runsRes.error) console.error('runs load failed:', runsRes.error);
            else setRuns((runsRes.data as unknown as TestRunRow[]) || []);

            if (bugsRes.error) {
                // 42P01 = "relation does not exist" → migration not applied yet.
                // Treat as empty so the dashboard still renders.
                if ((bugsRes.error as any).code !== '42P01') {
                    console.error('bugs load failed:', bugsRes.error);
                }
                setBugs([]);
            } else {
                setBugs((bugsRes.data as unknown as BugRow[]) || []);
            }

            setTotalTests(totalRes.count || 0);
            setTestsCreatedToday(todayRes.count || 0);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const todayIso = isoDay(new Date());
    const yesterdayIso = isoDay(new Date(Date.now() - 24 * 3600 * 1000));

    const runsToday = useMemo(
        () => runs.filter(r => isoDay(new Date(r.started_at)) === todayIso),
        [runs, todayIso],
    );
    const passedToday = runsToday.filter(r => r.status === 'passed').length;
    const failedToday = runsToday.filter(r => r.status === 'failed').length;

    // Success rate window: last 7d vs 7d before (for trend arrow).
    const trends = useMemo(() => {
        const now = Date.now();
        const last7 = runs.filter(r => now - new Date(r.started_at).getTime() < 7 * 86400_000);
        const prev7 = runs.filter(r => {
            const t = new Date(r.started_at).getTime();
            return now - t >= 7 * 86400_000 && now - t < 14 * 86400_000;
        });
        const rate = (xs: TestRunRow[]) => {
            const settled = xs.filter(r => r.status === 'passed' || r.status === 'failed');
            if (settled.length === 0) return null;
            return Math.round((settled.filter(r => r.status === 'passed').length / settled.length) * 100);
        };
        const cur = rate(last7);
        const prev = rate(prev7);
        const delta = (cur !== null && prev !== null) ? cur - prev : null;
        // Avg duration over the last 7d
        const durs = last7.map(r => r.duration_ms).filter((x): x is number => typeof x === 'number' && x > 0);
        const avgDurMs = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
        const durs14 = prev7.map(r => r.duration_ms).filter((x): x is number => typeof x === 'number' && x > 0);
        const avgDurPrev = durs14.length > 0 ? durs14.reduce((a, b) => a + b, 0) / durs14.length : null;
        const durDelta = (avgDurMs !== null && avgDurPrev !== null) ? avgDurMs - avgDurPrev : null;
        return { rate7d: cur, rateDelta: delta, avgDurMs, durDelta };
    }, [runs]);

    const bugsToday = bugs.filter(b => isoDay(new Date(b.created_at)) === todayIso).length;
    const bugsYesterday = bugs.filter(b => isoDay(new Date(b.created_at)) === yesterdayIso).length;
    const bugsDelta = bugsToday - bugsYesterday;

    // ── Last-7d line chart from test_runs ────────────────────────────────────
    const dailyStats = useMemo(() => {
        const days: { date: string; iso: string; passed: number; failed: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push({ date: dayLabel(d), iso: isoDay(d), passed: 0, failed: 0 });
        }
        for (const r of runs) {
            const day = isoDay(new Date(r.started_at));
            const bucket = days.find(b => b.iso === day);
            if (!bucket) continue;
            if (r.status === 'passed') bucket.passed += 1;
            else if (r.status === 'failed') bucket.failed += 1;
        }
        return days;
    }, [runs]);

    // ── Bugs por severidade (últimos 30 dias) ────────────────────────────────
    const severityData = useMemo(() => {
        const counts: Record<BugRow['severity'], number> = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const b of bugs) counts[b.severity] = (counts[b.severity] || 0) + 1;
        return (['critical', 'high', 'medium', 'low'] as BugRow['severity'][]).map(s => ({
            name: SEVERITY_META[s].label,
            value: counts[s],
            color: SEVERITY_META[s].color,
        }));
    }, [bugs]);

    const recentRuns = useMemo(() => runs.slice(0, 8), [runs]);

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white leading-tight">Dashboard</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Visão geral das execuções e saúde dos testes.</p>
                </div>
                {loading && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
                    </div>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total de Testes"
                    value={String(totalTests)}
                    trend={testsCreatedToday > 0 ? `+${testsCreatedToday} hoje` : 'Nenhum hoje'}
                    trendUp={testsCreatedToday > 0}
                    icon={Activity}
                />
                <KPICard
                    title="Taxa de Sucesso"
                    value={trends.rate7d !== null ? `${trends.rate7d}%` : '—'}
                    trend={
                        trends.rateDelta === null
                            ? (trends.rate7d !== null ? 'Últimos 7 dias' : 'Sem execuções')
                            : `${trends.rateDelta >= 0 ? '+' : ''}${trends.rateDelta}% vs 7d ant.`
                    }
                    trendUp={trends.rateDelta !== null && trends.rateDelta >= 0}
                    icon={CheckCircle2}
                />
                <KPICard
                    title="Bugs Hoje"
                    value={String(bugsToday)}
                    trend={
                        bugs.length === 0
                            ? 'Sem registros'
                            : bugsDelta === 0 ? 'Mesmo de ontem'
                            : `${bugsDelta > 0 ? '+' : ''}${bugsDelta} vs ontem`
                    }
                    trendUp={bugsDelta <= 0}
                    icon={Bug}
                />
                <KPICard
                    title="Duração Média"
                    value={trends.avgDurMs !== null ? formatDuration(trends.avgDurMs) : '—'}
                    trend={
                        trends.durDelta === null
                            ? (trends.avgDurMs !== null ? 'Últimos 7 dias' : 'Sem execuções')
                            : `${trends.durDelta >= 0 ? '+' : ''}${formatDuration(Math.abs(trends.durDelta))} vs 7d ant.`
                    }
                    trendUp={trends.durDelta !== null && trends.durDelta <= 0}
                    icon={Clock}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Line Chart — runs por dia */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-black/5 min-h-[350px]">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider">Execuções — Últimos 7 dias</h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyStats} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    itemStyle={{ fontSize: '13px', color: '#1e293b' }}
                                />
                                <Line type="monotone" name="Passou" dataKey="passed" stroke="#22c55e" strokeWidth={4} dot={{ r: 4, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }} />
                                <Line type="monotone" name="Falhou" dataKey="failed" stroke="#ef4444" strokeWidth={4} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Donut — bugs por severidade */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 min-h-[350px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider">Bugs por Severidade (30d)</h3>
                    <div className="flex-1 flex items-center justify-center -mt-4">
                        <div className="h-[200px] w-full">
                            {bugs.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center px-4">
                                    Nenhum bug registrado nos últimos 30 dias
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={severityData.filter(s => s.value > 0)}
                                            cx="50%" cy="50%"
                                            innerRadius={60} outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {severityData.filter(s => s.value > 0).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px' }}
                                            itemStyle={{ fontSize: '12px', color: '#1e293b' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                        {severityData.map(item => (
                            <div key={item.name} className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="font-semibold">{item.name}:</span> <span className="text-slate-900 font-bold">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Recent Runs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-black/5">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Execuções Recentes</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="text-[10px] uppercase bg-slate-50/50 text-slate-400 font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Teste</th>
                                <th className="px-6 py-4">Projeto</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Duração</th>
                                <th className="px-6 py-4">Quando</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                                        Carregando...
                                    </td>
                                </tr>
                            )}
                            {!loading && recentRuns.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                                        Nenhuma execução registrada ainda. Rode um teste no editor ou no Maestro Studio.
                                    </td>
                                </tr>
                            )}
                            {!loading && recentRuns.map((run) => (
                                <tr key={run.id} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-900">{run.test_cases?.name || '—'}</td>
                                    <td className="px-6 py-4 text-xs">{run.projects?.name || '—'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                            run.status === 'passed' ? 'bg-green-500/10 text-green-700' :
                                            run.status === 'failed' ? 'bg-red-500/10 text-red-700' :
                                            'bg-slate-100 text-slate-500'
                                        }`}>
                                            {run.status === 'passed' ? 'Passou' :
                                             run.status === 'failed' ? 'Falhou' :
                                             run.status === 'running' ? 'Executando' : 'Cancelado'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs">{formatDuration(run.duration_ms)}</td>
                                    <td className="px-6 py-4 text-xs">{formatWhen(run.started_at)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/dashboard/tests/editor?testId=${run.test_case_id}`} className="text-brand hover:text-brandLight text-xs font-semibold hover:underline">
                                            Abrir →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Heads-up if a chart is empty because the migration hasn't run */}
            {!loading && runs.length === 0 && totalTests > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs">
                    Há testes cadastrados mas nenhuma execução foi registrada ainda. Se você rodou testes mas eles não aparecem aqui, aplique a migration <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">supabase_migration_test_runs_bugs.sql</code> no SQL Editor do Supabase.
                </div>
            )}

        </div>
    );
}

function KPICard({ title, value, trend, trendUp, icon: Icon }: any) {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 flex flex-col justify-between group hover:border-brand/20 hover:shadow-md transition-all h-[140px]">
            <div className="flex items-start justify-between">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-brand group-hover:bg-brand/10 transition-colors">
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <div className="mt-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
                <p className={`text-xs mt-1 font-bold ${trendUp ? 'text-green-500' : 'text-slate-400'}`}>
                    {trend}
                </p>
            </div>
        </div>
    );
}
