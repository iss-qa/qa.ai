'use client';

// Paleta de componentes do canvas (estilo Figma/Miro): adiciona sticky notes,
// formas (losango de decisão, retângulo, elipse) e imagens. Flutua à esquerda.

import { useRef } from 'react';
import { Circle, Diamond, Image as ImageIcon, Square, StickyNote } from 'lucide-react';
import type { ShapeVariant } from './canvas-annotations';

interface CanvasToolbarProps {
    onAddSticky: () => void;
    onAddShape: (shape: ShapeVariant) => void;
    onAddImageFile: (file: File) => void;
}

export function CanvasToolbar({ onAddSticky, onAddShape, onAddImageFile }: CanvasToolbarProps) {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1 bg-popover/90 backdrop-blur border border-border rounded-xl p-1.5 shadow-lg pointer-events-auto">
            <ToolButton label="Sticky note" onClick={onAddSticky}><StickyNote className="w-4 h-4" /></ToolButton>
            <ToolButton label="Decisão (losango)" onClick={() => onAddShape('diamond')}><Diamond className="w-4 h-4" /></ToolButton>
            <ToolButton label="Retângulo" onClick={() => onAddShape('rectangle')}><Square className="w-4 h-4" /></ToolButton>
            <ToolButton label="Elipse" onClick={() => onAddShape('ellipse')}><Circle className="w-4 h-4" /></ToolButton>
            <div className="h-px bg-border my-0.5" />
            <ToolButton label="Imagem (upload)" onClick={() => fileRef.current?.click()}><ImageIcon className="w-4 h-4" /></ToolButton>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onAddImageFile(f); e.target.value = ''; }}
            />
        </div>
    );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-brand hover:bg-brand/10 transition-colors"
        >
            {children}
        </button>
    );
}
