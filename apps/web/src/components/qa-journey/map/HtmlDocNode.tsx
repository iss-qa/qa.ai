'use client';

// Nó do mapa que renderiza um documento HTML (de jornada OU sub-fluxo) como uma
// "webview": aparece quando o nó pai é expandido, em tamanho médio, arrastável
// pela barra de título e redimensionável pelas bordas (conteúdo responsivo).

import { memo, useState } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import { FileCode2, Maximize2 } from 'lucide-react';

export interface HtmlDocNodeData {
    docId: string;        // id do dono (journey.id ou subflow.id) — passado p/ onOpenFull
    title: string;        // título exibido na barra ("Documento — {title}")
    html: string;         // conteúdo HTML (self-contained quando veio de .zip)
    color?: string;       // cor de acento (cor da jornada)
    // Abre o documento no modal de tela cheia.
    onOpenFull: (docId: string) => void;
}

export const HtmlDocNode = memo(function HtmlDocNode({
    data,
    selected,
    dragging,
}: {
    data: HtmlDocNodeData;
    selected?: boolean;
    dragging?: boolean;
}) {
    const { docId, title, html, onOpenFull } = data;
    const color = data.color || '#7c3aed';
    const [resizing, setResizing] = useState(false);

    return (
        <div
            className={`relative w-full h-full bg-card border rounded-2xl shadow-lg overflow-hidden flex flex-col transition-colors ${
                selected ? 'border-brand ring-2 ring-brand/30' : 'border-border'
            }`}
            style={{ boxShadow: `0 0 24px ${color}22` }}
        >
            {/* Sempre ativo: basta levar o ponteiro à borda/canto para esticar,
                sem precisar selecionar o nó antes. Handles e linhas com hitbox
                generosa (~14px) para o cursor "pegar" de primeira. */}
            <NodeResizer
                isVisible={true}
                minWidth={360}
                minHeight={260}
                maxWidth={2000}
                maxHeight={1400}
                lineClassName="!border-[5px] !border-transparent hover:!border-brand/30"
                handleClassName={`!w-3.5 !h-3.5 !rounded ${selected ? '!bg-brand !border-brand' : '!bg-brand/50 !border-transparent'}`}
                onResizeStart={() => setResizing(true)}
                onResizeEnd={() => setResizing(false)}
            />

            <Handle type="target" position={Position.Left} className="!bg-brand/40 !border-none !w-2 !h-2" />

            {/* Barra de título — cursor de mover (o nó inteiro é arrastável) */}
            <div className="html-doc-drag cursor-move flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-muted/60 shrink-0 select-none">
                <FileCode2 className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="text-[11px] font-bold text-foreground truncate flex-1">
                    Documento — {title}
                </span>
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpenFull(docId); }}
                    className="nodrag p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Abrir em tela cheia"
                    aria-label="Abrir documento em tela cheia"
                >
                    <Maximize2 className="w-3 h-3" />
                </button>
            </div>

            {/* O iframe captura o mouse — se ficasse sempre ativo, o ponteiro
                "travava" sobre o documento (não dá p/ arrastar/pan o canvas nem
                mover o nó). Solução: só fica interativo quando o nó está
                SELECIONADO (e fora de drag/resize). Sem seleção é pass-through:
                o nó pode ser arrastado por qualquer ponto e o canvas pana. */}
            <iframe
                srcDoc={html || ''}
                sandbox="allow-scripts"
                className="nodrag nowheel flex-1 w-full bg-white"
                style={{ pointerEvents: dragging || resizing || !selected ? 'none' : 'auto' }}
                title={`Documento HTML — ${title}`}
            />

            {/* Dica de interação enquanto não selecionado. */}
            {!selected && !dragging && !resizing && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none px-2 py-1 rounded-md bg-popover/90 border border-border text-[10px] text-muted-foreground shadow-sm whitespace-nowrap">
                    Clique para interagir · arraste para mover
                </div>
            )}
        </div>
    );
});
