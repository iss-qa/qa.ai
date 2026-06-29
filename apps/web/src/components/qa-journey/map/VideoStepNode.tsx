'use client';

// Nó-imagem do storyboard de vídeo: um print de uma tela do vídeo + legenda
// abaixo. Encadeados por setas no mapa formam o passo a passo da jornada.
// Clicar na imagem abre o lightbox (zoom). Redimensionável pelas bordas.

import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import { Maximize2 } from 'lucide-react';
import { ConnectHandles, RESIZER_HANDLE, RESIZER_LINE } from './annotation-handles';
import type { VideoStep } from '@/types/qa-journey';

export interface VideoStepNodeData {
    step: VideoStep;
    index: number;        // posição (1-based) exibida no canto
    color?: string;       // cor de acento (cor da jornada)
    onZoom: (step: VideoStep) => void;
    // Quando presente, a legenda vira editável no próprio mapa e o commit
    // (onBlur) persiste no banco via o pai.
    onCaptionCommit?: (caption: string) => void;
}

export const VideoStepNode = memo(function VideoStepNode({ data, selected }: { data: VideoStepNodeData; selected?: boolean }) {
    const { step, index, onZoom, onCaptionCommit } = data;
    const color = data.color || '#7c3aed';
    const editable = Boolean(onCaptionCommit);

    // Rascunho local da legenda — commit no onBlur. Sincroniza se a prop mudar
    // por uma edição externa (ex.: edição pelo modal do sub-fluxo).
    const [draft, setDraft] = useState(step.caption);
    const lastProp = useRef(step.caption);
    useEffect(() => {
        if (step.caption !== lastProp.current) {
            lastProp.current = step.caption;
            setDraft(step.caption);
        }
    }, [step.caption]);

    const commit = () => {
        const v = draft.trim();
        if (v !== (step.caption ?? '')) onCaptionCommit?.(v);
    };

    return (
        <div
            className={`group relative w-full h-full bg-card border rounded-2xl shadow-lg overflow-hidden flex flex-col transition-colors ${
                selected ? 'border-brand ring-2 ring-brand/30' : 'border-border'
            }`}
            style={{ boxShadow: `0 0 24px ${color}22` }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={160}
                minHeight={180}
                maxWidth={640}
                maxHeight={900}
                lineClassName={RESIZER_LINE}
                handleClassName={RESIZER_HANDLE}
            />
            {/* 4 pontos de conexão (estilo Miro) — ligar imagem↔imagem, sticky↔imagem, etc. */}
            <ConnectHandles />

            {/* Imagem (clique → lightbox). object-contain serve para print de
                celular (retrato) e de web (paisagem) sem distorcer. */}
            <button
                type="button"
                onClick={() => onZoom(step)}
                className="nodrag relative flex-1 min-h-0 bg-foreground/5 flex items-center justify-center group"
                title="Ampliar"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.image_url} alt={`Tela ${index}`} className="w-full h-full object-contain" draggable={false} />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-popover/90 border border-border text-[10px] font-bold text-foreground">
                    {index}
                </span>
                <span className="absolute top-1.5 right-1.5 p-1 rounded-md bg-popover/80 border border-border text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3 h-3" />
                </span>
            </button>

            {/* Legenda abaixo da imagem — editável inline quando o mapa permite */}
            <div className="shrink-0 border-t border-border px-2.5 py-2 bg-surface-muted/40">
                {editable ? (
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onPointerDown={e => e.stopPropagation()}
                        rows={2}
                        placeholder="Clique para escrever a legenda…"
                        className="nodrag nowheel w-full bg-transparent text-[11px] text-foreground leading-snug resize-none focus:outline-none placeholder:text-muted-foreground/50"
                    />
                ) : step.caption ? (
                    <p className="text-[11px] text-foreground leading-snug line-clamp-3">{step.caption}</p>
                ) : (
                    <p className="text-[11px] text-muted-foreground/60 italic leading-snug">Sem descrição</p>
                )}
            </div>
        </div>
    );
});
