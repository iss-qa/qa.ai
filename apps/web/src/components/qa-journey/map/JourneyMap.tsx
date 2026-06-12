'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    SelectionMode,
    type Edge,
    type Node,
    type NodeDragHandler,
    type NodeTypes,
    type OnNodesChange,
    type OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Download, Hand, Maximize2, Minimize2, MousePointer2, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';

import { applyDagreLayout } from '@/lib/qa-journey/layout';
import { JourneyNode, type JourneyNodeData } from './JourneyNode';
import { SubflowNode, type SubflowNodeData } from './SubflowNode';
import { CaseNode, type CaseNodeData } from './CaseNode';
import { HtmlDocNode, type HtmlDocNodeData } from './HtmlDocNode';
import { ParticleBackground } from './ParticleBackground';
import { SubflowModal } from './SubflowModal';
import { CaseDetailModal } from './CaseDetailModal';
import { JourneyHtmlModal } from './JourneyHtmlModal';
import { MapSettingsPopover } from './MapSettingsPopover';
import { useMapSettings } from './useMapSettings';
import { animateNodesTo, collectDescendants, resolveCollisions } from './collision';
import type { QAJourney, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface JourneyMapProps {
    projectId: string;
    journeys: QAJourney[];
    subflowsByJourney: Record<string, QAJourneySubflow[]>;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    // Registro manual de execução no modal de caso — o pai atualiza o estado.
    onCaseUpdated?: (updated: QAJourneyCase) => void;
    // Deep-link: jornada que deve abrir já expandida (?journey= na URL).
    initialExpandedJourneyId?: string;
}

const NODE_TYPES: NodeTypes = {
    journey: JourneyNode,
    subflow: SubflowNode,
    case: CaseNode,
    htmlDoc: HtmlDocNode,
};

// Tamanhos default por tipo de node
const JOURNEY_DEFAULT = { width: 240, height: 110 };
const SUBFLOW_DEFAULT = { width: 220, height: 80 };
const CASE_DEFAULT = { width: 200, height: 64 };
// Carrega já no tamanho de leitura (≈ modal médio) — o usuário estica pelas
// bordas ou clica em expandir para a visão quase tela cheia.
const HTML_DOC_DEFAULT = { width: 880, height: 620 };

// Layout customizado pelo usuario (drag + resize), persistido em localStorage por projeto.
type CustomLayout = Record<string, { x?: number; y?: number; width?: number; height?: number }>;

function layoutStorageKey(projectId: string): string {
    return `qa-journey-map-layout:${projectId}`;
}

// Estado de expansão (jornadas/sub-fluxos abertos) também persiste por
// projeto: "Ver mapa" deve reabrir o mapa como o usuário o deixou.
function expandedStorageKey(projectId: string, level: 'journeys' | 'subflows'): string {
    return `qa-journey-map-expanded:${level}:${projectId}`;
}

function readStoredSet(key: string): Set<string> {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
        // parse/storage indisponível
    }
    return new Set();
}

function writeStoredSet(key: string, value: Set<string>): void {
    try {
        if (value.size === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(Array.from(value)));
    } catch {
        // storage indisponível
    }
}

export function JourneyMap({ projectId, journeys, subflowsByJourney, casesBySubflow, onCaseUpdated, initialExpandedJourneyId }: JourneyMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const initial = readStoredSet(expandedStorageKey(projectId, 'journeys'));
        if (initialExpandedJourneyId) initial.add(initialExpandedJourneyId);
        return initial;
    });
    // Sub-fluxos com o ramo de casos de teste expandido no grafo (3º nível).
    const [expandedSubflows, setExpandedSubflows] = useState<Set<string>>(
        () => readStoredSet(expandedStorageKey(projectId, 'subflows')),
    );

    // Persiste o estado de expansão sempre que muda.
    useEffect(() => {
        writeStoredSet(expandedStorageKey(projectId, 'journeys'), expanded);
    }, [expanded, projectId]);
    useEffect(() => {
        writeStoredSet(expandedStorageKey(projectId, 'subflows'), expandedSubflows);
    }, [expandedSubflows, projectId]);
    const [activeSubflowId, setActiveSubflowId] = useState<string | null>(null);
    const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
    // Jornada cujo documento HTML anexado está aberto no modal.
    const [htmlJourneyId, setHtmlJourneyId] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mapSettings, updateMapSettings] = useMapSettings();
    // 'pan' = mãozinha (arrastar a tela); 'select' = ponteiro (caixa de
    // seleção múltipla estilo Miro — arrasta vários nós de uma vez).
    const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');

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
        // Abre o drawer e expande (puxa) o ramo de casos de teste no grafo.
        setActiveSubflowId(subflowId);
        setExpandedSubflows(prev => {
            const next = new Set(prev);
            next.add(subflowId);
            return next;
        });
    }, []);

    // O "voltar" do modal de caso depende da origem do clique:
    // - nó do mapa → voltar fecha tudo e devolve o mapa;
    // - lista do modal de sub-fluxo → voltar reabre o sub-fluxo.
    const openCaseFromMap = useCallback((caseId: string) => {
        setActiveSubflowId(null);
        setActiveCaseId(caseId);
    }, []);

    const openCaseFromSubflow = useCallback((caseId: string) => {
        // Mantém o sub-fluxo ativo atrás — é para onde o "voltar" retorna.
        setActiveCaseId(caseId);
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
                onOpenHtml: setHtmlJourneyId,
            };

            // IMPORTANTE: width/height no node são só dica de layout (dagre).
            // O tamanho RENDERIZADO vem de node.style — sem reaplicá-lo aqui,
            // todo rebuild do grafo descartaria o resize feito pelo usuário.
            const jCustom = customLayout[journey.id];
            nodes.push({
                id: journey.id,
                type: 'journey',
                position: { x: 0, y: 0 },
                data: journeyData,
                width: jCustom?.width ?? JOURNEY_DEFAULT.width,
                height: jCustom?.height ?? JOURNEY_DEFAULT.height,
                ...(jCustom?.width || jCustom?.height
                    ? { style: { width: jCustom.width, height: jCustom.height } }
                    : {}),
            });

            if (expanded.has(journey.id)) {
                // Documento HTML anexado vira uma "webview" filha da jornada.
                if (journey.html_doc) {
                    const htmlId = `html:${journey.id}`;
                    const hCustom = customLayout[htmlId];
                    const htmlData: HtmlDocNodeData = {
                        journey,
                        onOpenFull: setHtmlJourneyId,
                    };
                    nodes.push({
                        id: htmlId,
                        type: 'htmlDoc',
                        position: { x: 0, y: 0 },
                        data: htmlData,
                        dragHandle: '.html-doc-drag',
                        width: hCustom?.width ?? HTML_DOC_DEFAULT.width,
                        height: hCustom?.height ?? HTML_DOC_DEFAULT.height,
                        // style SEMPRE presente: sem ele o iframe colapsa para o
                        // tamanho intrínseco (~300×150) em vez do default grande.
                        style: {
                            width: hCustom?.width ?? HTML_DOC_DEFAULT.width,
                            height: hCustom?.height ?? HTML_DOC_DEFAULT.height,
                        },
                    });
                    edges.push({
                        id: `${journey.id}->${htmlId}`,
                        source: journey.id,
                        target: htmlId,
                        animated: false,
                        style: { stroke: journey.color || '#7c3aed', strokeWidth: 1.5, opacity: 0.5, strokeDasharray: '6 4' },
                    });
                }

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
                        ...(sCustom?.width || sCustom?.height
                            ? { style: { width: sCustom.width, height: sCustom.height } }
                            : {}),
                    });
                    edges.push({
                        id: `${journey.id}->${subflow.id}`,
                        source: journey.id,
                        target: subflow.id,
                        animated: true,
                        style: { stroke: journey.color || '#7c3aed', strokeWidth: 1.5, opacity: 0.6 },
                    });

                    // 3º nível: ramo de casos de teste (quando o sub-fluxo está expandido)
                    if (expandedSubflows.has(subflow.id)) {
                        cases.forEach(c => {
                            const caseData: CaseNodeData = {
                                case_: c,
                                isActive: activeCaseId === c.id,
                                onSelect: openCaseFromMap,
                            };
                            const cCustom = customLayout[c.id];
                            nodes.push({
                                id: c.id,
                                type: 'case',
                                position: { x: 0, y: 0 },
                                data: caseData,
                                width: cCustom?.width ?? CASE_DEFAULT.width,
                                height: cCustom?.height ?? CASE_DEFAULT.height,
                                ...(cCustom?.width || cCustom?.height
                                    ? { style: { width: cCustom.width, height: cCustom.height } }
                                    : {}),
                            });
                            edges.push({
                                id: `${subflow.id}->${c.id}`,
                                source: subflow.id,
                                target: c.id,
                                animated: false,
                                style: { stroke: journey.color || '#7c3aed', strokeWidth: 1, opacity: 0.35 },
                                // Empurra os casos 1 rank extra à frente para as
                                // linhas não cruzarem por baixo de outros sub-fluxos.
                                data: { minlen: 2 },
                            });
                        });
                    }
                });
            }
        });

        // Primeiro aplica dagre para todos
        const positioned = applyDagreLayout(nodes, edges, { direction: 'LR', rankSep: 150, nodeSep: 28 });

        // Sobrescreve posicoes customizadas pelo usuario (drag)
        const final = positioned.map(n => {
            const custom = customLayout[n.id];
            if (custom?.x != null && custom?.y != null) {
                return { ...n, position: { x: custom.x, y: custom.y } };
            }
            return n;
        });

        return { layoutedNodes: final, layoutedEdges: edges };
    }, [journeys, subflowsByJourney, casesBySubflow, expanded, expandedSubflows, activeSubflowId, activeCaseId, customLayout, toggleJourney, selectSubflow, openCaseFromMap]);

    // Controlled nodes/edges para o ReactFlow
    const [rfNodes, setRfNodes] = useState<Node[]>(layoutedNodes);
    const [rfEdges, setRfEdges] = useState<Edge[]>(layoutedEdges);

    useEffect(() => { setRfNodes(layoutedNodes); }, [layoutedNodes]);
    useEffect(() => { setRfEdges(layoutedEdges); }, [layoutedEdges]);

    // Espelhos em ref para os handlers de drag lerem o estado corrente
    // sem recriar callbacks a cada render.
    const rfNodesRef = useRef<Node[]>(rfNodes);
    rfNodesRef.current = rfNodes;
    const rfEdgesRef = useRef<Edge[]>(rfEdges);
    rfEdgesRef.current = rfEdges;

    // Persiste um conjunto de posicoes finais no customLayout (merge funcional).
    const persistPositions = useCallback((positions: Map<string, { x: number; y: number }>) => {
        if (positions.size === 0) return;
        setCustomLayout(prev => {
            const next = { ...prev };
            positions.forEach((pos, id) => {
                next[id] = { ...(next[id] || {}), x: pos.x, y: pos.y };
            });
            return next;
        });
    }, []);

    // O change FINAL de resize (resizing:false) chega sem `dimensions` (mesma
    // pegadinha do drag) — rastreia o último tamanho visto durante o resize
    // para persistir corretamente no fim.
    const resizingDims = useRef<Map<string, { width: number; height: number }>>(new Map());

    // Captura changes - persiste posicao/dimensoes em customLayout.
    // ATENÇÃO: o processamento fica FORA do updater do setState — em dev o
    // StrictMode invoca updaters duas vezes, e side effects lá dentro
    // (mutação do ref resizingDims) faziam a persistência do resize falhar.
    const onNodesChange = useCallback<OnNodesChange>(changes => {
        setRfNodes(ns => applyNodeChanges(changes, ns));

        const updates: CustomLayout = {};
        let hasUpdates = false;
        for (const c of changes) {
            if (c.type === 'position' && c.position && c.dragging === false) {
                // Drag terminou - persiste posicao
                updates[c.id] = { ...(updates[c.id] || {}), x: c.position.x, y: c.position.y };
                hasUpdates = true;
            } else if (c.type === 'dimensions') {
                if (c.resizing && c.dimensions) {
                    // Durante o resize o change traz as dimensões; o change
                    // FINAL (resizing:false) vem sem — guarda o último visto.
                    resizingDims.current.set(c.id, c.dimensions);
                } else if (c.resizing === false) {
                    const dims = c.dimensions ?? resizingDims.current.get(c.id);
                    resizingDims.current.delete(c.id);
                    if (dims) {
                        updates[c.id] = { ...(updates[c.id] || {}), width: dims.width, height: dims.height };
                        hasUpdates = true;
                    }
                }
            }
        }
        if (hasUpdates) {
            setCustomLayout(prev => {
                const next = { ...prev };
                for (const [id, patch] of Object.entries(updates)) {
                    next[id] = { ...(next[id] || {}), ...patch };
                }
                return next;
            });
        }
    }, []);
    const onEdgesChange = useCallback<OnEdgesChange>(changes => {
        setRfEdges(es => applyEdgeChanges(changes, es));
    }, []);

    // --- Drag agrupado (jornada move filhas) + anti-sobreposição ---

    // Contexto do drag corrente: posições iniciais do nó e das descendentes.
    const dragCtx = useRef<{
        nodeStart: { x: number; y: number };
        childStarts: Map<string, { x: number; y: number }>;
    } | null>(null);

    const onNodeDragStart = useCallback<NodeDragHandler>((_e, node) => {
        dragCtx.current = null;
        if (!mapSettings.groupDrag) return;
        const descendants = collectDescendants(node.id, rfEdgesRef.current);
        if (descendants.length === 0) return;
        const ids = new Set(descendants);
        const childStarts = new Map<string, { x: number; y: number }>();
        for (const n of rfNodesRef.current) {
            if (ids.has(n.id)) childStarts.set(n.id, { x: n.position.x, y: n.position.y });
        }
        dragCtx.current = {
            nodeStart: { x: node.position.x, y: node.position.y },
            childStarts,
        };
    }, [mapSettings.groupDrag]);

    const onNodeDrag = useCallback<NodeDragHandler>((_e, node) => {
        const ctx = dragCtx.current;
        if (!ctx) return;
        const dx = node.position.x - ctx.nodeStart.x;
        const dy = node.position.y - ctx.nodeStart.y;
        setRfNodes(ns => ns.map(n => {
            const start = ctx.childStarts.get(n.id);
            if (!start) return n;
            return { ...n, position: { x: start.x + dx, y: start.y + dy } };
        }));
    }, []);

    const onNodeDragStop = useCallback<NodeDragHandler>((_e, node, draggedNodes) => {
        const ctx = dragCtx.current;
        dragCtx.current = null;

        // Conjunto movido pelo usuário: nó arrastado + multi-seleção + filhas
        // agrupadas. IMPORTANTE: o change de posição que o React Flow emite no
        // fim do drag vem SEM `position`, então a persistência precisa
        // acontecer aqui — senão o próximo rebuild (expandir/recolher) volta
        // tudo para o layout automático.
        const movedIds = new Set<string>([node.id]);
        const finals = new Map<string, { x: number; y: number }>();
        finals.set(node.id, { x: node.position.x, y: node.position.y });
        for (const n of draggedNodes ?? []) {
            movedIds.add(n.id);
            finals.set(n.id, { x: n.position.x, y: n.position.y });
        }
        if (ctx) {
            const dx = node.position.x - ctx.nodeStart.x;
            const dy = node.position.y - ctx.nodeStart.y;
            ctx.childStarts.forEach((start, id) => {
                movedIds.add(id);
                finals.set(id, { x: start.x + dx, y: start.y + dy });
            });
        }
        persistPositions(finals);

        if (!mapSettings.antiOverlap) return;

        // Estado corrente já reflete o fim do drag (refs atualizados via render).
        const currentNodes = rfNodesRef.current.map(n => {
            const f = finals.get(n.id);
            return f ? { ...n, position: f } : n;
        });
        const displaced = resolveCollisions(currentNodes, movedIds);
        if (displaced.size === 0) return;
        animateNodesTo(setRfNodes, displaced, 240, () => persistPositions(displaced));
    }, [mapSettings.antiOverlap, persistPositions]);

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

    // Caso ativo (drawer empilhado) + o sub-fluxo a que pertence.
    const activeCase = activeCaseId
        ? Object.values(casesBySubflow).flat().find(c => c.id === activeCaseId)
        : null;
    const activeCaseSubflow = activeCase
        ? Object.values(subflowsByJourney).flat().find(s => s.id === activeCase.subflow_id)
        : null;

    const hasCustomLayout = Object.keys(customLayout).length > 0;

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-card rounded-2xl overflow-hidden border border-border"
        >
            <ParticleBackground />

            {/* Top bar */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
                <div className="bg-popover/80 backdrop-blur border border-border rounded-lg px-3 py-2 flex items-center gap-2 pointer-events-auto">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {exploredJourneys.toString().padStart(2, '0')} de {totalJourneys.toString().padStart(2, '0')} blocos explorados
                    </span>
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    {/* Modo de interação: mãozinha (pan) ou ponteiro (seleção múltipla) */}
                    <div className="bg-popover/80 backdrop-blur border border-border rounded-lg p-0.5 flex items-center">
                        <button
                            type="button"
                            onClick={() => setInteractionMode('pan')}
                            className={`p-1.5 rounded-md transition-colors ${
                                interactionMode === 'pan' ? 'bg-brand/20 text-brand' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Mover a tela (pan)"
                            aria-label="Modo mover a tela"
                        >
                            <Hand className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setInteractionMode('select')}
                            className={`p-1.5 rounded-md transition-colors ${
                                interactionMode === 'select' ? 'bg-brand/20 text-brand' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Selecionar vários nós (arraste para desenhar a seleção e mova em grupo)"
                            aria-label="Modo seleção múltipla"
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </button>
                    </div>
                    <MapSettingsPopover
                        settings={mapSettings}
                        onChange={updateMapSettings}
                        hasCustomLayout={hasCustomLayout}
                        onResetLayout={resetLayout}
                    />
                    <button
                        type="button"
                        onClick={exportPng}
                        className="bg-popover/80 backdrop-blur border border-border rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        title="Exportar PNG (para apresentação)"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="bg-popover/80 backdrop-blur border border-border rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        title={isFullscreen ? 'Sair do modo apresentação' : 'Modo apresentação'}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Tip de drag (some apos primeira interacao) */}
            {!hasCustomLayout && (
                <div className="absolute bottom-4 left-4 z-10 bg-popover/80 backdrop-blur border border-border rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground pointer-events-none">
                    💡 Arraste os nós para reposicionar · selecione e arraste a borda para redimensionar
                </div>
            )}

            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                fitView
                fitViewOptions={{ padding: 0.25, includeHiddenNodes: false }}
                minZoom={0.4}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={true}
                nodesConnectable={false}
                panOnScroll
                zoomOnDoubleClick={false}
                // Modo ponteiro: arrastar no fundo desenha a caixa de seleção
                // (pan continua disponível no botão do meio/direito do mouse).
                selectionOnDrag={interactionMode === 'select'}
                panOnDrag={interactionMode === 'select' ? [1, 2] : true}
                selectionMode={SelectionMode.Partial}
            >
                <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#1a1d2e" />
                <Controls
                    showInteractive={false}
                    className="!bg-popover/80 !border-border [&>button]:!bg-transparent [&>button]:!text-muted-foreground [&>button]:!border-border [&>button:hover]:!text-foreground"
                />
                <MiniMap
                    pannable
                    zoomable
                    nodeColor={n => (
                        n.type === 'journey' ? '#7c3aed'
                        : n.type === 'htmlDoc' ? '#0ea5e9'
                        : n.type === 'case' ? '#475569'
                        : '#3b82f6'
                    )}
                    maskColor="rgba(5, 6, 10, 0.7)"
                    className="!bg-popover/80 !border !border-border !rounded-lg"
                />
            </ReactFlow>

            <AnimatePresence>
                {activeJourney && activeSubflow && !activeCaseId && (
                    <SubflowModal
                        key={activeSubflow.id}
                        journey={activeJourney}
                        subflow={activeSubflow}
                        cases={casesBySubflow[activeSubflow.id] || []}
                        onSelectCase={openCaseFromSubflow}
                        onClose={() => { setActiveSubflowId(null); setActiveCaseId(null); }}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {activeCase && activeCaseSubflow && (
                    <CaseDetailModal
                        key={activeCase.id}
                        subflow={activeCaseSubflow}
                        case_={activeCase}
                        onBack={() => setActiveCaseId(null)}
                        onClose={() => { setActiveCaseId(null); setActiveSubflowId(null); }}
                        onCaseUpdated={onCaseUpdated}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {htmlJourneyId && (() => {
                    const j = journeys.find(x => x.id === htmlJourneyId);
                    return j?.html_doc ? (
                        <JourneyHtmlModal
                            key={j.id}
                            journey={j}
                            onClose={() => setHtmlJourneyId(null)}
                        />
                    ) : null;
                })()}
            </AnimatePresence>
        </div>
    );
}
