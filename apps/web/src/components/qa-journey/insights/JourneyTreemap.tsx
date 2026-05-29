'use client';

import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import type { JourneyTreemapDatum } from '@/types/qa-journey-insights';

interface Props {
    data: JourneyTreemapDatum[];
}

// Cada bloco = uma Jornada. Tamanho proporcional a numero de casos.
// Cor varia por % de automacao (vermelho < 30 < amarelo < 70 < verde).
export function JourneyTreemap({ data }: Props) {
    if (data.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-black/5 p-8 text-center text-slate-500 text-sm">
                Sem jornadas cadastradas para gerar o treemap.
            </div>
        );
    }

    // Recharts Treemap espera campo "size" e "name"
    const treemapData = data.map(d => ({
        name: d.title,
        size: d.case_count,
        automation_pct: d.automation_pct,
        subflow_total: d.subflow_total,
        subflow_automated: d.subflow_automated,
    }));

    return (
        <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col gap-3">
            <div>
                <h3 className="text-sm font-bold text-slate-900">Distribuição de casos por jornada</h3>
                <p className="text-[11px] text-slate-500">Tamanho do bloco = nº de casos · cor = % automação</p>
            </div>
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={treemapData}
                        dataKey="size"
                        stroke="#fff"
                        content={<CustomNode />}
                    >
                        <Tooltip content={<CustomTooltip />} />
                    </Treemap>
                </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <Legend color="#ef4444" label="< 30%" />
                <Legend color="#eab308" label="30-69%" />
                <Legend color="#22c55e" label="≥ 70%" />
            </div>
        </div>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            {label}
        </span>
    );
}

function automationColor(pct: number): string {
    if (pct >= 70) return '#22c55e';
    if (pct >= 30) return '#eab308';
    return '#ef4444';
}

interface NodeProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    automation_pct?: number;
}

function CustomNode(props: NodeProps) {
    const { x = 0, y = 0, width = 0, height = 0, name = '', automation_pct = 0 } = props;
    const fill = automationColor(automation_pct);
    const showText = width > 60 && height > 30;
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.85} stroke="#fff" />
            {showText && (
                <>
                    <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={700}>
                        {name}
                    </text>
                    <text x={x + 8} y={y + 34} fill="#fff" fontSize={10} opacity={0.9}>
                        {automation_pct}% auto
                    </text>
                </>
            )}
        </g>
    );
}

interface TooltipProps {
    active?: boolean;
    payload?: { payload?: { name?: string; size?: number; automation_pct?: number; subflow_automated?: number; subflow_total?: number } }[];
}

function CustomTooltip({ active, payload }: TooltipProps) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div className="bg-white border border-black/10 rounded-md shadow-md px-3 py-2 text-xs">
            <div className="font-bold text-slate-900">{d.name}</div>
            <div className="text-slate-600">Casos: <strong>{d.size}</strong></div>
            <div className="text-slate-600">
                Automação: <strong>{d.automation_pct}%</strong> ({d.subflow_automated}/{d.subflow_total} sub-fluxos)
            </div>
        </div>
    );
}
