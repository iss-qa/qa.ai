'use client';

import { Bot, Loader2 } from 'lucide-react';

export function AiFeedbackPanel({ aiFeedbackText }: { aiFeedbackText: string }) {
    return (
        <div className="bg-black/40 border border-brand/20 p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shrink-0 shadow-lg shadow-black/20">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-50 animate-[pulse_2s_ease-in-out_infinite]" />
            <div className="flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-wider">
                <Bot className="w-4 h-4 animate-pulse" />
                O que a IA está pensando...
            </div>
            <div className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                {aiFeedbackText}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Gerando passos de teste em tempo real
            </div>
        </div>
    );
}
