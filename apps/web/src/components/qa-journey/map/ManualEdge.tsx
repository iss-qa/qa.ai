'use client';

// Conexão manual (estilo Miro) com botão "×" no meio para excluir a linha.
// O botão aparece no hover/seleção; clicar remove a conexão via data.onDelete.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { X } from 'lucide-react';

export interface ManualEdgeData {
    onDelete?: () => void;
}

export function ManualEdge({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    markerEnd, style, data, selected,
}: EdgeProps<ManualEdgeData>) {
    const [path, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    });

    return (
        <>
            <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                <button
                    type="button"
                    className={`nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-popover border flex items-center justify-center shadow transition-all ${
                        selected
                            ? 'opacity-100 border-danger text-danger scale-110'
                            : 'opacity-0 border-border text-muted-foreground hover:opacity-100 hover:border-danger hover:text-danger'
                    }`}
                    style={{ left: labelX, top: labelY, pointerEvents: 'all' }}
                    onClick={e => { e.stopPropagation(); data?.onDelete?.(); }}
                    title="Excluir conexão"
                    aria-label="Excluir conexão"
                >
                    <X className="w-3 h-3" />
                </button>
            </EdgeLabelRenderer>
        </>
    );
}
