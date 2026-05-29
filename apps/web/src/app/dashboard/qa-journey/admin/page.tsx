'use client';

import { useEffect, useMemo, useState } from 'react';
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
    loadJourneys,
    loadProjectOptions,
    setJourneyPublished,
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

    // Carrega projetos uma vez
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            if (!projectId && list.length > 0) {
                setProjectId(list[0].id);
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, setProjectId]);

    // Carrega jornadas sempre que o projeto muda
    useEffect(() => {
        if (!projectId) {
            setJourneys([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
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
            const msg = e instanceof Error ? e.message : String(e);
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
            const msg = e instanceof Error ? e.message : String(e);
            alert('Erro ao excluir: ' + msg);
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
            const msg = e instanceof Error ? e.message : String(e);
            alert('Erro ao alternar publicação: ' + msg);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <MapIcon className="w-6 h-6 text-brand" />
                        Jornada do QA — Admin
                    </h1>
                    <p className="text-textSecondary mt-1">
                        Cadastre as Jornadas (blocos macro), Sub-fluxos e Casos que vão alimentar o mapa público.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={projectId}
                        onChange={e => setProjectId(e.target.value || null)}
                        className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[200px]"
                        disabled={projects.length === 0}
                    >
                        {projects.length === 0 && <option value="">Sem projetos cadastrados</option>}
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>

                    <Link
                        href={`/dashboard/qa-journey/insights?project=${projectId}`}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                    >
                        <BarChart3 className="w-3.5 h-3.5" /> Insights
                    </Link>

                    <Link
                        href={`/dashboard/qa-journey/admin/sheets?project=${projectId}`}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Sync Sheets
                    </Link>

                    <Link
                        href={`/dashboard/qa-journey/admin/syncs?project=${projectId}`}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                    >
                        <History className="w-3.5 h-3.5" /> Histórico
                    </Link>

                    <button
                        onClick={() => setCreating(true)}
                        disabled={!projectId || migrationMissing}
                        className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nova Jornada
                    </button>
                </div>
            </div>

            {/* Migration banner */}
            {migrationMissing && <MigrationMissingBanner />}

            {/* List */}
            {!migrationMissing && (
                <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                            <thead className="text-[10px] uppercase bg-surface-muted/50 text-muted-foreground font-bold tracking-widest border-b border-border">
                                <tr>
                                    <th className="px-6 py-4 w-12">Ordem</th>
                                    <th className="px-6 py-4">Jornada</th>
                                    <th className="px-6 py-4">Slug</th>
                                    <th className="px-6 py-4 w-32">Publicada</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sortedJourneys.map(j => (
                                    <tr key={j.id} className="hover:bg-accent transition-colors">
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
        </div>
    );
}
