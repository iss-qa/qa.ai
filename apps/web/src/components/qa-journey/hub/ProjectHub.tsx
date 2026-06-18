'use client';

import { ArrowRight, LayoutGrid, Loader2, Map as MapIcon, Route } from 'lucide-react';
import type { ProjectHubCard } from '@/lib/qa-journey/api';

/**
 * Hub de Jornadas — primeira tela ao clicar em "Jornadas".
 * Mostra um card por projeto; ao escolher um projeto:
 *   - modo 'single' -> abre direto o mapa completo;
 *   - modo 'cards'  -> abre o hub de cards de jornada do projeto.
 * O switch no card alterna o modo (a "marcação" que o PO faz).
 */
export function ProjectHub({
    projects,
    loading,
    onSelect,
    onToggleMode,
}: {
    projects: ProjectHubCard[];
    loading: boolean;
    onSelect: (projectId: string) => void;
    onToggleMode: (projectId: string, mode: 'single' | 'cards') => void;
}) {
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
                    Escolha um projeto para ver o mapa de jornadas.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {projects.map(p => {
                    const isCards = p.journey_view_mode === 'cards';
                    return (
                        <div
                            key={p.id}
                            className={`group rounded-2xl p-4 flex flex-col gap-3 border transition-colors ${
                                isCards
                                    ? 'bg-violet-500/[0.05] border-violet-500/40 hover:border-violet-500/70'
                                    : 'bg-card border-border hover:border-brand/40'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(p.id)}
                                className="flex items-start gap-3 text-left"
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isCards ? 'bg-violet-500/15 text-violet-400' : 'bg-brand/10 text-brand'
                                }`}>
                                    {isCards ? <LayoutGrid className="w-5 h-5" /> : <Route className="w-5 h-5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-foreground truncate">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {p.journey_count} {p.journey_count === 1 ? 'jornada' : 'jornadas'}
                                    </p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-brand transition-colors shrink-0 mt-1" />
                            </button>

                            <div className={`flex items-center justify-between border-t pt-3 ${isCards ? 'border-violet-500/20' : 'border-border'}`}>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${isCards ? 'text-violet-400' : 'text-muted-foreground'}`}>
                                    {isCards ? <LayoutGrid className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
                                    {isCards ? 'Cards por jornada' : 'Mapa único'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onToggleMode(p.id, isCards ? 'single' : 'cards')}
                                    title={isCards
                                        ? 'Voltar ao mapa único com todas as jornadas'
                                        : 'Separar jornadas em cards (um mapa por jornada)'}
                                    className={`text-[11px] font-semibold transition-colors ${isCards ? 'text-violet-400 hover:text-violet-300' : 'text-brand hover:text-brand/80'}`}
                                >
                                    {isCards ? 'Usar mapa único' : 'Separar em cards'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
