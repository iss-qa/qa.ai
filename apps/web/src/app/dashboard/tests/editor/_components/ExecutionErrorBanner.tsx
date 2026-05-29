'use client';

import { AlertTriangle, Copy, X } from 'lucide-react';
import type { ExecutionErrorState } from '../editor-types';

export function ExecutionErrorBanner({
    executionError,
    onClose,
}: {
    executionError: ExecutionErrorState;
    onClose: () => void;
}) {
    return (
        <div className="absolute bottom-4 left-4 right-4 z-40 max-w-2xl mx-auto bg-popover border border-red-500/40 rounded-lg shadow-2xl">
            <div className="px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-red-300">Executar Teste falhou</span>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(executionError.message);
                                    } catch { /* clipboard may be blocked */ }
                                }}
                                className="px-2 py-0.5 bg-foreground/5 hover:bg-foreground/10 border border-border rounded text-[10px] font-bold text-muted-foreground flex items-center gap-1"
                                title="Copiar mensagem de erro"
                            >
                                <Copy className="w-3 h-3" /> Copiar
                            </button>
                            <button
                                onClick={onClose}
                                className="p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-foreground/5"
                                title="Fechar"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    {executionError.yamlPath && (
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                            {executionError.yamlPath}
                        </div>
                    )}
                    <pre className="mt-2 max-h-48 overflow-auto bg-black/40 border border-red-500/20 rounded p-2 text-[11px] text-red-200 font-mono whitespace-pre-wrap break-words leading-snug">
                        {executionError.message}
                    </pre>
                    <p className="mt-2 text-[10px] text-zinc-500">
                        Veja o YAML enviado no console (DevTools), e a stdout/stderr do <code className="text-amber-400">maestro test</code> no terminal do daemon (linhas <code className="text-amber-400">[runtest stdout]</code> / <code className="text-amber-400">[runtest stderr]</code>).
                    </p>
                </div>
            </div>
        </div>
    );
}
