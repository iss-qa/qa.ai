'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Smartphone, Save, Loader2, Play, MoreVertical, FolderOpen, FileDown } from 'lucide-react';
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
    onRevealInFinder,
    onOpenExport,
}: {
    currentProjectId: string | null;
    testName: string;
    projectName: string;
    stepsCount: number;
    isExecuting: boolean;
    hasConnectedDevice: boolean;
    onSave: () => void;
    onExecute: () => void;
    onRevealInFinder: () => void;
    onOpenExport: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

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
                    onClick={onExecute}
                    disabled={isExecuting || stepsCount === 0 || !hasConnectedDevice}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 text-white rounded-md transition-colors shadow-sm shadow-green-500/20"
                >
                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {isExecuting ? 'EXECUTANDO...' : 'EXECUTAR TESTE'}
                </button>

                {/* Ações secundárias agrupadas no ⋮ */}
                <div ref={menuRef} className="relative">
                    <button
                        onClick={() => setMenuOpen(o => !o)}
                        className={`p-2 rounded-md border border-border transition-colors ${
                            menuOpen ? 'text-brand bg-brand/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                        title="Mais ações"
                        aria-label="Mais ações"
                        aria-expanded={menuOpen}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-52 bg-popover border border-border rounded-xl shadow-xl py-1.5 z-30">
                            <button
                                onClick={() => { setMenuOpen(false); onSave(); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <Save className="w-4 h-4 shrink-0" />
                                Salvar
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onRevealInFinder(); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                title="Mostra o arquivo YAML do teste no Finder/Explorer"
                            >
                                <FolderOpen className="w-4 h-4 shrink-0" />
                                Abrir Arquivo
                            </button>
                            <div className="border-t border-border my-1" />
                            <button
                                onClick={() => { setMenuOpen(false); onOpenExport(); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left whitespace-nowrap text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <FileDown className="w-4 h-4 shrink-0" />
                                Exportar Resultado
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
