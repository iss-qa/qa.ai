'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Filter, Play, Loader2, Wand2, Globe, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type TestRow = {
    id: string;
    name: string;
    project_id: string | null;
    last_run_at: string | null;
    created_at: string | null;
    status: string | null;
    projects?: { name: string | null; platform: string | null } | null;
    // campos extras para testes Web
    _type?: 'mobile' | 'web';
    _spec_path?: string;
    _gh_run_url?: string | null;
    _run_status?: string | null;
};

// Testes Web: agrupados por spec + projeto a partir de web_test_runs.
type WebSpecRow = {
    spec: string | null;
    project_id: string;
    project_name: string;
    last_status: string | null;
    last_run_at: string | null;
    gh_run_url: string | null;
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
    if (status === 'passed' || status === 'pass') return { label: 'Sucesso', classes: 'bg-success/10 text-success' };
    if (status === 'failed' || status === 'fail') return { label: 'Falha', classes: 'bg-danger/10 text-danger' };
    if (status === 'flaky') return { label: 'Flaky', classes: 'bg-warning/10 text-warning' };
    if (status === 'skipped') return { label: 'Pulado', classes: 'bg-muted text-muted-foreground' };
    if (status === 'running') return { label: 'Rodando', classes: 'bg-brand/10 text-brand' };
    if (status === 'queued') return { label: 'Na fila', classes: 'bg-muted text-muted-foreground' };
    if (status === 'error') return { label: 'Erro', classes: 'bg-danger/10 text-danger' };
    if (status === 'cancelled') return { label: 'Cancelado', classes: 'bg-muted text-muted-foreground' };
    return { label: 'Pendente', classes: 'bg-muted text-muted-foreground' };
}

export default function TestsPage() {
    const [tests, setTests] = useState<TestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [platformFilter, setPlatformFilter] = useState<'all' | 'mobile' | 'web'>('all');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Testes Mobile (Maestro — test_cases)
            const { data: mobileData } = await supabase
                .from('test_cases')
                .select('id, name, project_id, last_run_at, created_at, status, projects:project_id ( name, platform )')
                .order('last_run_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false });

            const mobileRows: TestRow[] = ((mobileData as unknown as TestRow[]) || []).map(r => ({
                ...r, _type: 'mobile' as const,
            }));

            // Testes Web — lê web_test_runs diretamente (sempre populado após trigger,
            // independente de a ingestão de resultados ter ocorrido).
            // Agrupa por spec+project_id → um entry por spec file distinto.
            // Runs com spec=null representam a suite completa do projeto.
            const { data: webRunsData } = await supabase
                .from('web_test_runs')
                .select('id, project_id, status, spec, gh_run_url, ended_at, created_at, projects(name)')
                .order('created_at', { ascending: false })
                .limit(500);

            const webMap = new Map<string, WebSpecRow>();
            for (const run of (webRunsData as unknown as Array<{
                id: string;
                project_id: string;
                status: string | null;
                spec: string | null;
                gh_run_url: string | null;
                ended_at: string | null;
                created_at: string;
                projects: { name: string } | null;
            }>) || []) {
                if (!run.project_id) continue;
                const key = `${run.project_id}::${run.spec ?? '__suite__'}`;
                if (!webMap.has(key)) {
                    webMap.set(key, {
                        spec: run.spec,
                        project_id: run.project_id,
                        project_name: run.projects?.name || run.project_id,
                        last_status: run.status,
                        last_run_at: run.ended_at || run.created_at,
                        gh_run_url: run.gh_run_url,
                    });
                }
            }

            const webRows: TestRow[] = Array.from(webMap.values()).map(w => ({
                id: `web::${w.project_id}::${encodeURIComponent(w.spec ?? '__suite__')}`,
                name: w.spec ? (w.spec.split('/').pop()?.replace(/\.spec\.ts$/, '') || w.spec) : 'Suite completa',
                project_id: w.project_id,
                last_run_at: w.last_run_at,
                created_at: null,
                status: w.last_status,
                projects: { name: w.project_name, platform: 'web' },
                _type: 'web' as const,
                _spec_path: w.spec || undefined,
                _gh_run_url: w.gh_run_url,
                _run_status: w.last_status,
            }));

            if (cancelled) return;
            // Mobile primeiro, depois Web
            setTests([...mobileRows, ...webRows]);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // Projetos presentes na lista (para o combobox de filtro)
    const projectOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tests) {
            if (t.project_id && t.projects?.name) map.set(t.project_id, t.projects.name);
        }
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [tests]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tests.filter(t => {
            if (projectFilter && t.project_id !== projectFilter) return false;
            if (platformFilter === 'mobile' && t._type === 'web') return false;
            if (platformFilter === 'web' && t._type !== 'web') return false;
            if (!q) return true;
            return (
                (t.name || '').toLowerCase().includes(q) ||
                (t.projects?.name || '').toLowerCase().includes(q) ||
                (t._spec_path || '').toLowerCase().includes(q)
            );
        });
    }, [tests, search, projectFilter, platformFilter]);

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
                <div className="p-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-surface-muted/50">
                    <div className="relative flex-1 sm:max-w-xl">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar testes por nome ou projeto..."
                            className="pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 w-full text-foreground"
                        />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
                        {/* Filtro plataforma */}
                        <div className="inline-flex bg-foreground/5 border border-border rounded-lg p-0.5 gap-0.5">
                            {(['all', 'mobile', 'web'] as const).map(p => (
                                <button key={p} onClick={() => setPlatformFilter(p)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${platformFilter === p ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:text-foreground'}`}>
                                    {p === 'all' ? 'Todos' : p === 'mobile' ? 'Mobile' : 'Web'}
                                </button>
                            ))}
                        </div>
                        <select
                            id="tests-project-filter"
                            value={projectFilter}
                            onChange={e => setProjectFilter(e.target.value)}
                            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[150px]"
                        >
                            <option value="">Todos os projetos</option>
                            {projectOptions.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
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
                                        {search || projectFilter ? 'Nenhum teste encontrado para este filtro.' : 'Nenhum teste cadastrado ainda.'}
                                    </td>
                                </tr>
                            )}
                            {!loading && filtered.map((test) => {
                                const badge = statusBadge(test.status);
                                const projName = test.projects?.name || '—';
                                const platform = test.projects?.platform || '—';
                                const isWeb = test._type === 'web';
                                return (
                                    <tr key={test.id} className="hover:bg-accent transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold text-foreground">{test.name}</span>
                                                {isWeb && test._spec_path && (
                                                    <span className="text-[10px] text-muted-foreground font-mono">{test._spec_path}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{projName}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded font-medium text-[10px] uppercase ${isWeb ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>
                                                {isWeb ? 'Web' : platform}
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
                                                {/* Ações Web */}
                                                {isWeb ? (
                                                    <>
                                                        {test._gh_run_url && (
                                                            <a href={test._gh_run_url} target="_blank" rel="noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-colors border border-brand/20 text-xs font-bold">
                                                                <ExternalLink className="w-3.5 h-3.5" /> GitHub
                                                            </a>
                                                        )}
                                                        {test.project_id && (
                                                            <Link href={`/dashboard/projects/${test.project_id}`}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border text-xs font-bold">
                                                                <Globe className="w-3.5 h-3.5" /> Projeto
                                                            </Link>
                                                        )}
                                                    </>
                                                ) : (
                                                <>
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
                                                </>
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
