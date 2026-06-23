'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Bug, Search, Loader2, Plus, X, Link2, Paperclip, Trash2, AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, GitBranch, User } from 'lucide-react';
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
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low:      'bg-green-500/20 text-green-400 border-green-500/30',
};

const statusConfig: Record<BugStatus, { label: string; classes: string }> = {
    open:        { label: 'Aberto',       classes: 'bg-warning/15 text-warning border-warning/30' },
    in_progress: { label: 'Em andamento', classes: 'bg-brand/15 text-brand border-brand/30' },
    resolved:    { label: 'Resolvido',    classes: 'bg-success/15 text-success border-success/30' },
    wont_fix:    { label: "Won't fix",    classes: 'bg-foreground/10 text-muted-foreground border-border' },
};

// Extrai o número do card Jira da URL (ex.: "INNO-123").
function extractJiraKey(url: string | null): string | null {
    if (!url) return null;
    const m = url.match(/\/browse\/([A-Z]+-\d+)/i);
    return m ? m[1].toUpperCase() : null;
}

function formatBugDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (sameDay) return `Hoje, ${hh}:${mm}`;
    if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${hh}:${mm}`;
    return `${d.toLocaleDateString('pt-BR')} ${hh}:${mm}`;
}

export default function BugTrackerPage() {
    const [globalFilter, setGlobalFilter] = useQueryState('q', { defaultValue: '' });
    const [severityFilter, setSeverityFilter] = useQueryState('severity', { defaultValue: 'all' });
    const [projectFilter, setProjectFilter] = useQueryState('project', { defaultValue: '' });
    const [bugs, setBugs] = useState<BugReportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);

    const [editing, setEditing] = useState<Partial<BugReportRow> | null>(null);
    const [saving, setSaving] = useState(false);
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [tests, setTests] = useState<TestOption[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadBugs = async () => {
        const { data, error } = await supabase
            .from('bug_reports')
            .select('id, severity, title, description, project_id, test_case_id, test_run_id, attachment_url, jira_url, pdf_url, status, source, created_at, projects:project_id ( name ), test_cases:test_case_id ( name )')
            .order('created_at', { ascending: false });
        if (error) {
            if ((error as { code?: string }).code === '42P01') setMigrationMissing(true);
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
            if (projectFilter && b.project_id !== projectFilter) return false;
            if (severityFilter !== 'all' && b.severity !== severityFilter) return false;
            if (!q) return true;
            const jiraKey = extractJiraKey(b.jira_url) || '';
            return (
                b.title.toLowerCase().includes(q) ||
                (b.description || '').toLowerCase().includes(q) ||
                (b.projects?.name || '').toLowerCase().includes(q) ||
                (b.test_cases?.name || '').toLowerCase().includes(q) ||
                jiraKey.toLowerCase().includes(q)
            );
        });
    }, [bugs, globalFilter, severityFilter, projectFilter]);

    const PAGE_SIZE = 10;
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(filteredBugs.length / PAGE_SIZE));
    useEffect(() => { if (currentPage > totalPages) setCurrentPage(1); }, [currentPage, totalPages]);
    const pagedBugs = useMemo(() => filteredBugs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filteredBugs, currentPage]);

    const openNewBug = () => setEditing({
        severity: 'medium', status: 'open', source: 'manual',
        title: '', description: '', project_id: null, test_case_id: null, attachment_url: null, jira_url: null,
    });

    const submitBug = async () => {
        if (!editing) return;
        const title = (editing.title || '').trim();
        const severity = editing.severity as Severity;
        if (!title) { alert('Título é obrigatório.'); return; }
        if (!severity) { alert('Severidade é obrigatória.'); return; }
        setSaving(true);
        try {
            if (editing.id) {
                const { error } = await supabase.from('bug_reports').update({
                    title, severity,
                    description: editing.description || null,
                    project_id: editing.project_id || null,
                    test_case_id: editing.test_case_id || null,
                    attachment_url: editing.attachment_url || null,
                    jira_url: editing.jira_url || null,
                    status: editing.status || 'open',
                    source: editing.source || 'manual',
                }).eq('id', editing.id);
                if (error) throw error;
            } else {
                const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const res = await fetch(`${API}/bugs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title, severity,
                        description: editing.description || null,
                        project_id: editing.project_id || null,
                        test_case_id: editing.test_case_id || null,
                        attachment_url: editing.attachment_url || null,
                        jira_url: editing.jira_url || null,
                        status: editing.status || 'open',
                    }),
                });
                const body = await res.json().catch(() => ({})) as { error?: string };
                if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            }
            const fresh = await loadBugs();
            setBugs(fresh);
            setEditing(null);
        } catch (e) {
            alert('Erro ao salvar bug: ' + ((e as { message?: string })?.message || e));
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        const id = deletingId; setDeletingId(null);
        try {
            const { error } = await supabase.from('bug_reports').delete().eq('id', id);
            if (error) throw error;
            setBugs(prev => prev.filter(b => b.id !== id));
        } catch (e) {
            alert('Erro ao excluir: ' + ((e as { message?: string })?.message || e));
        }
    };

    const projectScopedTests = useMemo(() =>
        editing?.project_id ? tests.filter(t => t.project_id === editing.project_id) : tests,
        [tests, editing?.project_id]);

    const selectClass = 'h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20';

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Bug className="w-6 h-6 text-brand" /> Bug Tracker
                    </h1>
                    <p className="text-muted-foreground text-sm mt-0.5">Bugs reportados manualmente ou capturados automaticamente em execuções que falharam.</p>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Busca */}
                    <div className="relative">
                        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar bugs..."
                            value={globalFilter}
                            onChange={e => setGlobalFilter(e.target.value)}
                            className="h-9 bg-card border border-border rounded-lg pl-9 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 w-48 sm:w-56"
                        />
                    </div>
                    {/* Projeto */}
                    <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className={`${selectClass} min-w-[150px]`}>
                        <option value="">Todos os Projetos</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {/* Severidade */}
                    <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={`${selectClass} min-w-[150px]`}>
                        <option value="all">Todas Severidades</option>
                        <option value="critical">Crítico</option>
                        <option value="high">Alta</option>
                        <option value="medium">Média</option>
                        <option value="low">Baixa</option>
                    </select>
                    <button
                        onClick={openNewBug}
                        disabled={migrationMissing}
                        className="h-9 bg-brand text-black px-4 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 transition-all inline-flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Novo Bug
                    </button>
                </div>
            </div>

            {/* Tabela */}
            <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-foreground/[0.03] text-muted-foreground font-bold tracking-widest border-b border-border">
                            <tr>
                                <th className="px-4 py-3.5">Severidade</th>
                                <th className="px-4 py-3.5">Jira</th>
                                <th className="px-4 py-3.5">Título</th>
                                <th className="px-4 py-3.5">Projeto</th>
                                <th className="px-4 py-3.5">Origem</th>
                                <th className="px-4 py-3.5">Status</th>
                                <th className="px-4 py-3.5">Data / Hora</th>
                                <th className="px-4 py-3.5 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {pagedBugs.map(bug => {
                                const jiraKey = extractJiraKey(bug.jira_url);
                                const st = statusConfig[bug.status] ?? statusConfig.open;
                                const isAuto = bug.source === 'automation';
                                return (
                                    <tr key={bug.id} onClick={() => setEditing(bug)}
                                        className="hover:bg-accent/50 transition-colors cursor-pointer">
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${severityColors[bug.severity]}`}>
                                                {bug.severity}
                                            </span>
                                        </td>
                                        {/* Jira card */}
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            {jiraKey ? (
                                                <a href={bug.jira_url!} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline bg-brand/10 border border-brand/20 rounded-md px-2 py-0.5">
                                                    {jiraKey} <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground/40 text-xs">—</span>
                                            )}
                                        </td>
                                        {/* Título */}
                                        <td className="px-4 py-3 max-w-[280px]">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold text-foreground truncate" title={bug.title}>{bug.title}</span>
                                                {bug.test_cases?.name && (
                                                    <span className="text-[10px] text-brand font-medium truncate">{bug.test_cases.name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">{bug.projects?.name || '—'}</td>
                                        {/* Origem */}
                                        <td className="px-4 py-3">
                                            {isAuto ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-violet-500/15 text-violet-400 border-violet-500/30">
                                                    <GitBranch className="w-2.5 h-2.5" /> Auto
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-foreground/8 text-muted-foreground border-border">
                                                    <User className="w-2.5 h-2.5" /> Manual
                                                </span>
                                            )}
                                        </td>
                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${st.classes}`}>
                                                {st.label}
                                            </span>
                                        </td>
                                        {/* Data/hora */}
                                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatBugDate(bug.created_at)}</td>
                                        {/* Ações */}
                                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2">
                                                {bug.attachment_url && (
                                                    <a href={bug.attachment_url} target="_blank" rel="noopener noreferrer"
                                                        className="text-muted-foreground hover:text-brand transition-colors" title="Anexo">
                                                        <Paperclip className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                                {bug.pdf_url && (
                                                    <a href={bug.pdf_url} target="_blank" rel="noopener noreferrer"
                                                        className="text-muted-foreground hover:text-brand transition-colors" title="PDF">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                                <button onClick={() => setDeletingId(bug.id)}
                                                    className="text-muted-foreground hover:text-danger transition-colors" title="Excluir">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {loading && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando bugs…
                    </div>
                )}
                {!loading && filteredBugs.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        {migrationMissing ? (
                            <span className="inline-flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-warning" />
                                Tabela <code className="font-mono bg-warning/10 text-warning px-1.5 py-0.5 rounded">bug_reports</code> não existe. Aplique a migration 002.
                            </span>
                        ) : bugs.length === 0
                            ? 'Nenhum bug registrado ainda.'
                            : 'Nenhum bug encontrado com os filtros aplicados.'}
                    </div>
                )}

                {!loading && filteredBugs.length > PAGE_SIZE && (
                    <div className="px-6 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                            Mostrando <strong className="text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</strong>–<strong className="text-foreground">{Math.min(currentPage * PAGE_SIZE, filteredBugs.length)}</strong> de <strong className="text-foreground">{filteredBugs.length}</strong> bugs
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                className="inline-flex items-center gap-1 px-3 h-7 rounded border border-border bg-card hover:bg-accent disabled:opacity-40 text-xs font-medium">
                                <ChevronLeft className="w-3 h-3" /> Anterior
                            </button>
                            <span>Página <strong className="text-foreground">{currentPage}</strong> de <strong className="text-foreground">{totalPages}</strong></span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                                className="inline-flex items-center gap-1 px-3 h-7 rounded border border-border bg-card hover:bg-accent disabled:opacity-40 text-xs font-medium">
                                Próximo <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal criar/editar */}
            {editing && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Bug className="w-5 h-5 text-brand" />
                                {editing.id ? 'Editar Bug' : 'Novo Bug'}
                            </h2>
                            {!editing.id && (
                                <span className="text-[11px] text-muted-foreground bg-brand/10 border border-brand/20 rounded-md px-2 py-0.5">
                                    Jira será aberto automaticamente
                                </span>
                            )}
                            <button onClick={() => setEditing(null)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent ml-2">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 flex flex-col gap-1.5">
                                    <label className={labelClass}>Título *</label>
                                    <input type="text" value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })}
                                        placeholder="Resumo curto do bug" className={inputClass} autoFocus />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelClass}>Severidade *</label>
                                    <select value={editing.severity || 'medium'} onChange={e => setEditing({ ...editing, severity: e.target.value as Severity })} className={inputClass}>
                                        <option value="critical">Crítico</option>
                                        <option value="high">Alta</option>
                                        <option value="medium">Média</option>
                                        <option value="low">Baixa</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={labelClass}>Descrição</label>
                                <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}
                                    placeholder="Passos para reproduzir, comportamento esperado vs observado, ambiente…"
                                    rows={4} className={`${inputClass} resize-none`} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelClass}>Projeto</label>
                                    <select value={editing.project_id || ''} onChange={e => setEditing({
                                        ...editing, project_id: e.target.value || null,
                                        test_case_id: tests.find(t => t.id === editing.test_case_id)?.project_id === e.target.value ? editing.test_case_id : null,
                                    })} className={inputClass}>
                                        <option value="">— Nenhum —</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={labelClass}>Teste relacionado</label>
                                    <select value={editing.test_case_id || ''} onChange={e => setEditing({ ...editing, test_case_id: e.target.value || null })}
                                        className={`${inputClass} disabled:opacity-50`} disabled={projectScopedTests.length === 0}>
                                        <option value="">— Nenhum —</option>
                                        {projectScopedTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className={`${labelClass} flex items-center gap-1`}><Paperclip className="w-3 h-3" /> Anexo (URL)</label>
                                    <input type="url" value={editing.attachment_url || ''} onChange={e => setEditing({ ...editing, attachment_url: e.target.value })}
                                        placeholder="https://drive.google.com/…" className={inputClass} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className={`${labelClass} flex items-center gap-1`}><Link2 className="w-3 h-3" /> Link do Jira (opcional)</label>
                                    <input type="url" value={editing.jira_url || ''} onChange={e => setEditing({ ...editing, jira_url: e.target.value })}
                                        placeholder="https://foxbit.atlassian.net/browse/INNO-123" className={inputClass} />
                                    {!editing.id && <p className="text-[10px] text-muted-foreground">Deixe vazio para criar automaticamente.</p>}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5 max-w-xs">
                                <label className={labelClass}>Status</label>
                                <select value={editing.status || 'open'} onChange={e => setEditing({ ...editing, status: e.target.value as BugStatus })} className={inputClass}>
                                    <option value="open">Aberto</option>
                                    <option value="in_progress">Em andamento</option>
                                    <option value="resolved">Resolvido</option>
                                    <option value="wont_fix">Won&apos;t fix</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-5 pt-3 flex gap-3 justify-end border-t border-border">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                            <button onClick={submitBug} disabled={saving || !(editing.title || '').trim()}
                                className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editing.id ? 'Salvar alterações' : 'Reportar Bug'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmar exclusão */}
            {deletingId && (() => {
                const target = bugs.find(b => b.id === deletingId);
                return (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-foreground mb-2">Excluir Bug?</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                &quot;{target?.title}&quot; será excluído permanentemente.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                                <button onClick={confirmDelete} className="px-4 py-2 bg-danger text-white text-sm font-bold rounded-lg hover:bg-danger/90">Excluir</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

const labelClass = 'text-xs font-bold text-muted-foreground uppercase tracking-wider';
const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50 w-full';
