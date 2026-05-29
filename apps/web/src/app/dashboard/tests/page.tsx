'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Filter, Play, Loader2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type TestRow = {
    id: string;
    name: string;
    project_id: string | null;
    last_run_at: string | null;
    status: string | null;
    projects?: { name: string | null; platform: string | null } | null;
};

function formatLastRun(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (sameDay) return `Hoje, ${hh}:${mm}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const sameYesterday =
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate();
    if (sameYesterday) return `Ontem, ${hh}:${mm}`;
    return d.toLocaleDateString('pt-BR');
}

function statusBadge(status: string | null): { label: string; classes: string } {
    if (status === 'passed') return { label: 'Sucesso', classes: 'bg-success/10 text-success' };
    if (status === 'failed') return { label: 'Falha', classes: 'bg-danger/10 text-danger' };
    return { label: 'Pendente', classes: 'bg-muted text-muted-foreground' };
}

export default function TestsPage() {
    const [tests, setTests] = useState<TestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('test_cases')
                .select('id, name, project_id, last_run_at, status, projects:project_id ( name, platform )')
                .order('last_run_at', { ascending: false, nullsFirst: false });
            if (cancelled) return;
            if (error) {
                console.error('Failed to load test_cases:', error);
                setTests([]);
            } else {
                setTests((data as unknown as TestRow[]) || []);
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return tests;
        return tests.filter(t =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.projects?.name || '').toLowerCase().includes(q)
        );
    }, [tests, search]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Testes</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Gerencie e execute seus casos de teste.</p>
                </div>
                <Link href="/dashboard/tests/editor" prefetch={true} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2">
                    <Plus className="w-4 h-4" /> NOVO TESTE
                </Link>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between bg-surface-muted/50">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar testes..."
                            className="pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 w-64 text-foreground"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground">
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-surface-muted/50 text-muted-foreground font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Nome do Teste</th>
                                <th className="px-6 py-4">Projeto</th>
                                <th className="px-6 py-4">Plataforma</th>
                                <th className="px-6 py-4">Última Execução</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                                        Carregando testes...
                                    </td>
                                </tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                                        {search ? 'Nenhum teste encontrado para esta busca.' : 'Nenhum teste cadastrado ainda.'}
                                    </td>
                                </tr>
                            )}
                            {!loading && filtered.map((test) => {
                                const badge = statusBadge(test.status);
                                const projName = test.projects?.name || '—';
                                const platform = test.projects?.platform || '—';
                                return (
                                    <tr key={test.id} className="hover:bg-accent transition-colors">
                                        <td className="px-6 py-4 font-bold text-foreground">{test.name}</td>
                                        <td className="px-6 py-4">{projName}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium text-[10px] uppercase">
                                                {platform}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs">{formatLastRun(test.last_run_at)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase ${badge.classes}`}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Link
                                                    href={`/dashboard/tests/editor?testId=${test.id}`}
                                                    className="p-2 hover:bg-brand/10 text-brand rounded-lg transition-colors"
                                                    title="Abrir no editor"
                                                >
                                                    <Play className="w-4 h-4 fill-current" />
                                                </Link>
                                                {test.project_id ? (
                                                    <Link
                                                        href={`/dashboard/projects/${test.project_id}?openStudioFor=${test.id}`}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 rounded-lg transition-colors border border-violet-500/20 text-xs font-bold"
                                                        title="Abrir no Maestro Studio"
                                                    >
                                                        <Wand2 className="w-3.5 h-3.5" />
                                                        Studio
                                                    </Link>
                                                ) : (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-bold cursor-not-allowed"
                                                        title="Teste sem projeto: salve via Maestro Studio para habilitar"
                                                    >
                                                        <Wand2 className="w-3.5 h-3.5" />
                                                        Studio
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
