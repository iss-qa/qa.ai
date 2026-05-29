'use client';

import { Loader2, Save } from 'lucide-react';

export function SaveTestDialog({
    projectName,
    stepsCount,
    testName,
    isSaving,
    onCancel,
    onSave,
}: {
    projectName: string;
    stepsCount: number;
    testName: string;
    isSaving: boolean;
    onCancel: () => void;
    onSave: (name: string) => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-popover border border-border rounded-2xl p-6 w-[380px] shadow-2xl">
                <h3 className="text-lg font-bold text-foreground mb-1">Salvar Teste</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Projeto: <span className="text-foreground font-medium">{projectName || 'Sem projeto'}</span>
                    {' '}&middot;{' '}{stepsCount} passos
                </p>
                <input
                    type="text"
                    autoFocus
                    placeholder="Nome do teste (ex: Login com email valido)"
                    defaultValue={testName}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSave((e.target as HTMLInputElement).value);
                    }}
                    id="save-test-name-input"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder-zinc-500"
                />
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-foreground hover:border-zinc-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            const input = document.getElementById('save-test-name-input') as HTMLInputElement;
                            onSave(input?.value || '');
                        }}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
