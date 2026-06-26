'use client';

// Tarja (LGPD): permite desenhar retângulos sobre uma tela do storyboard
// (ex.: campos de e-mail/senha) e pixelar essas regiões de forma permanente.
// Ao aplicar, gera um novo JPEG, sobe e devolve a nova URL.

import { useRef, useState } from 'react';
import { Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import { redactImage, uploadStoryboardFrame, type RedactRect } from '@/lib/qa-journey/video-storyboard';

interface FrameRedactorProps {
    imageUrl: string;
    storyboardId: string;
    frameIndex: number;
    onApplied: (newUrl: string) => void;
    onClose: () => void;
}

interface DraftRect extends RedactRect { id: string }

function rid(): string {
    return `r-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function FrameRedactor({ imageUrl, storyboardId, frameIndex, onApplied, onClose }: FrameRedactorProps) {
    const [rects, setRects] = useState<DraftRect[]>([]);
    const [drawing, setDrawing] = useState<DraftRect | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);

    // Converte um evento de ponteiro em coordenadas normalizadas (0..1).
    const norm = (clientX: number, clientY: number) => {
        const el = surfaceRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
        };
    };

    const onDown = (e: React.PointerEvent) => {
        if (busy) return;
        const { x, y } = norm(e.clientX, e.clientY);
        setDrawing({ id: rid(), x, y, w: 0, h: 0 });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!drawing) return;
        const { x, y } = norm(e.clientX, e.clientY);
        setDrawing({
            ...drawing,
            x: Math.min(drawing.x, x),
            y: Math.min(drawing.y, y),
            w: Math.abs(x - drawing.x),
            h: Math.abs(y - drawing.y),
        });
    };
    const onUp = () => {
        if (drawing && drawing.w > 0.02 && drawing.h > 0.01) setRects(r => [...r, drawing]);
        setDrawing(null);
    };

    const apply = async () => {
        if (rects.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const blob = await redactImage(imageUrl, rects.map(({ x, y, w, h }) => ({ x, y, w, h })));
            // Sobe como nova versão (índice + sufixo) — não sobrescreve a original.
            const url = await uploadStoryboardFrame(storyboardId, frameIndex * 1000 + rects.length, blob);
            onApplied(url);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao aplicar a tarja.');
            setBusy(false);
        }
    };

    const allRects = drawing ? [...rects, drawing] : rects;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-brand" /> Tarjar dados sensíveis (LGPD)
                    </span>
                    <button onClick={onClose} disabled={busy} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent disabled:opacity-50" aria-label="Fechar">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                    <p className="text-[11px] text-muted-foreground">
                        Arraste sobre os campos a esconder (e-mail, senha, documento…). A tarja é
                        <span className="font-semibold text-foreground"> permanente</span> na imagem salva.
                    </p>

                    <div
                        ref={surfaceRef}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        className="relative mx-auto select-none touch-none cursor-crosshair rounded-lg overflow-hidden border border-border bg-foreground/5"
                        style={{ maxWidth: '100%' }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={`Tela ${frameIndex}`} className="max-h-[55vh] w-auto block pointer-events-none" draggable={false} />
                        {allRects.map(r => (
                            <div
                                key={r.id}
                                className="absolute bg-brand/30 border-2 border-brand backdrop-blur-[2px]"
                                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                            />
                        ))}
                    </div>

                    {rects.length > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{rects.length} regiã{rects.length === 1 ? 'o' : 'es'} marcada{rects.length === 1 ? '' : 's'}</span>
                            <button type="button" onClick={() => setRects([])} className="inline-flex items-center gap-1 text-danger hover:underline">
                                <Trash2 className="w-3 h-3" /> Limpar
                            </button>
                        </div>
                    )}
                    {error && <span className="text-[11px] text-danger">{error}</span>}
                </div>

                <div className="p-4 border-t border-border flex items-center justify-end gap-2">
                    <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                        Cancelar
                    </button>
                    <button
                        onClick={apply}
                        disabled={busy || rects.length === 0}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        Aplicar tarja
                    </button>
                </div>
            </div>
        </div>
    );
}
