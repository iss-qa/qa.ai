'use client';

import { ArrowLeft, Smartphone, Save, Loader2, Play } from 'lucide-react';
import Link from 'next/link';

export function EditorHeader({
    currentProjectId,
    testName,
    projectName,
    stepsCount,
    isExecuting,
    hasConnectedDevice,
    onSave,
    onExecute,
}: {
    currentProjectId: string | null;
    testName: string;
    projectName: string;
    stepsCount: number;
    isExecuting: boolean;
    hasConnectedDevice: boolean;
    onSave: () => void;
    onExecute: () => void;
}) {
    return (
        <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-4">
                <Link href={currentProjectId ? `/dashboard/projects/${currentProjectId}` : '/dashboard/projects'} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center">
                        <Smartphone className="w-4 h-4 text-brand" />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm">{testName || 'Novo Teste'}</h1>
                        <p className="text-xs text-muted-foreground">Projeto: {projectName || 'Sem projeto'}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors border border-border"
                >
                    <Save className="w-4 h-4" /> Salvar
                </button>
                <button
                    onClick={onExecute}
                    disabled={isExecuting || stepsCount === 0 || !hasConnectedDevice}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 text-white rounded-md transition-colors shadow-sm shadow-green-500/20"
                >
                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {isExecuting ? 'EXECUTANDO...' : 'EXECUTAR TESTE'}
                </button>
            </div>
        </header>
    );
}
