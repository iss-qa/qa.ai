'use client';

import { CheckCircle2, X, Loader2, AlertTriangle } from 'lucide-react';
import type { TestStep } from '../project-types';

interface SaveAsTestData {
    path: string;
    name: string;
    content: string;
    steps: TestStep[];
    appId: string | null;
}

interface SaveAsTestModalProps {
    saveAsTestPhase: 'loading' | 'review' | 'saving' | 'error' | 'success';
    saveAsTestData: SaveAsTestData | null;
    saveAsTestName: string;
    setSaveAsTestName: (name: string) => void;
    saveAsTestError: string;
    onClose: () => void;
    onConfirm: () => void;
}

export function SaveAsTestModal({
    saveAsTestPhase,
    saveAsTestData,
    saveAsTestName,
    setSaveAsTestName,
    saveAsTestError,
    onClose,
    onConfirm,
}: SaveAsTestModalProps) {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-violet-400" /> Salvar como Teste
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6">
                    {saveAsTestPhase === 'loading' && (
                        <div className="flex items-center gap-3 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Lendo arquivo aberto no editor...
                        </div>
                    )}

                    {saveAsTestPhase === 'error' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2 text-danger text-sm">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{saveAsTestError}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Abra um arquivo .yaml no editor do Maestro Studio antes de salvar.
                            </p>
                        </div>
                    )}

                    {saveAsTestPhase === 'review' && saveAsTestData && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Arquivo</label>
                                <div className="text-xs text-muted-foreground font-mono truncate">{saveAsTestData.path}</div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nome do teste</label>
                                <input
                                    type="text"
                                    value={saveAsTestName}
                                    onChange={(e) => setSaveAsTestName(e.target.value)}
                                    className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold">{saveAsTestData.steps.length} passos</span>
                                <span>parseados do YAML</span>
                            </div>
                        </div>
                    )}

                    {saveAsTestPhase === 'saving' && (
                        <div className="flex items-center gap-3 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Salvando no projeto...
                        </div>
                    )}

                    {saveAsTestPhase === 'success' && (
                        <div className="flex items-center gap-2 text-success text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            Teste salvo. Atualizando lista...
                        </div>
                    )}
                </div>

                <div className="p-6 pt-2 flex gap-3 justify-end border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {saveAsTestPhase === 'success' ? 'Fechar' : 'Cancelar'}
                    </button>
                    {saveAsTestPhase === 'review' && (
                        <button
                            onClick={onConfirm}
                            disabled={!saveAsTestName.trim()}
                            className="px-5 py-2 bg-violet-500 text-white text-sm font-bold rounded-lg hover:bg-violet-600 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            <CheckCircle2 className="w-4 h-4" /> Salvar teste
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
