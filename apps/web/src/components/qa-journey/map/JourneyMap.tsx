'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    type Edge,
    type Node,
    type NodeChange,
    type NodeTypes,
    type OnNodesChange,
    type OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Download, LayoutGrid, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';

import { applyDagreLayout } from '@/lib/qa-journey/layout';
import { JourneyNode, type JourneyNodeData } from './JourneyNode';
import { SubflowNode, type SubflowNodeData } from './SubflowNode';
import { ParticleBackground } from './ParticleBackground';
import { SubflowDrawer } from './SubflowDrawer';
import type { QAJourney, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface JourneyMapProps {
    projectId: string;
    journeys: QAJourney[];
    subflowsByJourney: Record<string, QAJourneySubflow[]>;
    casesBySubflow: Record<string, QAJourneyCase[]>;
}

const NODE_TYPES: NodeTypes = {
    journey: JourneyNode,
    subflow: SubflowNode,
};

// Tamanhos default por tipo de node
const JOURNEY_DEFAULT = { width: 240, height: 110 };
const SUBFLOW_DEFAULT = { width: 220, height: 80 };

// Layout customizado pelo usuario (drag + resize), persistido em localStorage por projeto.
type CustomLayout = Record<string, { x?: number; y?: number; width?: number; height?: number }>;

function layoutStorageKey(projectId: string): string {
    return `qa-journey-map-layout:${projectId}`;
}

export function JourneyMap({ projectId, journeys, subflowsByJourney, casesBySubflow }: JourneyMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [activeSubflowId, setActiveSubflowId] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Layout customizado (carregado do localStorage no mount/troca de projeto)
    const [customLayout, setCustomLayout] = useState<CustomLayout>({});
    const [layoutLoaded, setLayoutLoaded] = useState(false);

    useEffect(() => {
        setLayoutLoaded(false);
        setCustomLayout({});
        try {
            const raw = localStorage.getItem(layoutStorageKey(projectId));
            if (raw) setCustomLayout(JSON.parse(raw));
        } catch {
            // ignore parse error
        }
        setLayoutLoaded(true);
    }, [projectId]);

    // Persiste customLayout sempre que muda (apos load inicial)
    useEffect(() => {
        if (!layoutLoaded) return;
        try {
            const key = layoutStorageKey(projectId);
            if (Object.keys(customLayout).length === 0) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(customLayout));
            }
        } catch {
            // localStorage cheio ou indisponivel - ignora
        }
    }, [customLayout, projectId, layoutLoaded]);

    const toggleJourney = useCallback((journeyId: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(journeyId)) next.delete(journeyId);
            else next.add(journeyId);
            return next;
        });
    }, []);

    const selectSubflow = useCallback((subflowId: string) => {
        setActiveSubflowId(subflowId);
    }, []);

    // Reconstroi grafo (nodes/edges) - aplica dagre + sobrescreve com customLayout
    const { layoutedNodes, layoutedEdges } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        journeys.forEach(journey => {
            const sub = subflowsByJourney[journey.id] || [];
            const automated = sub.filter(s => s.automation_status === 'automated').length;

            const journeyData: JourneyNodeData = {
                journey,
                totalSubflows: sub.length,
                automatedSubflows: automated,
                isExpanded: expanded.has(journey.id),
                onToggle: toggleJourney,
            };

            const jCustom = customLayout[journey.id];
            nodes.push({
                id: journey.id,
                type: 'journey',
                position: { x: 0, y: 0 },
                data: journeyData,
                width: jCustom?.width ?? JOURNEY_DEFAULT.width,
                height: jCustom?.height ?? JOURNEY_DEFAULT.height,
            });

            if (expanded.has(journey.id)) {
                sub.forEach(subflow => {
                    const cases = casesBySubflow[subflow.id] || [];
                    const subflowData: SubflowNodeData = {
                        subflow,
                        caseCount: cases.length,
                        isActive: activeSubflowId === subflow.id,
                        onSelect: selectSubflow,
                    };
                    const sCustom = customLayout[subflow.id];
                    nodes.push({
                        id: subflow.id,
                        type: 'subflow',
                        position: { x: 0, y: 0 },
                        data: subflowData,
                        width: sCustom?.width ?? SUBFLOW_DEFAULT.width,
                        height: sCustom?.height ?? SUBFLOW_DEFAULT.height,
                    });
                    edges.push({
                        id: `${journey.id}->${subflow.id}`,
                        source: journey.id,
                        target: subflow.id,
                        animated: true,
                        style: { stroke: journey.color || '#7c3aed', strokeWidth: 1.5, opacity: 0.6 },
                    });
                });
            }
        });

        // Primeiro aplica dagre para todos
        const positioned = applyDagreLayout(nodes, edges, { direction: 'LR', rankSep: 130, nodeSep: 28 });

        // Sobrescreve posicoes customizadas pelo usuario (drag)
        const final = positioned.map(n => {
            const custom = customLayout[n.id];
            if (custom?.x != null && custom?.y != null) {
                return { ...n, position: { x: custom.x, y: custom.y } };
            }
            return n;
        });

        return { layoutedNodes: final, layoutedEdges: edges };
    }, [journeys, subflowsByJourney, casesBySubflow, expanded, activeSubflowId, customLayout, toggleJourney, selectSubflow]);

    // Controlled nodes/edges para o ReactFlow
    const [rfNodes, setRfNodes] = useState<Node[]>(layoutedNodes);
    const [rfEdges, setRfEdges] = useState<Edge[]>(layoutedEdges);

    useEffect(() => { setRfNodes(layoutedNodes); }, [layoutedNodes]);
    useEffect(() => { setRfEdges(layoutedEdges); }, [layoutedEdges]);

    // Captura changes - persiste posicao/dimensoes em customLayout
    const onNodesChange = useCallback<OnNodesChange>(changes => {
        setRfNodes(ns => applyNodeChanges(changes, ns));
        captureLayoutChanges(changes);
    }, []);
    const onEdgesChange = useCallback<OnEdgesChange>(changes => {
        setRfEdges(es => applyEdgeChanges(changes, es));
    }, []);

    const captureLayoutChanges = (changes: NodeChange[]) => {
        let updated: CustomLayout | null = null;
        for (const c of changes) {
            if (c.type === 'position' && c.position && c.dragging === false) {
                // Drag terminou - persiste posicao
                updated = updated || { ...customLayout };
                updated[c.id] = { ...(updated[c.id] || {}), x: c.position.x, y: c.position.y };
            } else if (c.type === 'dimensions' && c.dimensions && c.resizing === false) {
                // Resize terminou - persiste tamanho
                updated = updated || { ...customLayout };
                updated[c.id] = { ...(updated[c.id] || {}), width: c.dimensions.width, height: c.dimensions.height };
            }
        }
        if (updated) setCustomLayout(updated);
    };

    const resetLayout = useCallback(() => {
        setCustomLayout({});
    }, []);

    // Export PNG
    const exportPng = useCallback(async () => {
        const el = containerRef.current?.querySelector('.react-flow') as HTMLElement | null;
        if (!el) return;
        try {
            const dataUrl = await toPng(el, {
                backgroundColor: '#05060a',
                pixelRatio: 2,
                filter: (node) => {
                    const cls = (node as HTMLElement).className?.toString() || '';
                    return !cls.includes('react-flow__controls') && !cls.includes('react-flow__minimap');
                },
            });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `qa-journey-map-${new Date().toISOString().slice(0, 10)}.png`;
            a.click();
        } catch (e) {
            console.error('export PNG falhou:', e);
            alert('Falha ao exportar PNG: ' + (e instanceof Error ? e.message : String(e)));
        }
    }, []);

    const toggleFullscreen = useCallback(async () => {
        const el = containerRef.current;
        if (!el) return;
        try {
            if (!document.fullscreenElement) {
                await el.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const totalJourneys = journeys.length;
    const exploredJourneys = useMemo(() => journeys.filter(j => expanded.has(j.id)).length, [journeys, expanded]);

    const activeSubflow = activeSubflowId
        ? Object.values(subflowsByJourney).flat().find(s => s.id === activeSubflowId)
        : null;
    const activeJourney = activeSubflow
        ? journeys.find(j => j.id === activeSubflow.journey_id)
        : null;

    const hasCustomLayout = Object.keys(customLayout).length > 0;

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-[#05060a] rounded-2xl overflow-hidden border border-white/5"
        >
            <ParticleBackground />

            {/* Top bar */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
                <div className="bg-[#0A0C14]/80 backdrop-blur border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2 pointer-events-auto">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    <span className="text-[11px] font-mono text-slate-300">
                        {exploredJourneys.toString().padStart(2, '0')} de {totalJourneys.toString().padStart(2, '0')} blocos explorados
                    </span>
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    {hasCustomLayout && (
                        <button
                            type="button"
                            onClick={resetLayout}
                            className="bg-[#0A0C14]/80 backdrop-blur border border-white/10 rounded-lg p-2 text-amber-400 hover:text-amber-300"
                            title="Resetar layout (volta para auto-organização)"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={exportPng}
                        className="bg-[#0A0C14]/80 backdrop-blur border border-white/10 rounded-lg p-2 text-slate-400 hover:text-white"
                        title="Exportar PNG (para apresentação)"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="bg-[#0A0C14]/80 backdrop-blur border border-white/10 rounded-lg p-2 text-slate-400 hover:text-white"
                        title={isFullscreen ? 'Sair do modo apresentação' : 'Modo apresentação'}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Tip de drag (some apos primeira interacao) */}
            {!hasCustomLayout && (
                <div className="absolute bottom-4 left-4 z-10 bg-[#0A0C14]/80 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-slate-400 pointer-events-none">
                    💡 Arraste os nós para reposicionar · selecione e arraste a borda para redimensionar
                </div>
            )}

            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                fitViewOptions={{ padding: 0.25, includeHiddenNodes: false }}
                minZoom={0.4}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={true}
                nodesConnectable={false}
                panOnScroll
                zoomOnDoubleClick={false}
            >
                <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#1a1d2e" />
                <Controls
                    showInteractive={false}
                    className="!bg-[#0A0C14]/80 !border-white/10 [&>button]:!bg-transparent [&>button]:!text-slate-400 [&>button]:!border-white/10 [&>button:hover]:!text-white"
                />
                <MiniMap
                    pannable
                    zoomable
                    nodeColor={n => (n.type === 'journey' ? '#7c3aed' : '#3b82f6')}
                    maskColor="rgba(5, 6, 10, 0.7)"
                    className="!bg-[#0A0C14]/80 !border !border-white/10 !rounded-lg"
                />
            </ReactFlow>

            <AnimatePresence>
                {activeJourney && activeSubflow && (
                    <SubflowDrawer
                        key={activeSubflow.id}
                        journey={activeJourney}
                        subflow={activeSubflow}
                        cases={casesBySubflow[activeSubflow.id] || []}
                        onClose={() => setActiveSubflowId(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
