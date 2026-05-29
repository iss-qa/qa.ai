'use client';

import { ListPlus, X, Plus } from 'lucide-react';
import { STEP_TEMPLATES } from '../editor-utils';

export function StepTemplatesModal({
    onClose,
    onPick,
}: {
    onClose: () => void;
    onPick: (tpl: typeof STEP_TEMPLATES[number]) => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-popover border border-border rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <ListPlus className="w-5 h-5 text-emerald-400" />
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Adicionar passo</h3>
                            <p className="text-[10px] text-zinc-500">Clique para adicionar ao final da lista — edite e arraste para reposicionar</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-foreground/10 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar">
                    {STEP_TEMPLATES.map((tpl) => (
                        <button
                            key={tpl.id}
                            onClick={() => onPick(tpl)}
                            className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-foreground/5 transition-colors border-b border-border last:border-0 text-left group"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-zinc-200 group-hover:text-foreground transition-colors">{tpl.label}</span>
                                    {tpl.editHint && (
                                        <span className="text-[9px] text-emerald-500/70 border border-emerald-500/20 rounded px-1 py-0.5">editável</span>
                                    )}
                                </div>
                                <p className="text-[10px] text-zinc-500 mb-2">{tpl.desc}</p>
                                <pre className="text-[10px] font-mono text-muted-foreground bg-black/30 rounded px-2.5 py-1.5 whitespace-pre overflow-x-auto">{tpl.yaml}</pre>
                                {tpl.editHint && (
                                    <p className="text-[9px] text-zinc-600 mt-1.5">{tpl.editHint}</p>
                                )}
                            </div>
                            <Plus className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 shrink-0 mt-1 transition-colors" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
