'use client';

import { memo } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import { CheckCircle2, GitBranch, Link2 } from 'lucide-react';
import { AUTOMATION_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { QAJourneySubflow } from '@/types/qa-journey';

export interface SubflowNodeData {
    subflow: QAJourneySubflow;
    caseCount: number;
    isActive: boolean;
    onSelect: (subflowId: string) => void;
}

export const SubflowNode = memo(function SubflowNode({ data, selected }: { data: SubflowNodeData; selected?: boolean }) {
    const { subflow, caseCount, isActive, onSelect } = data;
    const statusOpt = AUTOMATION_STATUS_OPTIONS.find(o => o.value === subflow.automation_status);

    return (
        <button
            type="button"
            onClick={() => onSelect(subflow.id)}
            className={`relative bg-[#0f1220]/90 backdrop-blur-sm border rounded-xl px-3 py-2.5 w-full h-full text-left transition-all overflow-hidden ${
                isActive
                    ? 'border-brand ring-2 ring-brand/30'
                    : 'border-white/10 hover:border-brand/40'
            }`}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={160}
                minHeight={60}
                maxWidth={400}
                maxHeight={180}
                lineClassName="!border-brand/50"
                handleClassName="!bg-brand !border-brand !w-2 !h-2"
            />
            <Handle type="target" position={Position.Left}  className="!bg-brand/30 !border-none !w-1.5 !h-1.5" />
            <Handle type="source" position={Position.Right} className="!bg-brand/30 !border-none !w-1.5 !h-1.5" />

            <div className="flex items-start gap-2">
                <GitBranch className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{subflow.title}</div>
                    {subflow.description && (
                        <div className="text-[10px] text-slate-400 truncate">{subflow.description}</div>
                    )}
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                {statusOpt && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${statusOpt.color}`}>
                        {statusOpt.label}
                    </span>
                )}
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {subflow.test_case_id && (
                        <span className="inline-flex items-center gap-0.5 text-brand" title="Vinculado a um teste Maestro">
                            <Link2 className="w-2.5 h-2.5" />
                        </span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {caseCount}
                    </span>
                </div>
            </div>
        </button>
    );
});
