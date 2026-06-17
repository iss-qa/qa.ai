'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import {
    BarChart3,
    ChevronRight,
    Eye,
    EyeOff,
    FileSpreadsheet,
    History,
    Loader2,
    Map as MapIcon,
    MoreVertical,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';

import { JourneyFormModal } from '@/components/qa-journey/JourneyFormModal';
import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';
import {
    createJourney,
    deleteJourney,
    deleteJourneys,
    errorMessage,
    getLastProjectId,
    loadJourneys,
    loadProjectOptions,
    setJourneyPublished,
    setLastProjectId,
    updateJourney,
} from '@/lib/qa-journey/api';
import type { ProjectOption } from '@/lib/qa-journey/api';
import type { QAJourney, QAJourneyDraft } from '@/types/qa-journey';

export default function QAJourneyAdminPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    const [journeys, setJourneys] = useState<QAJourney[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);

    const [editing, setEditing] = useState<QAJourney | null>(null);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Boot: sem ?project na URL, usa o último projeto visitado para
    // disparar o carregamento das jornadas sem esperar a lista de projetos.
    useEffect(() => {
        if (!projectId) {
            const last = getLastProjectId();
            if (last) setProjectId(last);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Carrega a lista de projetos do combobox uma única vez
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            setProjectId(prev => {
                if (prev && list.some(p => p.id === prev)) return prev;
                return list[0]?.id ?? null;
            });
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Carrega jornadas sempre que o projeto muda
    useEffect(() => {
        if (!projectId) {
            setJourneys([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setSelectedIds(new Set());
        setLastProjectId(projectId);
        (async () => {
            const { journeys: list, migrationMissing: mm } = await loadJourneys(projectId);
            if (cancelled) return;
            setJourneys(list);
            setMigrationMissing(mm);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [projectId]);

    const sortedJourneys = useMemo(
        () => [...journeys].sort((a, b) => (a.sequence - b.sequence) || a.title.localeCompare(b.title)),
        [journeys],
    );

    const deletingTarget = deletingId ? journeys.find(j => j.id === deletingId) : null;

    const handleSave = async (draft: QAJourneyDraft) => {
        try {
            if (editing) {
                const updated = await updateJourney(editing.id, draft);
                setJourneys(prev => prev.map(j => j.id === updated.id ? updated : j));
                setEditing(null);
            } else {
                const created = await createJourney(draft);
                setJourneys(prev => [...prev, created]);
                setCreating(false);
            }
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao salvar Jornada: ' + msg);
            throw e;
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        const targetId = deletingId;
        setDeletingId(null);
        try {
            await deleteJourney(targetId);
            setJourneys(prev => prev.filter(j => j.id !== targetId));
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao excluir: ' + msg);
        }
    };

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allSelected = sortedJourneys.length > 0 && sortedJourneys.every(j => selectedIds.has(j.id));
    const someSelected = selectedIds.size > 0 && !allSelected;

    const toggleSelectAll = () => {
        setSelectedIds(allSelected ? new Set() : new Set(sortedJourneys.map(j => j.id)));
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        setBulkDeleting(false);
        try {
            await deleteJourneys(ids);
            const removed = new Set(ids);
            setJourneys(prev => prev.filter(j => !removed.has(j.id)));
            setSelectedIds(new Set());
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao excluir jornadas: ' + msg);
        }
    };

    const togglePublished = async (j: QAJourney) => {
        const next = !j.is_published;
        // Optimistic update
        setJourneys(prev => prev.map(x => x.id === j.id ? { ...x, is_published: next } : x));
        try {
            await setJourneyPublished(j.id, next);
        } catch (e: unknown) {
            // Rollback
            setJourneys(prev => prev.map(x => x.id === j.id ? { ...x, is_published: !next } : x));
            const msg = errorMessage(e);
            alert('Erro ao alternar publicação: ' + msg);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <MapIcon className="w-6 h-6 text-brand" />
                            Jornadas — Admin
                        </h1>
                        <Link
                            href={`/dashboard/qa-journey?project=${projectId}`}
                            className="text-xs font-bold text-brand border border-brand/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 hover:bg-brand/10 transition-colors"
                            title="Abrir o mapa visual das jornadas deste projeto"
                        >
                            <Eye className="w-3.5 h-3.5" /> Ver mapa
                        </Link>
                    </div>
                    <p className="text-textSecondary mt-1">
                        Cadastre as Jornadas (blocos macro), Sub-fluxos e Casos que vão alimentar o mapa público.
                    </p>
                </div>

                {/* Ordem fixa: Projeto → Nova Jornada → menu ⋮ */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label
                            htmlFor="qa-journey-admin-project"
                            className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0"
                        >
                            Projeto
                        </label>
                        <select
                            id="qa-journey-admin-project"
                            value={projectId}
                            onChange={e => setProjectId(e.target.value || null)}
                            className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[180px]"
                            disabled={projects.length === 0}
                        >
                            {projects.length === 0 && <option value="">Sem projetos cadastrados</option>}
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <button
                        onClick={() => setCreating(true)}
                        disabled={!projectId || migrationMissing}
                        className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nova Jornada
                    </button>

                    <AdminActionsMenu projectId={projectId} />
                </div>
            </div>

            {/* Migration banner */}
            {migrationMissing && <MigrationMissingBanner />}

            {/* Barra de ações em lote */}
            {!migrationMissing && selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-4 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
                    <span className="text-sm font-medium text-foreground">
                        {selectedIds.size} {selectedIds.size === 1 ? 'jornada selecionada' : 'jornadas selecionadas'}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Limpar seleção
                        </button>
                        <button
                            onClick={() => setBulkDeleting(true)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Excluir selecionadas
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {!migrationMissing && (
                <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                            <thead className="text-[10px] uppercase bg-surface-muted/50 text-muted-foreground font-bold tracking-widest border-b border-border">
                                <tr>
                                    <th className="px-6 py-4 w-12">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={el => { if (el) el.indeterminate = someSelected; }}
                                            onChange={toggleSelectAll}
                                            disabled={sortedJourneys.length === 0}
                                            className="w-4 h-4 rounded border-border accent-brand cursor-pointer disabled:cursor-not-allowed"
                                            aria-label="Selecionar todas as jornadas"
                                        />
                                    </th>
                                    <th className="px-6 py-4 w-12">Ordem</th>
                                    <th className="px-6 py-4">Jornada</th>
                                    <th className="px-6 py-4">Slug</th>
                                    <th className="px-6 py-4 w-32">Publicada</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sortedJourneys.map(j => (
                                    <tr
                                        key={j.id}
                                        className={`transition-colors ${selectedIds.has(j.id) ? 'bg-brand/5' : 'hover:bg-accent'}`}
                                    >
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(j.id)}
                                                onChange={() => toggleSelected(j.id)}
                                                className="w-4 h-4 rounded border-border accent-brand cursor-pointer"
                                                aria-label={`Selecionar jornada ${j.title}`}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-xs text-muted-foreground font-mono">{j.sequence}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="w-3 h-3 rounded-full border border-border shrink-0"
                                                    style={{ background: j.color || '#7c3aed' }}
                                                />
                                                <Link
                                                    href={`/dashboard/qa-journey/admin/${j.id}`}
                                                    className="font-bold text-foreground hover:text-brand flex items-center gap-1"
                                                >
                                                    {j.title}
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                </Link>
                                            </div>
                                            {j.description && (
                                                <p className="text-xs text-muted-foreground mt-1 max-w-md truncate">{j.description}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground">{j.slug}</td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => togglePublished(j)}
                                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${
                                                    j.is_published
                                                        ? 'bg-success/10 text-success hover:bg-success/20'
                                                        : 'bg-muted text-muted-foreground hover:bg-accent'
                                                }`}
                                                title={j.is_published ? 'Visível no mapa público' : 'Oculta do mapa público'}
                                            >
                                                {j.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                {j.is_published ? 'Sim' : 'Não'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => setEditing(j)}
                                                    className="p-2 rounded-lg text-muted-foreground hover:bg-brand/10 hover:text-brand transition-all"
                                                    title="Editar Jornada"
                                                    aria-label="Editar"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeletingId(j.id)}
                                                    className="p-2 rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger transition-all"
                                                    title="Excluir Jornada"
                                                    aria-label="Excluir"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {loading && (
                        <div className="p-8 text-center text-textSecondary text-sm">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                            Carregando jornadas…
                        </div>
                    )}
                    {!loading && sortedJourneys.length === 0 && (
                        <div className="p-8 text-center text-textSecondary text-sm">
                            {projectId
                                ? 'Nenhuma jornada cadastrada ainda para este projeto. Clique em "Nova Jornada" para começar.'
                                : 'Selecione um projeto para ver as Jornadas.'}
                        </div>
                    )}
                </div>
            )}

            {(creating || editing) && projectId && (
                <JourneyFormModal
                    projectId={projectId}
                    initial={editing}
                    defaultSequence={journeys.length > 0 ? Math.max(...journeys.map(j => j.sequence)) + 1 : 0}
                    onClose={() => { setCreating(false); setEditing(null); }}
                    onSave={handleSave}
                />
            )}

            {deletingTarget && (
                <DeleteConfirmModal
                    title="Excluir Jornada?"
                    message={`A jornada "${deletingTarget.title}" e TODOS os sub-fluxos e casos vinculados serão excluídos permanentemente.`}
                    onCancel={() => setDeletingId(null)}
                    onConfirm={handleDelete}
                />
            )}

            {bulkDeleting && (
                <DeleteConfirmModal
                    title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? 'jornada' : 'jornadas'}?`}
                    message={`${selectedIds.size === 1 ? 'A jornada selecionada' : 'As jornadas selecionadas'} e TODOS os sub-fluxos e casos vinculados serão excluídos permanentemente. Esta ação não pode ser desfeita.`}
                    confirmLabel={`Excluir ${selectedIds.size}`}
                    onCancel={() => setBulkDeleting(false)}
                    onConfirm={handleBulkDelete}
                />
            )}
        </div>
    );
}

// Menu ⋮ com as ações secundárias do admin (Insights, Sync Sheets, Histórico).
function AdminActionsMenu({ projectId }: { projectId: string }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const items = [
        { href: `/dashboard/qa-journey/insights?project=${projectId}`, icon: BarChart3, label: 'Insights' },
        { href: `/dashboard/qa-journey/admin/sheets?project=${projectId}`, icon: FileSpreadsheet, label: 'Sync Sheets' },
        { href: `/dashboard/qa-journey/admin/syncs?project=${projectId}`, icon: History, label: 'Histórico' },
    ];

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`border border-border rounded-lg p-2 transition-colors ${
                    open ? 'text-brand bg-brand/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title="Mais ações"
                aria-label="Mais ações"
                aria-expanded={open}
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-xl shadow-xl py-1.5 z-30">
                    {items.map(item => (
                        <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
