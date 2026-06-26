'use client';

import { memo } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import { CheckCircle2, Clapperboard, FileCode2, GitBranch, Link2 } from 'lucide-react';
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
    // Sub-fluxo de documento: sem badge de automação / contagem de casos —
    // mostra só que é um documento (a prévia vive no nó-webview ao lado).
    const isDoc = Boolean(subflow.html_doc);
    // Sub-fluxo de storyboard: telas de vídeo encadeadas no mapa ao lado.
    const stepCount = subflow.video_steps?.length ?? 0;
    const isVideo = stepCount > 0;

    return (
        <button
            type="button"
            onClick={() => onSelect(subflow.id)}
            className={`relative bg-card/90 backdrop-blur-sm border rounded-xl px-3 py-2.5 w-full h-full text-left transition-all overflow-hidden ${
                isActive
                    ? 'border-brand ring-2 ring-brand/30'
                    : 'border-border hover:border-brand/40'
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
                    <div className="text-xs font-bold text-foreground line-clamp-2 leading-snug">{subflow.title}</div>
                    {subflow.description && (
                        <div className="text-[10px] text-muted-foreground line-clamp-3 leading-snug mt-0.5">{subflow.description}</div>
                    )}
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                {isVideo ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-brand" title="Storyboard de vídeo (telas no mapa)">
                        <Clapperboard className="w-2.5 h-2.5" /> Storyboard · {stepCount} {stepCount === 1 ? 'tela' : 'telas'}
                    </span>
                ) : isDoc ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-brand" title="Documento HTML anexado (prévia no mapa)">
                        <FileCode2 className="w-2.5 h-2.5" /> Documento
                    </span>
                ) : (
                    <>
                        {statusOpt && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${statusOpt.color}`}>
                                {statusOpt.label}
                            </span>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                    </>
                )}
            </div>
        </button>
    );
});
