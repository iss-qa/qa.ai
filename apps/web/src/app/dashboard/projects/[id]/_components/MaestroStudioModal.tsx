'use client';

import { type RefObject } from 'react';
import { Wand2, CheckCircle2, RefreshCw, ExternalLink, X, Smartphone } from 'lucide-react';

interface MaestroStudioModalProps {
    maestroPhase: 'starting' | 'ready' | 'error';
    maestroReloadKey: number;
    maestroIframeRef: RefObject<HTMLIFrameElement>;
    embedUrl: string;
    apiUrl: string;
    onSaveAsTest: () => void;
    onReload: () => void;
    onRetry: () => void;
    onClose: () => void;
}

export function MaestroStudioModal({
    maestroPhase,
    maestroReloadKey,
    maestroIframeRef,
    embedUrl,
    apiUrl,
    onSaveAsTest,
    onReload,
    onRetry,
    onClose,
}: MaestroStudioModalProps) {
    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
            {/* Header — compact single-line bar */}
            <div className="flex items-center justify-between px-4 h-9 border-b border-border bg-card shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <Wand2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <h2 className="text-xs font-bold text-foreground whitespace-nowrap">Maestro Studio</h2>
                    <span className="text-[10px] text-muted-foreground font-mono truncate flex items-center gap-1.5">
                        {apiUrl}
                        {maestroPhase === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-success inline-block animate-pulse" />}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onSaveAsTest}
                        className="px-2.5 h-7 text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 rounded-md transition-colors flex items-center gap-1.5 mr-1"
                        title="Salvar o arquivo aberto no editor como um teste do projeto"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Salvar como Teste
                    </button>
                    <button
                        onClick={onReload}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                        title="Recarregar"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <a
                        href={embedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                        title="Abrir em nova aba (tela cheia)"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                        title="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 relative overflow-hidden">

                {/* ── STARTING: quick ping in progress ── */}
                {maestroPhase === 'starting' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                        <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-violet-400 animate-spin" />
                    </div>
                )}

                {/* ── ERROR: no device connected ── */}
                {maestroPhase === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-card z-10 p-8">
                        <div className="w-20 h-20 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center">
                            <Smartphone className="w-10 h-10 text-warning" />
                        </div>
                        <div className="text-center">
                            <p className="text-foreground font-bold text-xl">Nenhum dispositivo conectado</p>
                            <p className="text-muted-foreground text-sm mt-2">Conecte um dispositivo Android via USB para usar o Maestro Studio</p>
                        </div>
                        <button
                            onClick={onRetry}
                            className="px-8 py-3 bg-violet-500 text-white font-bold rounded-xl hover:bg-violet-600 active:scale-95 transition-all flex items-center gap-2 text-sm"
                        >
                            <RefreshCw className="w-4 h-4" /> Tentar novamente
                        </button>
                    </div>
                )}

                {/* ── READY: render the embedded Maestro Studio frontend ── */}
                {maestroPhase === 'ready' && (
                    <iframe
                        ref={maestroIframeRef}
                        key={maestroReloadKey}
                        src={embedUrl}
                        className="w-full h-full border-0"
                        allow="clipboard-read; clipboard-write"
                        title="Maestro Studio"
                    />
                )}
            </div>
        </div>
    );
}
