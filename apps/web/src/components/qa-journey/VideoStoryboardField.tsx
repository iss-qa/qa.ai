'use client';

// Campo "Vídeo → Storyboard" do SubflowFormModal.
// Toggle + upload/arrasta-e-solta de um vídeo curto. Ao receber o vídeo,
// detecta cada mudança de tela no navegador (sem enviar o vídeo a lugar
// nenhum), captura um print de cada tela e sobe só os prints. Cada tela vira
// um "passo" com legenda editável — depois renderizado no mapa como nós-imagem
// encadeados por setas.

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clapperboard, Film, Loader2, Maximize2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { extractStoryboardFrames, uploadStoryboardFrame } from '@/lib/qa-journey/video-storyboard';
import { FrameRedactor } from './FrameRedactor';
import { ImageLightbox } from './map/ImageLightbox';
import type { VideoStep } from '@/types/qa-journey';

interface VideoStoryboardFieldProps {
    enabled: boolean;
    onToggle: () => void;
    steps: VideoStep[] | null;
    onChange: (steps: VideoStep[] | null) => void;
    // Avisa o modal pai que está processando/enviando (bloqueia o "Salvar").
    onBusyChange?: (busy: boolean) => void;
}

const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB

function genId(): string {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* fallback abaixo */ }
    return `s-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function reindex(steps: VideoStep[]): VideoStep[] {
    return steps.map((s, i) => ({ ...s, order: i }));
}

export function VideoStoryboardField({ enabled, onToggle, steps, onChange, onBusyChange }: VideoStoryboardFieldProps) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // Tela em edição de tarja (LGPD), se houver.
    const [redacting, setRedacting] = useState<{ step: VideoStep; index: number } | null>(null);
    // Tela ampliada (lightbox) para ver detalhes.
    const [preview, setPreview] = useState<{ step: VideoStep; index: number } | null>(null);
    // Prefixo de storage estável por sessão de edição (agrupa os prints).
    const storyboardIdRef = useRef<string>(genId());
    const inputRef = useRef<HTMLInputElement>(null);

    const list = steps ?? [];

    const setBusyBoth = (b: boolean) => { setBusy(b); onBusyChange?.(b); };

    const handleVideo = async (file: File | undefined) => {
        setError(null);
        if (!file) return;
        if (!file.type.startsWith('video/')) {
            setError('Selecione um arquivo de vídeo.');
            return;
        }
        if (file.size > MAX_VIDEO_BYTES) {
            setError(`Vídeo muito grande (máx. ${MAX_VIDEO_BYTES / 1024 / 1024} MB).`);
            return;
        }
        setBusyBoth(true);
        setProgress(0);
        try {
            setStatusText('Analisando o vídeo e detectando telas…');
            const frames = await extractStoryboardFrames(file, {
                onProgress: (frac, found) => {
                    setProgress(frac * 0.6); // 60% do progresso = varredura
                    setStatusText(`Detectando telas… ${found} encontrada${found === 1 ? '' : 's'}`);
                },
            });

            const sid = storyboardIdRef.current;
            const next: VideoStep[] = [];
            for (let i = 0; i < frames.length; i++) {
                setStatusText(`Enviando telas… ${i + 1}/${frames.length}`);
                setProgress(0.6 + (i / frames.length) * 0.4);
                const url = await uploadStoryboardFrame(sid, i, frames[i].blob);
                next.push({ id: genId(), order: i, image_url: url, caption: '', time: frames[i].time });
            }
            setProgress(1);
            setStatusText(null);
            onChange(reindex(next));
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao processar o vídeo.';
            if (msg !== 'cancelado') setError(msg);
            setStatusText(null);
        } finally {
            setBusyBoth(false);
        }
    };

    const updateCaption = (id: string, caption: string) => {
        onChange(list.map(s => (s.id === id ? { ...s, caption } : s)));
    };
    const updateImage = (id: string, image_url: string) => {
        onChange(list.map(s => (s.id === id ? { ...s, image_url } : s)));
    };
    const removeStep = (id: string) => {
        const next = reindex(list.filter(s => s.id !== id));
        onChange(next.length ? next : null);
    };
    const move = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(reindex(next));
    };

    return (
        <div className="border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={onToggle}
                    className={`relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors ${enabled ? 'bg-brand' : 'bg-foreground/15'}`}
                >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Clapperboard className="w-3.5 h-3.5 text-brand" /> Vídeo → Storyboard
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                        Suba um vídeo curto (até ~3 min). A cada mudança de tela, capturamos um print
                        automaticamente e montamos um passo a passo com as imagens — exibido no mapa
                        com setas ligando uma tela à outra. O vídeo é processado no seu navegador e
                        não é enviado a lugar nenhum: só os prints são salvos.
                    </span>
                </div>
            </div>

            {enabled && (
                <div className="pl-12 flex flex-col gap-3">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={e => { void handleVideo(e.target.files?.[0]); e.target.value = ''; }}
                    />

                    {/* Dropzone / botão de import */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy) void handleVideo(e.dataTransfer.files?.[0]); }}
                        className={`rounded-xl border border-dashed px-4 py-5 flex flex-col items-center justify-center gap-2 text-center transition-colors ${
                            dragOver ? 'border-brand bg-brand/5' : 'border-border bg-foreground/[0.02]'
                        }`}
                    >
                        {busy ? (
                            <>
                                <Loader2 className="w-5 h-5 text-brand animate-spin" />
                                <span className="text-[11px] text-muted-foreground">{statusText ?? 'Processando…'}</span>
                                <div className="w-full max-w-xs h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                                    <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                                </div>
                            </>
                        ) : (
                            <>
                                <Film className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">
                                    Arraste e solte o vídeo aqui, ou
                                </span>
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand border border-brand/30 rounded-lg px-3 py-1.5 hover:bg-brand/10 transition-colors"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    {list.length ? 'Trocar vídeo' : 'Selecionar vídeo'}
                                </button>
                            </>
                        )}
                        {error && <span className="text-[11px] text-danger">{error}</span>}
                    </div>

                    {/* Telas detectadas — preview + legenda editável + reordenar/remover */}
                    {list.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {list.length} tela{list.length === 1 ? '' : 's'} detectada{list.length === 1 ? '' : 's'}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {list.map((step, i) => (
                                    <div key={step.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                                        <div className="relative bg-foreground/5 flex items-center justify-center group">
                                            {/* Clique amplia a tela (ver detalhes). */}
                                            <button
                                                type="button"
                                                onClick={() => setPreview({ step, index: i + 1 })}
                                                className="block w-full"
                                                title="Clique para ampliar"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={step.image_url} alt={`Tela ${i + 1}`} className="w-full h-64 object-contain" />
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                                    <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-90 drop-shadow transition-opacity" />
                                                </span>
                                            </button>
                                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-popover/90 border border-border text-[10px] font-bold text-foreground pointer-events-none">
                                                {i + 1}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setRedacting({ step, index: i + 1 })}
                                                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-popover/90 border border-border text-[10px] font-bold text-foreground hover:text-brand hover:border-brand/50 transition-colors"
                                                title="Tarjar dados sensíveis (e-mail, senha)"
                                            >
                                                <ShieldCheck className="w-3 h-3" /> Tarjar
                                            </button>
                                        </div>
                                        <textarea
                                            value={step.caption}
                                            onChange={e => updateCaption(step.id, e.target.value)}
                                            placeholder="Escreva uma legenda ou título para esta tela…"
                                            rows={3}
                                            className="text-xs text-foreground bg-transparent px-3 py-2.5 resize-none focus:outline-none border-t border-border placeholder:text-muted-foreground/60 leading-relaxed"
                                        />
                                        <div className="flex items-center justify-end gap-1 px-2 pb-2 border-t border-border/50 pt-2">
                                            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Mover para trás">
                                                <ArrowUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="p-1.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Mover para frente">
                                                <ArrowDown className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button" onClick={() => removeStep(step.id)} className="p-1.5 rounded text-danger hover:bg-danger/10" title="Remover tela">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {redacting && (
                <FrameRedactor
                    imageUrl={redacting.step.image_url}
                    storyboardId={storyboardIdRef.current}
                    frameIndex={redacting.index}
                    onApplied={url => { updateImage(redacting.step.id, url); setRedacting(null); }}
                    onClose={() => setRedacting(null)}
                />
            )}

            {preview && (
                <ImageLightbox step={preview.step} index={preview.index} onClose={() => setPreview(null)} />
            )}
        </div>
    );
}
