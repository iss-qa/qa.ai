'use client';

import { Plus, FlaskConical, Trash2, ListPlus, Clapperboard } from 'lucide-react';

// Painel enxuto: a caixa de prompt "Descreva o teste...", o módulo de
// Screenshots de referências (VisualGuide) e os seletores de engine/modelo (LLM)
// foram REMOVIDOS a pedido — sobra apenas o menu de ações (+). Props extras
// seguem aceitas (não desestruturadas) para não quebrar o call-site.
export function PromptInputPanel({
    isRecordingActive,
    showPlusMenu,
    setShowPlusMenu,
    stepsCount,
    onMockGenerate,
    onClearSteps,
    onToggleRecording,
    onStartRecording,
    onOpenStepTemplates,
    onOpenMaestroStudio,
}: {
    selectedEngine: 'uiautomator2' | 'maestro';
    setSelectedEngine: (engine: 'uiautomator2' | 'maestro') => void;
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    prompt: string;
    setPrompt: (prompt: string) => void;
    isGenerating: boolean;
    isExecuting: boolean;
    isRecordingActive: boolean;
    showPlusMenu: boolean;
    setShowPlusMenu: (show: boolean) => void;
    stepsCount: number;
    currentProjectId: string | null;
    onGenerate: () => void;
    onMockGenerate: () => void;
    onClearSteps: () => void;
    onToggleRecording: () => void;
    onStartRecording: () => void;
    onOpenStepTemplates: () => void;
    onOpenMaestroStudio: () => void;
    onOpenPromptExamples: () => void;
}) {
    return (
        <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-card">
            {/* Barra de ações compacta (sem prompt nem screenshots) */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl transition-colors">
                <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        {/* Plus menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowPlusMenu(!showPlusMenu)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${showPlusMenu ? 'bg-zinc-600 text-white rotate-45' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700'}`}
                            >
                                <Plus className="w-4 h-4" />
                            </button>

                            {showPlusMenu && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowPlusMenu(false)} />
                                    <div className="absolute bottom-9 left-0 bg-popover border border-border rounded-xl shadow-2xl py-1.5 z-40 w-48 animate-[fadeIn_0.1s_ease-out]">
                                        <button
                                            onClick={() => { onMockGenerate(); setShowPlusMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                        >
                                            <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                                            Mock - Teste exemplo
                                        </button>
                                        {stepsCount > 0 && (
                                            <button
                                                onClick={() => { onClearSteps(); setShowPlusMenu(false); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Limpar passos ({stepsCount})
                                            </button>
                                        )}
                                        <div className="border-t border-border my-1" />
                                        <button
                                            onClick={() => { if (isRecordingActive) { onToggleRecording(); } else { onStartRecording(); } setShowPlusMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                        >
                                            <div className={`w-3.5 h-3.5 rounded-full ${isRecordingActive ? 'bg-red-500' : 'border-2 border-red-400'}`} />
                                            {isRecordingActive ? 'Parar gravacao' : 'Gravar testes'}
                                        </button>
                                        <button
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            onClick={() => { onOpenStepTemplates(); setShowPlusMenu(false); }}
                                        >
                                            <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
                                            Adicionar passo
                                        </button>
                                        <button
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            onClick={() => { onOpenMaestroStudio(); setShowPlusMenu(false); }}
                                        >
                                            <Clapperboard className="w-3.5 h-3.5 text-orange-400" />
                                            Maestro Studio
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
