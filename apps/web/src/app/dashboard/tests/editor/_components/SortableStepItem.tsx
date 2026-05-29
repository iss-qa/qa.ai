'use client';

import { useState } from 'react';
import { Bot, Loader2, CheckCircle2, Copy, Trash2, Edit2, Check, GripVertical, CopyPlus, XCircle, ChevronDown, ChevronUp, Search, Crosshair, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TestStep } from '../editor-types';

export function SortableStepItem({
    step, index, isEditing, isExecuting,
    onEdit, onDelete, onDuplicate, onCopy,
    editingData, setEditingData,
    onSaveEdit, onCancelEdit
}: {
    step: TestStep;
    index: number;
    isEditing: boolean;
    isExecuting: boolean;
    onEdit: (data: Partial<TestStep>) => void;
    onDelete: () => void;
    onDuplicate: (step: TestStep) => void;
    onCopy: (step: TestStep) => void;
    editingData: Partial<TestStep>;
    setEditingData: (data: Partial<TestStep>) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        opacity: isDragging ? 0.8 : 1
    };

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    return (
        <div ref={setNodeRef} data-step-idx={index} style={style} className={`bg-foreground/5 border ${step.status === 'error' ? 'border-red-500/50' : step.status === 'running' ? 'border-brand/60' : 'border-border'} rounded-lg p-3 hover:bg-foreground/10 transition-colors group relative ${isDragging ? 'shadow-2xl ring-2 ring-brand' : ''} ${step.status === 'running' ? 'ring-1 ring-brand/40' : ''}`}>

            {!isExecuting && !isEditing && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity z-10 bg-card/80 p-0.5 rounded backdrop-blur-sm border border-border shadow-xl">
                    <button {...attributes} {...listeners} className="p-1.5 cursor-grab active:cursor-grabbing hover:bg-foreground/10 text-muted-foreground rounded-md" title="Mover">
                        <GripVertical className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDuplicate(step)} className="p-1.5 hover:bg-brand/20 text-muted-foreground hover:text-brand rounded-md" title="Duplicar">
                        <CopyPlus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onCopy(step)} className="p-1.5 hover:bg-brand/20 text-muted-foreground hover:text-brand rounded-md" title="Copiar">
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onEdit(step)} className="p-1.5 hover:bg-brand/20 text-muted-foreground hover:text-brand rounded-md" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onDelete} className="p-1.5 hover:bg-red-500/20 text-muted-foreground hover:text-red-400 rounded-md" title="Remover">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {isEditing ? (
                <div className="flex flex-col gap-2 relative z-20">
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                        <span className="text-xs font-bold text-brandLight">Editando Passo {index + 1}</span>
                        {editingData.engine === 'maestro' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">maestro</span>
                        )}
                    </div>

                    {editingData.engine === 'maestro' ? (
                        /* ── Maestro edit: show YAML command directly ── */
                        <div className="flex flex-col gap-2 mt-1">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold">Descrição</label>
                                <input
                                    value={editingData.target || ''}
                                    onChange={e => setEditingData({ ...editingData, target: e.target.value })}
                                    placeholder="Ex: Aguarda botão Entrar aparecer"
                                    className="bg-black/40 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold">Comando YAML</label>
                                <textarea
                                    value={editingData.maestro_command || ''}
                                    onChange={e => setEditingData({ ...editingData, maestro_command: e.target.value })}
                                    placeholder="- tapOn:&#10;    text: &quot;Entrar&quot;"
                                    rows={4}
                                    className="bg-black/40 border border-border rounded px-2 py-1.5 text-xs text-foreground font-mono resize-y"
                                />
                            </div>
                        </div>
                    ) : (
                        /* ── UIAutomator2 edit: action dropdown + target/value ── */
                        <>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Ação</label>
                                    <select
                                        value={editingData.action}
                                        onChange={e => setEditingData({ ...editingData, action: e.target.value })}
                                        className="bg-black/40 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                                    >
                                        <option value="tap">TAP</option>
                                        <option value="type">TYPE</option>
                                        <option value="open_app">OPEN_APP</option>
                                        <option value="assert_text">ASSERT_TEXT</option>
                                        <option value="wait">WAIT</option>
                                        <option value="swipe">SWIPE</option>
                                        <option value="press_back">BACK</option>
                                        <option value="press_home">HOME</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Alvo (Target)</label>
                                    <input
                                        value={editingData.target || ''}
                                        onChange={e => setEditingData({ ...editingData, target: e.target.value })}
                                        placeholder="Ex: Botão de Login"
                                        className="bg-black/40 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 mt-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold">Valor (Value)</label>
                                <input
                                    value={editingData.value || ''}
                                    onChange={e => setEditingData({ ...editingData, value: e.target.value })}
                                    placeholder="Ex: isaias@gmail.com"
                                    className="bg-black/40 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                                />
                            </div>
                        </>
                    )}

                    <div className="flex gap-2 justify-end mt-2">
                        <button onClick={onCancelEdit} className="px-3 py-1 text-xs text-zinc-400 hover:text-foreground transition-colors">Cancelar</button>
                        <button onClick={onSaveEdit} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/50 text-xs rounded shadow-sm flex items-center gap-1 hover:bg-green-500/30 transition-colors">
                            <Check className="w-3.5 h-3.5" /> Salvar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${step.status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-card text-muted-foreground'}`}>
                            {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`font-bold text-xs flex items-center gap-1.5 truncate min-w-0 ${step.status === 'error' ? 'text-red-400' : 'text-brandLight'}`}>
                                    {step.action.toUpperCase()}
                                    {step.engine && (
                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${step.engine === 'maestro' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {step.engine === 'maestro' ? 'maestro' : 'u2'}
                                        </span>
                                    )}
                                </span>
                                <div className="shrink-0 flex items-center gap-1.5">
                                    {/* Confidence badge — only shown when idle (not overridden by execution status) */}
                                    {step.engine === 'maestro' && step.confidence && step.status === 'idle' && (
                                        <span
                                            title={step.confidence_comment || ''}
                                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border cursor-help ${
                                                step.confidence === 'high'
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                    : step.confidence === 'low'
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                                            }`}
                                        >
                                            {step.confidence === 'high' ? '✅' : step.confidence === 'low' ? '⚠️' : '❌'}
                                        </span>
                                    )}
                                    {step.status === 'success' && <div className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Passou</span></div>}
                                    {step.status === 'running' && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
                                    {step.status === 'error' && <div className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Falhou</span></div>}
                                    {step.status === 'analyzing' && <div className="flex items-center gap-1 text-blue-400"><Search className="w-3.5 h-3.5 animate-pulse" /><span className="text-[9px] font-bold uppercase">Analisando</span></div>}
                                    {step.status === 'located' && <div className="flex items-center gap-1 text-teal-400"><Crosshair className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Localizado</span></div>}
                                    {step.status === 'confirming' && <div className="flex items-center gap-1 text-blue-400"><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-[9px] font-bold uppercase">Confirmando</span></div>}
                                    {step.status === 'fallback' && <div className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Fallback</span></div>}
                                </div>
                            </div>
                            <div className={`text-[11px] mt-1.5 px-2 py-1 rounded border truncate ${step.status === 'running' ? 'bg-brand/10 border-brand/50 text-brandLight' : step.status === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-black/30 border-black/20 text-muted-foreground'}`}>
                                {step.target}
                            </div>
                            {/* `Valor:` is only meaningful for steps that actually carry
                                a typed value — inputText/swipe/extendedWaitUntil. A tapOn
                                step never has a meaningful `value`; if one did show up it
                                means the recorder mis-attached input text to a button. */}
                            {step.value && (step.action === 'inputText' || step.action === 'swipe' || step.action === 'extendedWaitUntil') && (
                                <div className="text-xs text-muted-foreground mt-1 pl-1 truncate">
                                    Valor: <span className="text-foreground">&quot;{step.value}&quot;</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vision analyzing progress bar */}
                    {step.status === 'analyzing' && (
                        <div className="mt-2 h-0.5 bg-blue-500/20 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-1/3 animate-[progress_2s_ease-in-out_infinite] rounded-full" />
                        </div>
                    )}

                    {step.status === 'error' && (
                        <div className="mt-2 text-xs border-t border-red-500/20 pt-2">
                            <div className="flex items-start gap-1.5 text-red-400 font-medium mb-1.5 min-w-0">
                                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span className="break-words leading-tight text-[11px] min-w-0">{step.error_message || "Passo falhou durante a execucao"}</span>
                            </div>

                            {step.suggestion && (
                                <div className="mt-2 bg-brand/10 border border-brand/20 p-2 rounded flex gap-1.5 text-brandLight">
                                    <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span className="leading-tight">{step.suggestion}</span>
                                </div>
                            )}

                            {step.strategies_log && step.strategies_log.length > 0 && (
                                <div className="mt-2.5">
                                    <button
                                        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Estruturas Tentadas ({step.strategies_log.length})
                                        {isDetailsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>

                                    {isDetailsOpen && (
                                        <div className="mt-2 flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-1 bg-black/20 p-2 rounded">
                                            {step.strategies_log.map((log, i) => (
                                                <div key={i} className="flex flex-col gap-0.5 border-b border-border pb-1 last:border-0 last:pb-0">
                                                    <span className="font-mono text-[9px] text-muted-foreground break-all leading-tight">{log.name}</span>
                                                    <span className={`text-[9px] leading-tight ${log.result.includes('sucesso') || log.result.includes('encontrado') ? 'text-green-400' : 'text-red-400/80'}`}>
                                                        → {log.result}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
