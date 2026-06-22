'use client';

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { FileText } from 'lucide-react';
import { PRIORITY_OPTIONS, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { formatExternalId } from '@/components/qa-journey/columns/helpers';
import type { QAJourneyCase } from '@/types/qa-journey';

export interface CaseNodeData {
    case_: QAJourneyCase;
    isActive: boolean;
    onSelect: (caseId: string) => void;
}

// Nó-folha do mapa (3º nível): um caso de teste de um sub-fluxo.
// Clicável → abre o drawer de detalhe empilhado (spec + execução + evidências).
export const CaseNode = memo(function CaseNode({ data }: { data: CaseNodeData }) {
    const { case_, isActive, onSelect } = data;
    const prio = PRIORITY_OPTIONS.find(o => o.value === case_.priority);
    const run = case_.last_run_status ? RUN_STATUS_OPTIONS.find(o => o.value === case_.last_run_status) : null;

    return (
        <button
            type="button"
            onClick={() => onSelect(case_.id)}
            className={`relative bg-card/80 backdrop-blur-sm border rounded-lg px-2.5 py-2 w-full h-full text-left transition-all overflow-hidden ${
                isActive
                    ? 'border-brand ring-2 ring-brand/30'
                    : 'border-border hover:border-brand/40'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-brand/30 !border-none !w-1.5 !h-1.5" />

            <div className="flex items-start gap-1.5">
                <FileText className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    {case_.external_id && (
                        <div className="text-[9px] font-mono text-muted-foreground truncate leading-none mb-0.5" title={case_.external_id}>{formatExternalId(case_.external_id)}</div>
                    )}
                    <div className="text-[11px] font-bold text-foreground line-clamp-2 leading-tight">{case_.title}</div>
                </div>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5">
                {prio && (
                    <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide ${prio.color}`}>
                        {prio.label}
                    </span>
                )}
                {run && (
                    <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide ${run.color}`}>
                        {run.label}
                    </span>
                )}
            </div>
        </button>
    );
});
