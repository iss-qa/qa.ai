'use client';

// Sticky note (anotação visual) do canvas. Texto editável inline, cor
// trocável, redimensionável e conectável. Estilo Miro/Figma.

import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { ConnectHandles, RESIZER_HANDLE, RESIZER_LINE } from './annotation-handles';
import { ANNOTATION_COLORS, type CanvasAnnotation } from './canvas-annotations';

export interface AnnotationNodeData {
    annotation: CanvasAnnotation;
    onChange: (id: string, patch: Partial<CanvasAnnotation>) => void;
    onDelete: (id: string) => void;
    onZoom?: (a: CanvasAnnotation) => void;
}

export const StickyNoteNode = memo(function StickyNoteNode({ data, selected }: { data: AnnotationNodeData; selected?: boolean }) {
    const { annotation, onChange, onDelete } = data;
    const color = annotation.color || ANNOTATION_COLORS[0];
    const [text, setText] = useState(annotation.text ?? '');
    const last = useRef(annotation.text ?? '');
    useEffect(() => {
        if ((annotation.text ?? '') !== last.current) {
            last.current = annotation.text ?? '';
            setText(annotation.text ?? '');
        }
    }, [annotation.text]);

    const commit = () => { if (text !== (annotation.text ?? '')) onChange(annotation.id, { text }); };

    const fontSize = annotation.fontSize ?? 13;
    const setFont = (delta: number) => onChange(annotation.id, { fontSize: Math.max(10, Math.min(40, fontSize + delta)) });

    return (
        <div
            className={`group relative w-full h-full rounded-sm shadow-lg flex flex-col ${selected ? 'ring-2 ring-brand' : ''}`}
            style={{ background: `${color}22`, border: `1px solid ${color}` }}
        >
            <NodeResizer isVisible={selected} minWidth={120} minHeight={90} maxWidth={640} maxHeight={640}
                lineClassName={RESIZER_LINE} handleClassName={RESIZER_HANDLE} />
            <ConnectHandles />

            {/* Barra: arrastável (move o nó) + cores + tamanho da fonte + excluir */}
            <div className="sticky-drag cursor-move flex items-center gap-1 px-1.5 py-1 shrink-0" style={{ background: `${color}33` }}>
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    {ANNOTATION_COLORS.slice(0, 4).map(c => (
                        <button key={c} type="button" onClick={() => onChange(annotation.id, { color: c })}
                            className="nodrag w-3 h-3 rounded-full border border-card shrink-0" style={{ background: c }} aria-label="cor" />
                    ))}
                </div>
                <button type="button" onClick={() => setFont(-2)} disabled={fontSize <= 10} className="nodrag p-0.5 rounded text-foreground/60 hover:text-foreground disabled:opacity-30" title="Diminuir fonte" aria-label="Diminuir fonte">
                    <Minus className="w-3 h-3" />
                </button>
                <span className="nodrag text-[9px] font-mono text-foreground/60 tabular-nums w-4 text-center select-none">{fontSize}</span>
                <button type="button" onClick={() => setFont(2)} disabled={fontSize >= 40} className="nodrag p-0.5 rounded text-foreground/60 hover:text-foreground disabled:opacity-30" title="Aumentar fonte" aria-label="Aumentar fonte">
                    <Plus className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => onDelete(annotation.id)} className="nodrag p-0.5 rounded text-foreground/60 hover:text-danger" aria-label="Excluir">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>

            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onBlur={commit}
                onPointerDown={e => e.stopPropagation()}
                placeholder="Anotação…"
                style={{ fontSize }}
                className="nodrag nowheel flex-1 w-full bg-transparent resize-none focus:outline-none px-2 py-1.5 leading-snug text-foreground placeholder:text-foreground/40"
            />
        </div>
    );
});
