'use client';

import { Plus } from 'lucide-react';
import type { ConfidenceReport, TestStep } from '../editor-types';

export function AddStepButtons({
    onAddStep,
}: {
    onAddStep: (step: TestStep) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex gap-1.5">
                <button
                    onClick={() => {
                        onAddStep({
                            id: `step-${Date.now()}-1`,
                            action: 'tapOn',
                            target: '',
                            value: '',
                            status: 'idle',
                            engine: 'maestro',
                            maestro_command: '- tapOn:\n    id: ""',
                        });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-foreground/5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand/5 transition-all"
                >
                    <Plus className="w-3.5 h-3.5" /> tapOn
                </button>
                <button
                    onClick={() => {
                        onAddStep({
                            id: `step-${Date.now()}-2`,
                            action: 'inputText',
                            target: 'Texto a digitar',
                            value: '',
                            status: 'idle',
                            engine: 'maestro',
                            maestro_command: '- inputText: ""',
                        });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-foreground/5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                >
                    <Plus className="w-3.5 h-3.5" /> inputText
                </button>
                <button
                    onClick={() => {
                        onAddStep({
                            id: `step-${Date.now()}-3`,
                            action: 'assertVisible',
                            target: '',
                            value: '',
                            status: 'idle',
                            engine: 'maestro',
                            maestro_command: '- assertVisible:\n    id: ""',
                        });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-foreground/5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
                >
                    <Plus className="w-3.5 h-3.5" /> assert
                </button>
            </div>
        </div>
    );
}

export function ConfidenceReportCard({
    confidenceReport,
    onClose,
}: {
    confidenceReport: ConfidenceReport;
    onClose: () => void;
}) {
    return (
        <div className="mx-2 mb-2 rounded-lg border border-border bg-foreground/3 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
                <span className="font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Relatório de Confiança</span>
                <button
                    onClick={onClose}
                    className="text-zinc-600 hover:text-muted-foreground text-[10px]"
                >
                    fechar ×
                </button>
            </div>
            <div className="flex gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-emerald-400">
                    <span className="text-base leading-none">✅</span>
                    <strong>{confidenceReport.high_confidence_steps.length}</strong> alta confiança
                </span>
                {confidenceReport.low_confidence_steps.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                        <span className="text-base leading-none">⚠️</span>
                        <strong>{confidenceReport.low_confidence_steps.length}</strong> baixa confiança
                        <span className="text-zinc-500">(passos {confidenceReport.low_confidence_steps.join(', ')})</span>
                    </span>
                )}
                {confidenceReport.unresolved_elements.length > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                        <span className="text-base leading-none">❌</span>
                        <strong>{confidenceReport.unresolved_elements.length}</strong> não resolvido
                        <span className="text-zinc-500 truncate max-w-[120px]" title={confidenceReport.unresolved_elements.join(', ')}>
                            ({confidenceReport.unresolved_elements.join(', ')})
                        </span>
                    </span>
                )}
                {confidenceReport.low_confidence_steps.length === 0 && confidenceReport.unresolved_elements.length === 0 && (
                    <span className="text-zinc-500">Todos os seletores confirmados em múltiplas fontes.</span>
                )}
            </div>
        </div>
    );
}
