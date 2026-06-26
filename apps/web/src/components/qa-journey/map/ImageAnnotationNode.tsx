'use client';

// Imagem livre colada/solta no canvas (não vem de vídeo). Arrastável,
// redimensionável, conectável e ampliável. Distinta do VideoStepNode (que é
// parte do storyboard de um sub-fluxo).

import { memo } from 'react';
import { NodeResizer } from 'reactflow';
import { Maximize2, Trash2 } from 'lucide-react';
import { ConnectHandles, RESIZER_HANDLE, RESIZER_LINE } from './annotation-handles';
import type { AnnotationNodeData } from './StickyNoteNode';

export const ImageAnnotationNode = memo(function ImageAnnotationNode({ data, selected }: { data: AnnotationNodeData; selected?: boolean }) {
    const { annotation, onDelete, onZoom } = data;

    return (
        <div className={`group relative w-full h-full rounded-xl overflow-hidden border bg-card shadow-lg ${selected ? 'border-brand ring-2 ring-brand/30' : 'border-border'}`}>
            <NodeResizer isVisible minWidth={80} minHeight={60} maxWidth={1200} maxHeight={1200}
                lineClassName={RESIZER_LINE} handleClassName={RESIZER_HANDLE} />
            <ConnectHandles />

            {annotation.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={annotation.imageUrl} alt="Imagem" className="w-full h-full object-contain bg-foreground/5" draggable={false} />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">sem imagem</div>
            )}

            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onZoom && (
                    <button type="button" onClick={() => onZoom(annotation)} className="nodrag p-1 rounded-md bg-popover/90 border border-border text-muted-foreground hover:text-foreground shadow" aria-label="Ampliar">
                        <Maximize2 className="w-3 h-3" />
                    </button>
                )}
                <button type="button" onClick={() => onDelete(annotation.id)} className="nodrag p-1 rounded-md bg-popover/90 border border-border text-muted-foreground hover:text-danger shadow" aria-label="Excluir">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
});
