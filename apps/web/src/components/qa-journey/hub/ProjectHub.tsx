'use client';

import { useState } from 'react';
import {
    ArrowRight, ChevronDown, LayoutGrid, Loader2, Map as MapIcon,
    MoreVertical, Pencil, Plus, Route, Trash2,
} from 'lucide-react';
import {
    createJourney, deleteJourney, loadJourneys, updateJourney,
    type ProjectHubCard,
} from '@/lib/qa-journey/api';
import type { QAJourney, QAJourneyDraft } from '@/types/qa-journey';
import { JourneyFormModal } from '@/components/qa-journey/JourneyFormModal';
import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';

/**
 * Hub de Jornadas — primeira tela ao clicar em "Jornadas".
 * Mostra um card por projeto; ao escolher um projeto:
 *   - modo 'single' -> abre direto o mapa completo;
 *   - modo 'cards'  -> abre o hub de cards de jornada do projeto.
 * O switch no card alterna o modo (a "marcação" que o PO faz).
 *
 * O menu ⋮ de cada card permite criar uma nova jornada e gerenciar
 * (editar/excluir) as jornadas do projeto sem precisar entrar no board.
 */
export function ProjectHub({
    projects,
    loading,
    onSelect,
    onToggleMode,
    onChanged,
}: {
    projects: ProjectHubCard[];
    loading: boolean;
    onSelect: (projectId: string) => void;
    onToggleMode: (projectId: string, mode: 'single' | 'cards') => void;
    // Notifica o pai após criar/excluir (para recarregar a contagem de jornadas).
    onChanged: () => void;
}) {
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [expandedFor, setExpandedFor] = useState<string | null>(null);
    const [journeysByProject, setJourneysByProject] = useState<Record<string, QAJourney[]>>({});
    const [loadingFor, setLoadingFor] = useState<string | null>(null);
    // Modal de criar/editar jornada.
    const [form, setForm] = useState<{ projectId: string; initial: QAJourney | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<QAJourney | null>(null);

    const loadFor = async (projectId: string) => {
        setLoadingFor(projectId);
        const res = await loadJourneys(projectId);
        setJourneysByProject(prev => ({ ...prev, [projectId]: res.journeys }));
        setLoadingFor(null);
    };

    const toggleManage = async (projectId: string) => {
        setMenuFor(null);
        if (expandedFor === projectId) { setExpandedFor(null); return; }
        setExpandedFor(projectId);
        if (!journeysByProject[projectId]) await loadFor(projectId);
    };

    const openCreate = (projectId: string) => {
        setMenuFor(null);
        setForm({ projectId, initial: null });
    };

    const handleSave = async (draft: QAJourneyDraft) => {
        if (!form) return;
        if (form.initial) await updateJourney(form.initial.id, draft);
        else await createJourney(draft);
        setForm(null);
        await loadFor(form.projectId);          // atualiza a lista inline
        if (expandedFor !== form.projectId) setExpandedFor(form.projectId);
        onChanged();                            // atualiza a contagem no card
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const { id, project_id } = deleteTarget;
        setDeleteTarget(null);
        try {
            await deleteJourney(id);
            setJourneysByProject(prev => ({
                ...prev,
                [project_id]: (prev[project_id] || []).filter(j => j.id !== id),
            }));
            onChanged();
        } catch (e) {
            alert('Erro ao excluir jornada: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    if (loading) {
        return (
            <div className="bg-card border border-border rounded-2xl h-full flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-foreground font-medium">Carregando projetos…</span>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="bg-card border border-border rounded-2xl h-full flex flex-col items-center justify-center text-center gap-2 p-10">
                <p className="text-foreground text-sm">Nenhum projeto encontrado.</p>
                <p className="text-muted-foreground text-xs max-w-md">
                    Crie um projeto e cadastre jornadas no admin para vê-las aqui.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
            <div className="mb-5 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">Jornadas</h1>
                <p className="text-sm text-muted-foreground">
                    Escolha um projeto para ver o mapa de jornadas, ou use o menu ⋮ para criar e gerenciar jornadas.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...projects]
                    .sort((a, b) => (b.journey_count - a.journey_count) || a.name.localeCompare(b.name))
                    .map(p => {
                    const isCards = p.journey_view_mode === 'cards';
                    // Destaque roxo = projeto COM jornadas (>1); ordenados acima.
                    const hasJourneys = p.journey_count > 1;
                    const isExpanded = expandedFor === p.id;
                    const journeyList = journeysByProject[p.id] || [];
                    return (
                        <div
                            key={p.id}
                            className={`group rounded-2xl p-4 flex flex-col gap-3 border transition-colors ${
                                hasJourneys
                                    ? 'bg-violet-500/[0.05] border-violet-500/40 hover:border-violet-500/70'
                                    : 'bg-card border-border hover:border-brand/40'
                            }`}
                        >
                            <div className="flex items-start gap-2">
                                <button
                                    type="button"
                                    onClick={() => onSelect(p.id)}
                                    className="flex items-start gap-3 text-left flex-1 min-w-0"
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        hasJourneys ? 'bg-violet-500/15 text-violet-400' : 'bg-brand/10 text-brand'
                                    }`}>
                                        <Route className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground truncate">{p.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {p.journey_count} {p.journey_count === 1 ? 'jornada' : 'jornadas'}
                                        </p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-brand transition-colors shrink-0 mt-1" />
                                </button>

                                {/* Menu ⋮ — criar / gerenciar jornadas sem entrar no board */}
                                <div className="relative shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                                        title="Ações de jornada"
                                        aria-label="Ações de jornada"
                                        className="p-1.5 -mr-1 -mt-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    >
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                    {menuFor === p.id && (
                                        <>
                                            <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                                            <div className="absolute right-0 top-full mt-1 z-30 w-48 bg-popover border border-border rounded-lg shadow-xl py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openCreate(p.id)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors text-left"
                                                >
                                                    <Plus className="w-3.5 h-3.5 text-brand" /> Nova jornada
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleManage(p.id)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors text-left"
                                                >
                                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> Gerenciar jornadas
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className={`flex items-center justify-between border-t pt-3 ${hasJourneys ? 'border-violet-500/20' : 'border-border'}`}>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                    {isCards ? <LayoutGrid className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
                                    {isCards ? 'Cards por jornada' : 'Mapa único'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onToggleMode(p.id, isCards ? 'single' : 'cards')}
                                    title={isCards
                                        ? 'Voltar ao mapa único com todas as jornadas'
                                        : 'Separar jornadas em cards (um mapa por jornada)'}
                                    className="text-[11px] font-semibold text-brand hover:text-brand/80 transition-colors"
                                >
                                    {isCards ? 'Usar mapa único' : 'Separar em cards'}
                                </button>
                            </div>

                            {/* Gestão inline das jornadas do projeto */}
                            {isExpanded && (
                                <div className="border-t border-border pt-3 flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jornadas</span>
                                        <button
                                            type="button"
                                            onClick={() => openCreate(p.id)}
                                            className="text-[11px] font-bold text-brand hover:text-brand/80 inline-flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Nova
                                        </button>
                                    </div>
                                    {loadingFor === p.id ? (
                                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
                                        </div>
                                    ) : journeyList.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2">Nenhuma jornada ainda.</p>
                                    ) : (
                                        journeyList.map(j => (
                                            <div
                                                key={j.id}
                                                className="group/row flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/5 transition-colors"
                                            >
                                                <span
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: j.color || '#7c3aed' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(p.id)}
                                                    className="text-xs text-foreground truncate flex-1 text-left hover:text-brand transition-colors"
                                                    title={j.title}
                                                >
                                                    {j.title}
                                                </button>
                                                {!j.is_published && (
                                                    <span className="text-[8px] font-bold uppercase tracking-wide rounded px-1 py-0.5 bg-amber-500/15 text-amber-500 shrink-0">
                                                        Rascunho
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => { setMenuFor(null); setForm({ projectId: p.id, initial: j }); }}
                                                    title="Editar jornada"
                                                    aria-label="Editar jornada"
                                                    className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-accent transition-all opacity-0 group-hover/row:opacity-100"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteTarget(j)}
                                                    title="Excluir jornada"
                                                    aria-label="Excluir jornada"
                                                    className="p-1 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover/row:opacity-100"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {form && (
                <JourneyFormModal
                    projectId={form.projectId}
                    initial={form.initial}
                    defaultSequence={(journeysByProject[form.projectId] || []).length}
                    onClose={() => setForm(null)}
                    onSave={handleSave}
                />
            )}

            {deleteTarget && (
                <DeleteConfirmModal
                    title="Excluir Jornada?"
                    message={`A jornada "${deleteTarget.title}" e TODOS os sub-fluxos e casos vinculados serão excluídos permanentemente.`}
                    onCancel={() => setDeleteTarget(null)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}
