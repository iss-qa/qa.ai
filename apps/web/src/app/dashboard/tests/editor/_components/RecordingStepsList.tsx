'use client';

import { CheckCircle2, GripVertical, Trash2, AlertTriangle } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { useSensors } from '@dnd-kit/core';
import type { RecordedStep } from '@/store/recordingStore';
import { getMaestroActionLabel, getMaestroActionIcon } from '@/lib/maestroYaml';
import { SortableRecordedStep } from './SortableRecordedStep';

export function RecordingStepsList({
    recordedSteps,
    sensors,
    onDragEnd,
    onRemoveStep,
}: {
    recordedSteps: RecordedStep[];
    sensors: ReturnType<typeof useSensors>;
    onDragEnd: (event: DragEndEvent) => void;
    onRemoveStep: (id: string) => void;
}) {
    return (
        <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider px-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Gravando — {recordedSteps.length} passos
                <span className="ml-auto text-[10px] font-normal text-zinc-500 normal-case">
                    Arraste para reordenar
                </span>
            </div>

            {/* Show the physical-device hint only on the first step.
                Once the user has tapped a few times it becomes noise. */}
            {recordedSteps.length <= 1 && (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 flex items-start gap-2.5 text-[11px] text-cyan-100/90 leading-snug">
                    <span className="text-base shrink-0 mt-[-2px]">👆</span>
                    <div>
                        <span className="font-bold text-cyan-300">Interaja no celular físico</span> —
                        é mais rápido e o reconhecimento de IDs fica mais preciso.
                        O espelhamento à direita só serve para você ver suas ações em tempo real.
                    </div>
                </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={recordedSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {recordedSteps.map((rs, idx) => {
                const actionLabel = getMaestroActionLabel(rs.action);
                const actionIcon = getMaestroActionIcon(rs.action);
                const isAssert = rs.action === 'assertVisible';
                const isInput = rs.action === 'inputText';
                // Fallback = the daemon couldn't resolve a resource-id / text and
                // emitted `tapOn: point: "x,y"`. We want the user to notice
                // these so they can re-record or edit before saving — pure
                // coordinate taps break on different devices/resolutions.
                const isFallback = !rs.fromScan && rs.action === 'tapOn' && /^\d+\s*,\s*\d+$/.test(rs.elementId || '');
                const borderColor = isFallback
                    ? 'border-amber-500/50'
                    : isAssert ? 'border-cyan-500/30' : 'border-red-500/20';
                const bgColor = isAssert ? 'bg-cyan-500/10' : 'bg-red-500/20';
                const textColor = isAssert ? 'text-cyan-400' : isInput ? 'text-amber-400' : 'text-brandLight';

                return (
                    <SortableRecordedStep key={rs.id} id={rs.id}>
                        {({ dragHandleProps, isDragging }) => (
                            <div
                                className={`bg-foreground/5 border ${borderColor} rounded-lg p-3 flex items-start gap-3 animate-[fadeIn_0.3s_ease-out] group ${isFallback ? 'ring-1 ring-amber-500/30' : ''} ${isDragging ? 'shadow-2xl ring-2 ring-brand/60' : ''}`}
                                title={isFallback ? 'Passo gravado por coordenada — frágil em outros dispositivos. Edite e troque por id/texto antes de salvar.' : undefined}
                            >
                                <button
                                    type="button"
                                    {...dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing p-0.5 text-zinc-500 hover:text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                                    title="Arraste para reordenar"
                                >
                                    <GripVertical className="w-3.5 h-3.5" />
                                </button>
                                <div className={`w-6 h-6 rounded-full ${bgColor} ${textColor} flex items-center justify-center text-xs font-bold shrink-0 border ${borderColor}`}>
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm">{actionIcon}</span>
                                        <span className={`text-xs font-bold ${textColor}`}>{actionLabel}</span>
                                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">maestro</span>
                                        {rs.autoGenerated && (
                                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">auto</span>
                                        )}
                                        {rs.fromScan && !isFallback && (
                                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-400">scan</span>
                                        )}
                                        {isFallback && (
                                            <span
                                                className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 inline-flex items-center gap-1"
                                                title="Sem id resolvido — usa coordenada (point). Recomendamos editar."
                                            >
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                coord
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-1.5 px-2 py-1 rounded bg-black/30 border border-black/20 truncate font-mono">
                                        {rs.elementId || rs.description}
                                    </div>
                                    {isFallback && (
                                        <div className="text-[10px] text-amber-300/80 mt-1 pl-1 leading-snug">
                                            Sem id resolvido — gravado como % da tela (portável entre resoluções, mas prefira refazer o tap num elemento com id).
                                        </div>
                                    )}
                                    {isInput && rs.value && (
                                        <div className="text-xs text-muted-foreground mt-1 pl-1 truncate">
                                            Valor: <span className="text-foreground">&quot;{rs.isPassword ? '*'.repeat(rs.value.length) : rs.value}&quot;</span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onRemoveStep(rs.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 text-muted-foreground hover:text-red-400 rounded shrink-0 mt-0.5"
                                    title="Remover este passo"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <CheckCircle2 className={`w-4 h-4 shrink-0 mt-1 ${isFallback ? 'text-amber-400' : 'text-green-400'}`} />
                            </div>
                        )}
                    </SortableRecordedStep>
                );
            })}
            </SortableContext>
            </DndContext>
            <div className="bg-foreground/5 border border-dashed border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-zinc-500 text-xs">
                <div className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-500/50 animate-pulse" />
                </div>
                Aguardando proxima interacao...
            </div>
        </div>
    );
}
