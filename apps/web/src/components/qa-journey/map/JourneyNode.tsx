'use client';

import { memo } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import * as Icons from 'lucide-react';
import { ChevronRight, Map, Rocket } from 'lucide-react';
import type { QAJourney } from '@/types/qa-journey';

export interface JourneyNodeData {
    journey: QAJourney;
    totalSubflows: number;
    automatedSubflows: number;
    isExpanded: boolean;
    onToggle: (journeyId: string) => void;
}

// Lookup type-safe para icones do lucide a partir do nome string.
function resolveIcon(name: string | null | undefined): React.ComponentType<{ className?: string }> {
    if (!name) return Map;
    const candidate = (Icons as unknown as Record<string, unknown>)[name];
    if (typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)) {
        return candidate as React.ComponentType<{ className?: string }>;
    }
    return Map;
}

function coveragePct(total: number, automated: number): number {
    if (total === 0) return 0;
    return Math.round((automated / total) * 100);
}

function coverageColor(pct: number, total: number): string {
    if (total === 0) return 'bg-slate-500/30 text-slate-400';
    if (pct >= 80) return 'bg-green-500/20 text-green-400';
    if (pct >= 30) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
}

export const JourneyNode = memo(function JourneyNode({ data, selected }: { data: JourneyNodeData; selected?: boolean }) {
    const { journey, totalSubflows, automatedSubflows, isExpanded, onToggle } = data;
    const Icon = resolveIcon(journey.icon);
    const pct = coveragePct(totalSubflows, automatedSubflows);
    const color = journey.color || '#7c3aed';

    return (
        <button
            type="button"
            onClick={() => onToggle(journey.id)}
            className={`relative bg-card border rounded-2xl px-4 py-3 w-full h-full text-left transition-all shadow-lg hover:shadow-xl overflow-hidden ${
                isExpanded
                    ? 'border-brand ring-2 ring-brand/30'
                    : 'border-border hover:border-foreground/30'
            }`}
            style={{ boxShadow: `0 0 20px ${color}22` }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={180}
                minHeight={90}
                maxWidth={480}
                maxHeight={220}
                lineClassName="!border-brand/50"
                handleClassName="!bg-brand !border-brand !w-2 !h-2"
            />
            {/* Foguete sobre o no atualmente focado (jornada expandida) */}
            {isExpanded && (
                <div
                    className="absolute -top-6 -left-3 z-10 pointer-events-none qa-rocket"
                    aria-hidden
                >
                    <Rocket
                        className="w-6 h-6 text-brand drop-shadow-[0_0_8px_rgba(124,58,237,0.8)]"
                        style={{ transform: 'rotate(-30deg)' }}
                    />
                </div>
            )}
            <style jsx>{`
                .qa-rocket {
                    animation: qa-rocket-float 1.8s ease-in-out infinite;
                }
                @keyframes qa-rocket-float {
                    0%, 100% { transform: translateY(0px); }
                    50%      { transform: translateY(-4px); }
                }
            `}</style>

            <Handle type="target" position={Position.Left}  className="!bg-brand/40 !border-none !w-2 !h-2" />
            <Handle type="source" position={Position.Right} className="!bg-brand/40 !border-none !w-2 !h-2" />

            <div className="flex items-center gap-3">
                <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-border"
                    style={{ background: `${color}22` }}
                >
                    <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Jornada</div>
                    <div className="text-sm font-bold text-foreground truncate">{journey.title}</div>
                </div>
                <ChevronRight
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${coverageColor(pct, totalSubflows)}`}>
                    {totalSubflows === 0 ? 'Sem sub-fluxos' : `${automatedSubflows}/${totalSubflows} automatizados`}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">{totalSubflows === 0 ? '—' : `${pct}%`}</span>
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1 rounded-full bg-foreground/5 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all"
                    style={{
                        width: `${pct}%`,
                        background: pct >= 80 ? '#22c55e' : pct >= 30 ? '#eab308' : '#ef4444',
                    }}
                />
            </div>
        </button>
    );
});
