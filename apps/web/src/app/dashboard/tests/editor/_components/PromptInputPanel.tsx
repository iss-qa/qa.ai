'use client';

import { Loader2, ArrowUp, Plus, FlaskConical, Trash2, ListPlus, Clapperboard, BookOpen } from 'lucide-react';
import { VisualGuide } from '@/components/VisualGuide';
import { LLM_MODELS } from '../editor-utils';

export function PromptInputPanel({
    selectedEngine,
    setSelectedEngine,
    selectedModel,
    setSelectedModel,
    prompt,
    setPrompt,
    isGenerating,
    isExecuting,
    isRecordingActive,
    showPlusMenu,
    setShowPlusMenu,
    stepsCount,
    currentProjectId,
    onGenerate,
    onMockGenerate,
    onClearSteps,
    onToggleRecording,
    onStartRecording,
    onOpenStepTemplates,
    onOpenMaestroStudio,
    onOpenPromptExamples,
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
            <VisualGuide projectId={selectedEngine === 'maestro' ? (currentProjectId || undefined) : undefined} />

            {/* Chat-style input */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl focus-within:border-zinc-500 transition-colors">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descreva o teste que deseja criar..."
                    className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none min-h-[80px] max-h-[160px]"
                    disabled={isGenerating}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onGenerate();
                        }
                    }}
                />

                {/* Bottom bar inside input */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                    <div className="flex items-center gap-1.5">
                        {/* Engine selector pill */}
                        <select
                            value={selectedEngine}
                            onChange={(e) => setSelectedEngine(e.target.value as 'uiautomator2' | 'maestro')}
                            className="bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none pr-5 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right_6px]"
                            disabled={isGenerating || isExecuting}
                        >
                            <option value="uiautomator2">UIAutomator2</option>
                            <option value="maestro">Maestro</option>
                        </select>

                        {/* LLM selector pill */}
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none pr-5 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right_6px] max-w-[140px]"
                            disabled={isGenerating}
                        >
                            {LLM_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>

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
                                        <button
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            onClick={() => { onOpenPromptExamples(); setShowPlusMenu(false); }}
                                        >
                                            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                                            Exemplos de prompt
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Send button */}
                    <button
                        onClick={onGenerate}
                        disabled={isGenerating || !prompt.trim()}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-card text-foreground hover:bg-accent disabled:bg-zinc-600 disabled:text-zinc-400"
                    >
                        {isGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
