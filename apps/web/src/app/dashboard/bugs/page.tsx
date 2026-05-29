'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Bug, Search, Filter, Loader2, Plus, X, Link2, Paperclip, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { supabase } from '@/lib/supabase';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type BugStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

type BugReportRow = {
    id: string;
    severity: Severity;
    title: string;
    description: string | null;
    project_id: string | null;
    test_case_id: string | null;
    test_run_id: string | null;
    attachment_url: string | null;
    jira_url: string | null;
    pdf_url: string | null;
    status: BugStatus;
    source: string | null;
    created_at: string;
    projects?: { name: string | null } | null;
    test_cases?: { name: string | null } | null;
};

type ProjectOption = { id: string; name: string };
type TestOption = { id: string; name: string; project_id: string | null };

const severityColors: Record<Severity, string> = {
    critical: 'bg-red-500/20 text-red-500',
    high:     'bg-orange-500/20 text-orange-500',
    medium:   'bg-yellow-500/20 text-yellow-500',
    low:      'bg-green-500/20 text-green-500',
};

const severityLabel: Record<Severity, string> = {
    critical: 'Crítico',
    high:     'Alta',
    medium:   'Média',
    low:      'Baixa',
};

const statusLabel: Record<BugStatus, string> = {
    open: 'Aberto',
    in_progress: 'Em andamento',
    resolved: 'Resolvido',
    wont_fix: "Won't fix",
};

function formatBugDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const wasYesterday = d.toDateString() === yesterday.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return `Hoje, ${hh}:${mm}`;
    if (wasYesterday) return `Ontem, ${hh}:${mm}`;
    return d.toLocaleDateString('pt-BR');
}

export default function BugTrackerPage() {
    const [globalFilter, setGlobalFilter] = useQueryState('q', { defaultValue: '' });
    const [severityFilter, setSeverityFilter] = useQueryState('severity', { defaultValue: 'all' });
    const [bugs, setBugs] = useState<BugReportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);

    // Create / Edit modal state
    const [editing, setEditing] = useState<Partial<BugReportRow> | null>(null);
    const [saving, setSaving] = useState(false);
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [tests, setTests] = useState<TestOption[]>([]);

    // Delete confirmation
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadBugs = async () => {
        const { data, error } = await supabase
            .from('bug_reports')
            .select('id, severity, title, description, project_id, test_case_id, test_run_id, attachment_url, jira_url, pdf_url, status, source, created_at, projects:project_id ( name ), test_cases:test_case_id ( name )')
            .order('created_at', { ascending: false });
        if (error) {
            if ((error as any).code === '42P01') setMigrationMissing(true);
            else console.error('bug_reports load failed:', error);
            return [];
        }
        return (data as unknown as BugReportRow[]) || [];
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [bugList, projList, testList] = await Promise.all([
                loadBugs(),
                supabase.from('projects').select('id, name').order('name', { ascending: true }).then(r => r.data || []),
                supabase.from('test_cases').select('id, name, project_id').order('name', { ascending: true }).then(r => r.data || []),
            ]);
            if (cancelled) return;
            setBugs(bugList);
            setProjects(projList as ProjectOption[]);
            setTests(testList as TestOption[]);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const filteredBugs = useMemo(() => {
        const q = globalFilter.toLowerCase();
        return bugs.filter(b => {
            const projName = b.projects?.name || '';
            const testName = b.test_cases?.name || '';
            const matchesQuery = !q
                || b.title.toLowerCase().includes(q)
                || (b.description || '').toLowerCase().includes(q)
                || projName.toLowerCase().includes(q)
                || testName.toLowerCase().includes(q);
            const matchesSeverity = severityFilter === 'all' || b.severity === severityFilter;
            return matchesQuery && matchesSeverity;
        });
    }, [bugs, globalFilter, severityFilter]);

    // Pagination — purely client-side: bug counts are low enough that loading
    // all and slicing in the browser beats round-tripping per page. If the
    // list ever grows past a few hundred rows we'd move this to Supabase
    // .range() with server-side count.
    const PAGE_SIZE = 10;
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(filteredBugs.length / PAGE_SIZE));

    // Reset to page 1 whenever the result set shrinks below the current page
    // (e.g. user types a more specific search) so we don't strand them on an
    // empty page.
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(1);
    }, [currentPage, totalPages]);

    const pagedBugs = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredBugs.slice(start, start + PAGE_SIZE);
    }, [filteredBugs, currentPage]);

    const openNewBug = () => {
        setEditing({
            severity: 'medium',
            status: 'open',
            source: 'manual',
            title: '',
            description: '',
            project_id: null,
            test_case_id: null,
            attachment_url: null,
            jira_url: null,
        });
    };

    const submitBug = async () => {
        if (!editing) return;
        const title = (editing.title || '').trim();
        const severity = editing.severity as Severity;
        if (!title) { alert('Título é obrigatório.'); return; }
        if (!severity) { alert('Severidade é obrigatória.'); return; }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                title,
                severity,
                description: editing.description || null,
                project_id: editing.project_id || null,
                test_case_id: editing.test_case_id || null,
                attachment_url: editing.attachment_url || null,
                jira_url: editing.jira_url || null,
                status: editing.status || 'open',
                source: editing.source || 'manual',
            };
            if (editing.id) {
                const { error } = await supabase.from('bug_reports').update(payload).eq('id', editing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('bug_reports').insert(payload);
                if (error) throw error;
            }
            const fresh = await loadBugs();
            setBugs(fresh);
            setEditing(null);
        } catch (e: any) {
            console.error('bug save failed:', e);
            alert('Erro ao salvar bug: ' + (e?.message || e));
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        const targetId = deletingId;
        setDeletingId(null);
        try {
            const { error } = await supabase.from('bug_reports').delete().eq('id', targetId);
            if (error) throw error;
            setBugs(prev => prev.filter(b => b.id !== targetId));
        } catch (e: any) {
            alert('Erro ao excluir: ' + (e?.message || e));
        }
    };

    // Filter tests by selected project in the form
    const projectScopedTests = useMemo(() => {
        if (!editing?.project_id) return tests;
        return tests.filter(t => t.project_id === editing.project_id);
    }, [tests, editing?.project_id]);

    return (
        <div className="p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Bug className="w-6 h-6 text-brand" /> Bug Tracker
                    </h1>
                    <p className="text-textSecondary mt-1">Bugs reportados manualmente ou capturados automaticamente em execuções que falharam.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar bugs..."
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="h-9 bg-white border border-black/5 rounded-lg pl-9 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 w-[250px]"
                        />
                    </div>

                    <div className="relative">
                        <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="h-9 bg-white border border-black/5 rounded-lg pl-9 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 appearance-none min-w-[160px]"
                        >
                            <option value="all">Todas Severidades</option>
                            <option value="critical">Crítico</option>
                            <option value="high">Alta</option>
                            <option value="medium">Média</option>
                            <option value="low">Baixa</option>
                        </select>
                    </div>

                    {/* Button height matches search/filter (h-9) so the toolbar is flush. */}
                    <button
                        onClick={openNewBug}
                        disabled={migrationMissing}
                        className="h-9 bg-brand text-black px-4 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
                        title={migrationMissing ? 'Aplique a migration antes de criar bugs' : 'Reportar novo bug'}
                    >
                        <Plus className="w-4 h-4" /> Novo Bug
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-slate-50/50 text-slate-400 font-bold tracking-widest border-b border-black/[0.03]">
                            <tr>
                                <th className="px-6 py-4">Severidade</th>
                                <th className="px-6 py-4">Título</th>
                                <th className="px-6 py-4">Projeto</th>
                                <th className="px-6 py-4">Teste</th>
                                <th className="px-6 py-4">Origem</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Data</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {pagedBugs.map(bug => (
                                <tr
                                    key={bug.id}
                                    onClick={() => setEditing(bug)}
                                    className="hover:bg-slate-50/40 transition-colors cursor-pointer"
                                    title="Clique para visualizar/editar"
                                >
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${severityColors[bug.severity]}`}>
                                            {bug.severity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-900 max-w-[320px] truncate" title={bug.title}>
                                        {bug.title}
                                    </td>
                                    <td className="px-6 py-4 text-xs">{bug.projects?.name || '—'}</td>
                                    <td className="px-6 py-4">
                                        {bug.test_cases?.name
                                            ? <span className="text-brand font-medium">{bug.test_cases.name}</span>
                                            : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {bug.source === 'automation'
                                            ? <span className="inline-flex px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold">AUTO</span>
                                            : <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">MANUAL</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs">{statusLabel[bug.status]}</td>
                                    <td className="px-6 py-4 text-xs">{formatBugDate(bug.created_at)}</td>
                                    {/* Action links use stopPropagation so they don't also trigger the row's edit-open click. */}
                                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-3 text-slate-500">
                                            {bug.jira_url && (
                                                <a href={bug.jira_url} target="_blank" rel="noopener noreferrer"
                                                   className="hover:text-brand flex items-center gap-1 text-xs"
                                                   title="Abrir no Jira">
                                                    <Link2 className="w-3.5 h-3.5" /> Jira
                                                </a>
                                            )}
                                            {bug.attachment_url && (
                                                <a href={bug.attachment_url} target="_blank" rel="noopener noreferrer"
                                                   className="hover:text-brand flex items-center gap-1 text-xs"
                                                   title="Abrir anexo">
                                                    <Paperclip className="w-3.5 h-3.5" /> Anexo
                                                </a>
                                            )}
                                            {bug.pdf_url && (
                                                <a href={bug.pdf_url} target="_blank" rel="noopener noreferrer"
                                                   className="hover:text-brand flex items-center gap-1 text-xs"
                                                   title="Relatório PDF">
                                                    <FileText className="w-3.5 h-3.5" /> PDF
                                                </a>
                                            )}
                                            <button onClick={() => setDeletingId(bug.id)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                    title="Excluir bug">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Loading / empty */}
                {loading && (
                    <div className="p-8 text-center text-textSecondary text-sm">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Carregando bugs…
                    </div>
                )}
                {!loading && filteredBugs.length === 0 && (
                    <div className="p-8 text-center text-textSecondary text-sm">
                        {migrationMissing
                            ? <span className="inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> A tabela <code className="font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">bug_reports</code> ainda não existe. Aplique a migration <code className="font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">supabase/migrations/002_test_runs_bugs.sql</code>.</span>
                            : bugs.length === 0
                                ? 'Nenhum bug registrado ainda. Clique em "Novo Bug" para reportar um.'
                                : 'Nenhum bug encontrado com os filtros atuais.'}
                    </div>
                )}

                {/* Pagination footer — only shown when there's more than one
                    page so a small dataset doesn't get a permanent footer. */}
                {!loading && filteredBugs.length > PAGE_SIZE && (
                    <div className="px-6 py-3 border-t border-black/[0.04] bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
                        <span>
                            Mostrando <span className="font-bold text-slate-700">{((currentPage - 1) * PAGE_SIZE) + 1}</span>
                            – <span className="font-bold text-slate-700">{Math.min(currentPage * PAGE_SIZE, filteredBugs.length)}</span>
                            {' '}de <span className="font-bold text-slate-700">{filteredBugs.length}</span> bugs
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="inline-flex items-center gap-1 px-3 h-8 rounded-md border border-black/5 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 font-medium"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                            </button>
                            <span className="px-2">
                                Página <span className="font-bold text-slate-700">{currentPage}</span> de <span className="font-bold text-slate-700">{totalPages}</span>
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="inline-flex items-center gap-1 px-3 h-8 rounded-md border border-black/5 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 font-medium"
                            >
                                Próximo <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Bug className="w-5 h-5 text-brand" />
                                {editing.id ? 'Editar Bug' : 'Novo Bug'}
                            </h2>
                            <button onClick={() => setEditing(null)} className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/5">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Título *</label>
                                    <input
                                        type="text"
                                        value={editing.title || ''}
                                        onChange={e => setEditing({ ...editing, title: e.target.value })}
                                        placeholder="Resumo curto do bug"
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Severidade *</label>
                                    <select
                                        value={editing.severity || 'medium'}
                                        onChange={e => setEditing({ ...editing, severity: e.target.value as Severity })}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                                    >
                                        <option value="critical">Crítico</option>
                                        <option value="high">Alta</option>
                                        <option value="medium">Média</option>
                                        <option value="low">Baixa</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</label>
                                <textarea
                                    value={editing.description || ''}
                                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                                    placeholder="Passos para reproduzir, comportamento esperado vs observado, ambiente, etc."
                                    rows={5}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Projeto</label>
                                    <select
                                        value={editing.project_id || ''}
                                        onChange={e => setEditing({
                                            ...editing,
                                            project_id: e.target.value || null,
                                            // Reset test if it doesn't belong to the new project
                                            test_case_id: tests.find(t => t.id === editing.test_case_id)?.project_id === e.target.value ? editing.test_case_id : null,
                                        })}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                                    >
                                        <option value="">— Nenhum —</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teste relacionado</label>
                                    <select
                                        value={editing.test_case_id || ''}
                                        onChange={e => setEditing({ ...editing, test_case_id: e.target.value || null })}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 disabled:opacity-50"
                                        disabled={projectScopedTests.length === 0}
                                    >
                                        <option value="">— Nenhum —</option>
                                        {projectScopedTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Paperclip className="w-3 h-3" /> Anexo (URL)
                                    </label>
                                    <input
                                        type="url"
                                        value={editing.attachment_url || ''}
                                        onChange={e => setEditing({ ...editing, attachment_url: e.target.value })}
                                        placeholder="https://drive.google.com/..."
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Link2 className="w-3 h-3" /> Link do Jira
                                    </label>
                                    <input
                                        type="url"
                                        value={editing.jira_url || ''}
                                        onChange={e => setEditing({ ...editing, jira_url: e.target.value })}
                                        placeholder="https://foxbit.atlassian.net/browse/ISS-123"
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                <select
                                    value={editing.status || 'open'}
                                    onChange={e => setEditing({ ...editing, status: e.target.value as BugStatus })}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 max-w-xs"
                                >
                                    <option value="open">Aberto</option>
                                    <option value="in_progress">Em andamento</option>
                                    <option value="resolved">Resolvido</option>
                                    <option value="wont_fix">Won't fix</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-6 pt-2 flex gap-3 justify-end border-t border-white/10">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={submitBug}
                                disabled={saving || !(editing.title || '').trim()}
                                className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editing.id ? 'Salvar alterações' : 'Reportar Bug'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deletingId && (() => {
                const target = bugs.find(b => b.id === deletingId);
                const title = target?.title || '';
                return (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-2">Excluir Bug?</h3>
                            <p className="text-sm text-slate-400 mb-6">O bug "{title}" será excluído permanentemente.</p>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                                <button onClick={confirmDelete} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
