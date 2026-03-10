'use client';

import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Activity, Bug, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { useOrganization } from '@/hooks/useOrganization';

// Mock Data for the Dashboard MVP
const dailyStats = [
    { date: '01/03', passed: 12, failed: 2, total: 14 },
    { date: '02/03', passed: 15, failed: 1, total: 16 },
    { date: '03/03', passed: 14, failed: 3, total: 17 },
    { date: '04/03', passed: 20, failed: 0, total: 20 },
    { date: '05/03', passed: 18, failed: 2, total: 20 },
    { date: '06/03', passed: 25, failed: 1, total: 26 },
    { date: '07/03', passed: 19, failed: 4, total: 23 },
];

const severityData = [
    { name: 'Critical', value: 2, color: '#E74C3C' },
    { name: 'High', value: 5, color: '#E67E22' },
    { name: 'Medium', value: 8, color: '#F0A500' },
    { name: 'Low', value: 12, color: '#27AE60' },
];

const recentRuns = [
    { id: '1', name: 'Login Checkout', status: 'failed', duration: '42s', date: 'Hoje, 14:32' },
    { id: '2', name: 'Cadastro PF', status: 'passed', duration: '12s', date: 'Hoje, 11:15' },
    { id: '3', name: 'Edição Perfil', status: 'passed', duration: '8s', date: 'Hoje, 09:40' },
    { id: '4', name: 'Reset Senha', status: 'passed', duration: '15s', date: 'Ontem' },
    { id: '5', name: 'Pagamento Pix', status: 'failed', duration: '35s', date: 'Ontem' },
];

export default function DashboardPage() {
    // We would use the org hook to filter records here
    // const { org } = useOrganization();

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white leading-tight">Dashboard</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Visão geral das execuções e saúde dos testes.</p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard title="Total de Testes" value="47" trend="+3 hoje" icon={Activity} />
                <KPICard title="Taxa de Sucesso" value="89%" trend="+2% 7d" trendUp icon={CheckCircle2} />
                <KPICard title="Bugs Hoje" value="3" trend="-1 vs ontem" trendUp={true} icon={Bug} />
                <KPICard title="Duração Média" value="12.4s" trend="-0.8s" trendUp icon={Clock} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Line Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-black/5 min-h-[350px]">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider">Taxa de Sucesso — Últimos 7 dias</h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyStats} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
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

                {/* Donut Chart */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 min-h-[350px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-wider">Bugs por Severidade (30d)</h3>
                    <div className="flex-1 flex items-center justify-center -mt-4">
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={severityData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {severityData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px' }}
                                        itemStyle={{ fontSize: '12px', color: '#1e293b' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    {/* Custom Legend */}
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
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Duração</th>
                                <th className="px-6 py-4">Quando</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {recentRuns.map((run) => (
                                <tr key={run.id} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-900">{run.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${run.status === 'passed' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                            }`}>
                                            {run.status === 'passed' ? 'Passou' : 'Falhou'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">{run.duration}</td>
                                    <td className="px-6 py-4">{run.date}</td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/dashboard/runs/${run.id}`} className="text-brand hover:text-brandLight text-xs font-semibold hover:underline">
                                            Ver detalhes →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

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
