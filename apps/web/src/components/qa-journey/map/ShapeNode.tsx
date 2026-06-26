'use client';

// Forma do canvas: losango (decisão), retângulo ou elipse. Desenhada em SVG
// que preenche a caixa do nó (acompanha o resize), com rótulo editável no
// centro. Conectável — útil para fluxogramas (ex.: decisão → ramos).

import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import { Trash2 } from 'lucide-react';
import { ConnectHandles, RESIZER_HANDLE, RESIZER_LINE } from './annotation-handles';
import { ANNOTATION_COLORS } from './canvas-annotations';
import type { AnnotationNodeData } from './StickyNoteNode';

export const ShapeNode = memo(function ShapeNode({ data, selected }: { data: AnnotationNodeData; selected?: boolean }) {
    const { annotation, onChange, onDelete } = data;
    const color = annotation.color || ANNOTATION_COLORS[2];
    const variant = annotation.shape || 'rectangle';
    const [text, setText] = useState(annotation.text ?? '');
    const last = useRef(annotation.text ?? '');
    useEffect(() => {
        if ((annotation.text ?? '') !== last.current) {
            last.current = annotation.text ?? '';
            setText(annotation.text ?? '');
        }
    }, [annotation.text]);
    const commit = () => { if (text !== (annotation.text ?? '')) onChange(annotation.id, { text }); };

    return (
        <div className="group relative w-full h-full">
            <NodeResizer isVisible minWidth={90} minHeight={70} maxWidth={600} maxHeight={600}
                lineClassName={RESIZER_LINE} handleClassName={RESIZER_HANDLE} />
            <ConnectHandles />

            {/* Forma (preenche a caixa) — traço mais forte quando selecionada */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {variant === 'diamond' && (
                    <polygon points="50,3 97,50 50,97 3,50" fill={`${color}26`} stroke={color} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" />
                )}
                {variant === 'rectangle' && (
                    <rect x="2" y="2" width="96" height="96" rx="6" fill={`${color}26`} stroke={color} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" />
                )}
                {variant === 'ellipse' && (
                    <ellipse cx="50" cy="50" rx="48" ry="48" fill={`${color}26`} stroke={color} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" />
                )}
            </svg>

            {/* Rótulo central editável */}
            <div className="absolute inset-0 flex items-center justify-center p-3">
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onBlur={commit}
                    onPointerDown={e => e.stopPropagation()}
                    placeholder={variant === 'diamond' ? 'Decisão?' : 'Texto'}
                    className="nodrag nowheel w-full bg-transparent text-center focus:outline-none text-[12px] font-semibold text-foreground placeholder:text-foreground/40"
                />
            </div>

            {/* Controles (hover) */}
            <div className="absolute -top-2 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {ANNOTATION_COLORS.slice(0, 4).map(c => (
                    <button key={c} type="button" onClick={() => onChange(annotation.id, { color: c })}
                        className="nodrag w-3 h-3 rounded-full border border-card shadow" style={{ background: c }} aria-label="cor" />
                ))}
                <button type="button" onClick={() => onDelete(annotation.id)} className="nodrag p-0.5 rounded bg-popover border border-border text-foreground/70 hover:text-danger shadow" aria-label="Excluir">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
});
