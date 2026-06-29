'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    ConnectionMode,
    Controls,
    MarkerType,
    MiniMap,
    SelectionMode,
    type Connection,
    type Edge,
    type Node,
    type NodeDragHandler,
    type NodeTypes,
    type OnNodesChange,
    type OnEdgesChange,
    type ReactFlowInstance,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Download, Group, Hand, Maximize2, Minimize2, MousePointer2, Redo2, Sparkles, Ungroup, Undo2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';

import { applyDagreLayout } from '@/lib/qa-journey/layout';
import { JourneyNode, type JourneyNodeData } from './JourneyNode';
import { SubflowNode, type SubflowNodeData } from './SubflowNode';
import { CaseNode, type CaseNodeData } from './CaseNode';
import { HtmlDocNode, type HtmlDocNodeData } from './HtmlDocNode';
import { VideoStepNode, type VideoStepNodeData } from './VideoStepNode';
import { StickyNoteNode, type AnnotationNodeData } from './StickyNoteNode';
import { ShapeNode } from './ShapeNode';
import { ImageAnnotationNode } from './ImageAnnotationNode';
import { CanvasToolbar } from './CanvasToolbar';
import { ManualEdge as ManualEdgeRenderer } from './ManualEdge';
import { ImageLightbox } from './ImageLightbox';
import {
    ANNOTATION_COLORS,
    genAnnotationId,
    genManualEdgeId,
    isAnnotationId,
    isManualEdgeId,
    loadAnnotations,
    saveAnnotations,
    uploadCanvasImage,
    type CanvasAnnotation,
    type ManualEdge,
    type ShapeVariant,
} from './canvas-annotations';
import { ParticleBackground } from './ParticleBackground';
import { SubflowModal } from './SubflowModal';
import { CaseDetailModal } from './CaseDetailModal';
import { JourneyHtmlModal } from './JourneyHtmlModal';
import { HtmlDocModal } from './HtmlDocModal';
import { MapSettingsPopover } from './MapSettingsPopover';
import { useMapSettings } from './useMapSettings';
import { animateNodesTo, collectDescendants, resolveCollisions } from './collision';
import { computeMetrics } from '../columns/helpers';
import type { QAJourney, QAJourneyCase, QAJourneySubflow, VideoStep } from '@/types/qa-journey';

interface JourneyMapProps {
    projectId: string;
    journeys: QAJourney[];
    subflowsByJourney: Record<string, QAJourneySubflow[]>;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    // Registro manual de execução no modal de caso — o pai atualiza o estado.
    onCaseUpdated?: (updated: QAJourneyCase) => void;
    // Edição inline do storyboard no mapa (legendas). Quando ausente, o
    // storyboard fica somente-leitura. O pai persiste e atualiza o estado.
    onSubflowStepsChange?: (subflowId: string, steps: VideoStep[]) => void;
    // Deep-link: jornada que deve abrir já expandida (?journey= na URL).
    initialExpandedJourneyId?: string;
}

const NODE_TYPES: NodeTypes = {
    journey: JourneyNode,
    subflow: SubflowNode,
    case: CaseNode,
    htmlDoc: HtmlDocNode,
    videoStep: VideoStepNode,
    sticky: StickyNoteNode,
    shape: ShapeNode,
    imageAnno: ImageAnnotationNode,
};

// Aresta manual (com botão de excluir). Constante estável fora do componente.
const EDGE_TYPES = { manual: ManualEdgeRenderer };

// Tamanhos default das anotações ao criar.
const STICKY_DEFAULT = { width: 200, height: 150 };
const SHAPE_DEFAULT = { width: 150, height: 110 };
const IMAGE_DEFAULT = { width: 260, height: 200 };

// Tamanhos default por tipo de node
const JOURNEY_DEFAULT = { width: 240, height: 110 };
const SUBFLOW_DEFAULT = { width: 260, height: 92 };
const CASE_DEFAULT = { width: 230, height: 76 };
// Carrega já no tamanho de leitura (≈ modal médio) — o usuário estica pelas
// bordas ou clica em expandir para a visão quase tela cheia.
const HTML_DOC_DEFAULT = { width: 880, height: 620 };
// Prévia de documento de sub-fluxo: um pouco menor que a da jornada (são mais
// numerosos no grafo). Também redimensionável/expansível.
const SUBFLOW_HTML_DOC_DEFAULT = { width: 720, height: 520 };
// Tela do storyboard de vídeo: retrato por padrão (prints de celular), mas o
// object-contain acomoda paisagem também. Redimensionável.
const VIDEO_STEP_DEFAULT = { width: 200, height: 300 };

// Layout customizado pelo usuario (drag + resize), persistido em localStorage por projeto.
type CustomLayout = Record<string, { x?: number; y?: number; width?: number; height?: number }>;

// Snapshot do estado editável do canvas para desfazer/refazer (Ctrl+Z).
interface HistorySnap {
    customLayout: CustomLayout;
    annotations: CanvasAnnotation[];
    manualEdges: ManualEdge[];
    suppressedEdges: string[];
    groups: string[][];
}

// Item da área de transferência interna: o que é necessário para recriar um nó
// como anotação ao colar. Geometria preservada para o offset do paste.
interface CopyItem {
    kind: CanvasAnnotation['kind'];
    x: number; y: number; width: number; height: number;
    text?: string;
    color?: string;
    shape?: ShapeVariant;
    imageUrl?: string;
}

// Converte um nó selecionado em um item copiável. Storyboard/imagens viram
// imagem-anotação; sticky/forma duplicam o mesmo tipo; demais nós (jornada,
// sub-fluxo, caso, doc) não são copiáveis (retorna null).
function nodeToCopyItem(n: Node): CopyItem | null {
    const w = n.width ?? 200;
    const h = n.height ?? 120;
    const base = { x: n.position.x, y: n.position.y, width: w, height: h };
    if (n.type === 'videoStep') {
        const url = (n.data as { step?: { image_url?: string } })?.step?.image_url;
        return url ? { kind: 'image', imageUrl: url, ...base } : null;
    }
    if (n.type === 'imageAnno' || n.type === 'sticky' || n.type === 'shape') {
        const a = (n.data as { annotation?: CanvasAnnotation })?.annotation;
        if (!a) return null;
        return { kind: a.kind, imageUrl: a.imageUrl, text: a.text, color: a.color, shape: a.shape, ...base };
    }
    return null;
}

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

export function JourneyMap({ projectId, journeys, subflowsByJourney, casesBySubflow, onCaseUpdated, onSubflowStepsChange, initialExpandedJourneyId }: JourneyMapProps) {
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
    // Sub-fluxo cujo documento HTML anexado está aberto no modal.
    const [htmlSubflowId, setHtmlSubflowId] = useState<string | null>(null);
    // Tela do storyboard (ou imagem-anotação) ampliada no lightbox.
    const [zoomStep, setZoomStep] = useState<{ step: VideoStep; index?: number } | null>(null);

    // Anotações livres (sticky/formas/imagens) + conexões manuais, por projeto.
    const [annotations, setAnnotations] = useState<CanvasAnnotation[]>([]);
    const [manualEdges, setManualEdges] = useState<ManualEdge[]>([]);
    // Setas automáticas (storyboard) removidas pelo usuário; grupos de nós.
    const [suppressedEdges, setSuppressedEdges] = useState<string[]>([]);
    const [groups, setGroups] = useState<string[][]>([]);
    const [annoLoaded, setAnnoLoaded] = useState(false);
    // Instância do React Flow (p/ converter tela→canvas no spawn) + último ponteiro.
    const rfInstance = useRef<ReactFlowInstance | null>(null);
    const lastPointer = useRef<{ x: number; y: number } | null>(null);
    // Nós atualmente selecionados (para copiar/colar e agrupar).
    const selectedNodesRef = useRef<Node[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // Área de transferência interna (cópia de nós do canvas).
    const copyBufferRef = useRef<CopyItem[]>([]);

    // Carrega anotações ao montar / trocar de projeto.
    useEffect(() => {
        setAnnoLoaded(false);
        const state = loadAnnotations(projectId);
        setAnnotations(state.annotations);
        setManualEdges(state.edges);
        setSuppressedEdges(state.suppressedEdges ?? []);
        setGroups(state.groups ?? []);
        setAnnoLoaded(true);
    }, [projectId]);

    // Persiste anotações sempre que mudam (após load inicial).
    useEffect(() => {
        if (!annoLoaded) return;
        saveAnnotations(projectId, { annotations, edges: manualEdges, suppressedEdges, groups });
    }, [annotations, manualEdges, suppressedEdges, groups, projectId, annoLoaded]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mapSettings, updateMapSettings] = useMapSettings();
    // 'pan' = mãozinha (arrastar a tela); 'select' = ponteiro (caixa de
    // seleção múltipla estilo Miro — arrasta vários nós de uma vez).
    const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');
    // Espelho em ref + estado do "pan temporário" enquanto a barra de espaço
    // está pressionada (estilo Figma): guarda o modo anterior para restaurar.
    const interactionModeRef = useRef<'pan' | 'select'>('pan');
    interactionModeRef.current = interactionMode;
    const spacePanPrev = useRef<'pan' | 'select' | null>(null);

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

    // --- Histórico do canvas (desfazer/refazer): posições + anotações + conexões ---
    const undoStack = useRef<HistorySnap[]>([]);
    const redoStack = useRef<HistorySnap[]>([]);
    const lastSnap = useRef<HistorySnap | null>(null);
    const restoringHistory = useRef(false);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const syncHistoryFlags = useCallback(() => {
        setCanUndo(undoStack.current.length > 0);
        setCanRedo(redoStack.current.length > 0);
    }, []);

    // Zera o histórico ao trocar de projeto.
    useEffect(() => {
        undoStack.current = [];
        redoStack.current = [];
        lastSnap.current = null;
        setCanUndo(false);
        setCanRedo(false);
    }, [projectId]);

    // Registra cada mudança discreta (drag/resize/add/edit/delete/conexão) como
    // um ponto de histórico. Empilha o estado ANTERIOR; o atual vira o baseline.
    useEffect(() => {
        if (!layoutLoaded || !annoLoaded) return;
        const cur: HistorySnap = { customLayout, annotations, manualEdges, suppressedEdges, groups };
        if (restoringHistory.current) {
            restoringHistory.current = false;
            lastSnap.current = cur;
            return;
        }
        if (lastSnap.current) {
            undoStack.current.push(lastSnap.current);
            if (undoStack.current.length > 100) undoStack.current.shift();
            redoStack.current = [];
            syncHistoryFlags();
        }
        lastSnap.current = cur;
    }, [customLayout, annotations, manualEdges, suppressedEdges, groups, layoutLoaded, annoLoaded, syncHistoryFlags]);

    const applySnap = useCallback((s: HistorySnap) => {
        restoringHistory.current = true;
        lastSnap.current = s;
        setCustomLayout(s.customLayout);
        setAnnotations(s.annotations);
        setManualEdges(s.manualEdges);
        setSuppressedEdges(s.suppressedEdges);
        setGroups(s.groups);
    }, []);

    const undo = useCallback(() => {
        if (undoStack.current.length === 0 || !lastSnap.current) return;
        const prev = undoStack.current.pop()!;
        redoStack.current.push(lastSnap.current);
        applySnap(prev);
        syncHistoryFlags();
    }, [applySnap, syncHistoryFlags]);

    const redo = useCallback(() => {
        if (redoStack.current.length === 0 || !lastSnap.current) return;
        const next = redoStack.current.pop()!;
        undoStack.current.push(lastSnap.current);
        applySnap(next);
        syncHistoryFlags();
    }, [applySnap, syncHistoryFlags]);

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

    // Amplia uma tela do storyboard no lightbox.
    const openZoom = useCallback((step: VideoStep, index: number) => setZoomStep({ step, index }), []);

    // --- Anotações livres (sticky/formas/imagens) + conexões manuais ---
    const updateAnnotation = useCallback((id: string, patch: Partial<CanvasAnnotation>) => {
        setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    }, []);
    const deleteAnnotation = useCallback((id: string) => {
        setAnnotations(prev => prev.filter(a => a.id !== id));
        setManualEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        setCustomLayout(prev => { const n = { ...prev }; delete n[id]; return n; });
    }, []);
    const openZoomAnnotation = useCallback((a: CanvasAnnotation) => {
        if (a.imageUrl) setZoomStep({ step: { id: a.id, order: 0, image_url: a.imageUrl, caption: a.text || '' } });
    }, []);
    const deleteManualEdge = useCallback((id: string) => {
        setManualEdges(prev => prev.filter(e => e.id !== id));
    }, []);
    // Remove (esconde) uma seta AUTOMÁTICA do storyboard, quebrando a cadeia.
    const suppressEdge = useCallback((id: string) => {
        setSuppressedEdges(prev => (prev.includes(id) ? prev : [...prev, id]));
    }, []);

    // --- Agrupar / desagrupar nós (move juntos; não desagrupa por engano) ---
    const groupOf = useCallback((id: string): string[] | null => {
        return groups.find(g => g.includes(id)) ?? null;
    }, [groups]);
    const groupSelected = useCallback(() => {
        const ids = selectedNodesRef.current.map(n => n.id);
        if (ids.length < 2) return;
        // Une com qualquer grupo que já contenha um dos selecionados (merge).
        setGroups(prev => {
            const set = new Set(ids);
            const untouched: string[][] = [];
            for (const g of prev) {
                if (g.some(x => set.has(x))) g.forEach(x => set.add(x));
                else untouched.push(g);
            }
            return [...untouched, Array.from(set)];
        });
    }, []);
    const ungroupSelected = useCallback(() => {
        const ids = new Set(selectedNodesRef.current.map(n => n.id));
        if (ids.size === 0) return;
        setGroups(prev => prev.filter(g => !g.some(x => ids.has(x))));
    }, []);
    // Liga dois nós (qualquer par) — vira uma edge manual persistida.
    const onConnect = useCallback((c: Connection) => {
        if (!c.source || !c.target || c.source === c.target) return;
        setManualEdges(prev => (
            // Mesma origem+borda → destino+borda já existe? não duplica.
            prev.some(e => e.source === c.source && e.target === c.target
                && e.sourceHandle === c.sourceHandle && e.targetHandle === c.targetHandle)
                ? prev
                : [...prev, {
                    id: genManualEdgeId(),
                    source: c.source!,
                    target: c.target!,
                    sourceHandle: c.sourceHandle,
                    targetHandle: c.targetHandle,
                }]
        ));
    }, []);

    // Reconstroi grafo (nodes/edges) - aplica dagre + sobrescreve com customLayout
    const { layoutedNodes, layoutedEdges } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        journeys.forEach(journey => {
            const sub = subflowsByJourney[journey.id] || [];
            // Cobertura POR CASO — mesma definição do layout em colunas, p/ os
            // números baterem entre o mapa e os cards.
            const m = computeMetrics(sub, casesBySubflow);

            const journeyData: JourneyNodeData = {
                journey,
                automatedCount: m.automatedCases,
                totalCount: m.totalCases,
                docCount: sub.filter(s => s.html_doc).length,
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
                        docId: journey.id,
                        title: journey.title,
                        html: journey.html_doc,
                        color: journey.color || undefined,
                        onOpenFull: setHtmlJourneyId,
                    };
                    nodes.push({
                        id: htmlId,
                        type: 'htmlDoc',
                        position: { x: 0, y: 0 },
                        data: htmlData,
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

                // IDs dos subfluxos desta jornada — para validar parent_subflow_id
                // (um pai órfão/fora da jornada cai de volta na raiz).
                const subIds = new Set(sub.map(s => s.id));

                sub.forEach(subflow => {
                    const cases = casesBySubflow[subflow.id] || [];
                    const subflowData: SubflowNodeData = {
                        subflow,
                        caseCount: cases.length,
                        isActive: activeSubflowId === subflow.id,
                        onSelect: selectSubflow,
                    };
                    const sCustom = customLayout[subflow.id];
                    const subW = sCustom?.width ?? SUBFLOW_DEFAULT.width;
                    nodes.push({
                        id: subflow.id,
                        type: 'subflow',
                        position: { x: 0, y: 0 },
                        data: subflowData,
                        width: subW,
                        height: sCustom?.height ?? SUBFLOW_DEFAULT.height,
                        // Largura SEMPRE fixa → o texto quebra (line-clamp) em vez de
                        // esticar o card. Altura só quando o usuário redimensiona;
                        // senão cresce com o conteúdo.
                        style: { width: subW, ...(sCustom?.height ? { height: sCustom.height } : {}) },
                    });
                    // Subfluxo filho liga ao PAI; raiz liga à jornada. Assim o
                    // dagre (LR) posiciona o filho à direita do pai, não da jornada.
                    const parentId = subflow.parent_subflow_id && subIds.has(subflow.parent_subflow_id)
                        ? subflow.parent_subflow_id
                        : null;
                    const edgeSource = parentId || journey.id;
                    edges.push({
                        id: `${edgeSource}->${subflow.id}`,
                        source: edgeSource,
                        target: subflow.id,
                        animated: true,
                        style: { stroke: journey.color || '#7c3aed', strokeWidth: 1.5, opacity: parentId ? 0.8 : 0.6 },
                    });

                    // Documento HTML anexado ao sub-fluxo → "webview" filha (igual
                    // ao da jornada). Sempre visível enquanto o sub-fluxo aparece;
                    // arrastável/redimensionável e expansível em tela cheia.
                    if (subflow.html_doc) {
                        const subHtmlId = `html:sub:${subflow.id}`;
                        const hCustom = customLayout[subHtmlId];
                        const w = hCustom?.width ?? SUBFLOW_HTML_DOC_DEFAULT.width;
                        const h = hCustom?.height ?? SUBFLOW_HTML_DOC_DEFAULT.height;
                        const subHtmlData: HtmlDocNodeData = {
                            docId: subflow.id,
                            title: subflow.title,
                            html: subflow.html_doc,
                            color: journey.color || undefined,
                            onOpenFull: setHtmlSubflowId,
                        };
                        nodes.push({
                            id: subHtmlId,
                            type: 'htmlDoc',
                            position: { x: 0, y: 0 },
                            data: subHtmlData,
                            width: w,
                            height: h,
                            style: { width: w, height: h },
                        });
                        edges.push({
                            id: `${subflow.id}->${subHtmlId}`,
                            source: subflow.id,
                            target: subHtmlId,
                            animated: false,
                            style: { stroke: journey.color || '#7c3aed', strokeWidth: 1.5, opacity: 0.5, strokeDasharray: '6 4' },
                        });
                    }

                    // Storyboard de vídeo (migration 025): telas encadeadas por
                    // setas (passo a passo). Aparece enquanto a jornada está
                    // expandida — igual ao documento HTML do sub-fluxo.
                    const steps = (subflow.video_steps || []).slice().sort((a, b) => a.order - b.order);
                    if (steps.length > 0) {
                        let prevId = subflow.id;
                        steps.forEach((step, idx) => {
                            const vId = `vstep:${subflow.id}:${step.id}`;
                            const vCustom = customLayout[vId];
                            const vw = vCustom?.width ?? VIDEO_STEP_DEFAULT.width;
                            const vh = vCustom?.height ?? VIDEO_STEP_DEFAULT.height;
                            const vData: VideoStepNodeData = {
                                step,
                                index: idx + 1,
                                color: journey.color || undefined,
                                onZoom: s => openZoom(s, idx + 1),
                                onCaptionCommit: onSubflowStepsChange
                                    ? (caption: string) => onSubflowStepsChange(
                                        subflow.id,
                                        steps.map(s => (s.id === step.id ? { ...s, caption } : s)),
                                    )
                                    : undefined,
                            };
                            nodes.push({
                                id: vId,
                                type: 'videoStep',
                                position: { x: 0, y: 0 },
                                data: vData,
                                width: vw,
                                height: vh,
                                style: { width: vw, height: vh },
                            });
                            const chainId = `${prevId}->${vId}`;
                            // Seta da cadeia: pode ser removida (suprimida) para
                            // inserir algo no meio. Se suprimida, não desenha.
                            if (!suppressedEdges.includes(chainId)) {
                                const col = journey.color || '#7c3aed';
                                edges.push({
                                    id: chainId,
                                    source: prevId,
                                    target: vId,
                                    // Encadeia da direita p/ a esquerda (o nó-imagem
                                    // tem 4 pontos de conexão — sem fixar, a seta
                                    // escolheria lados aleatórios).
                                    sourceHandle: idx === 0 ? undefined : 'r',
                                    targetHandle: 'l',
                                    type: 'manual',
                                    animated: false,
                                    markerEnd: { type: MarkerType.ArrowClosed, color: col, width: 16, height: 16 },
                                    style: { stroke: col, strokeWidth: 1.5, opacity: 0.75 },
                                    zIndex: 1000,
                                    data: { onDelete: () => suppressEdge(chainId) },
                                });
                            }
                            prevId = vId;
                        });
                    }

                    // 3º nível: ramo de casos de teste (quando o sub-fluxo está expandido)
                    if (expandedSubflows.has(subflow.id)) {
                        cases.forEach(c => {
                            const caseData: CaseNodeData = {
                                case_: c,
                                isActive: activeCaseId === c.id,
                                onSelect: openCaseFromMap,
                            };
                            const cCustom = customLayout[c.id];
                            const caseW = cCustom?.width ?? CASE_DEFAULT.width;
                            nodes.push({
                                id: c.id,
                                type: 'case',
                                position: { x: 0, y: 0 },
                                data: caseData,
                                width: caseW,
                                height: cCustom?.height ?? CASE_DEFAULT.height,
                                style: { width: caseW, ...(cCustom?.height ? { height: cCustom.height } : {}) },
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

        // Balanceia os casos de cada sub-fluxo: metade ACIMA, metade ABAIXO do
        // pai (em vez de cascatear todos para baixo). O pai fica centralizado no
        // "leque" de casos — ex.: 16 casos → 8 em cima, 8 embaixo.
        const posById = new Map(positioned.map(n => [n.id, n]));
        const caseChildrenOf = new Map<string, typeof positioned>();
        for (const e of edges) {
            const src = posById.get(e.source);
            const tgt = posById.get(e.target);
            if (src?.type === 'subflow' && tgt?.type === 'case') {
                const arr = caseChildrenOf.get(e.source) || [];
                arr.push(tgt);
                caseChildrenOf.set(e.source, arr);
            }
        }
        const CASE_GAP = 18;
        for (const [subId, kids] of caseChildrenOf) {
            const sub = posById.get(subId);
            if (!sub || kids.length === 0) continue;
            const subCenterY = sub.position.y + (sub.height ?? SUBFLOW_DEFAULT.height) / 2;
            kids.sort((a, b) => a.position.y - b.position.y);  // preserva a ordem do dagre
            const heights = kids.map(k => k.height ?? CASE_DEFAULT.height);
            const totalH = heights.reduce((s, h) => s + h, 0) + CASE_GAP * (kids.length - 1);
            let y = subCenterY - totalH / 2;
            kids.forEach((k, i) => {
                k.position = { ...k.position, y };   // mantém o x (rank) do dagre
                y += heights[i] + CASE_GAP;
            });
        }

        // Sobrescreve posicoes customizadas pelo usuario (drag)
        const final = positioned.map(n => {
            const custom = customLayout[n.id];
            if (custom?.x != null && custom?.y != null) {
                return { ...n, position: { x: custom.x, y: custom.y } };
            }
            return n;
        });

        // Novo fluxo não cai POR CIMA dos cards já arrumados: nós AINDA sem
        // posição custom que CAIRIAM sobre o cluster já posicionado são
        // empurrados para baixo dele (em bloco, preservando o arranjo interno).
        // Nós que não se sobrepõem (ex.: a jornada à esquerda) ficam onde estão.
        const customized: Node[] = [];
        const uncustomized: Node[] = [];
        for (const n of final) {
            const c = customLayout[n.id];
            (c?.x != null && c?.y != null ? customized : uncustomized).push(n);
        }
        if (customized.length > 0 && uncustomized.length > 0) {
            const bbox = (ns: Node[]) => ns.reduce((b, n) => ({
                minX: Math.min(b.minX, n.position.x),
                minY: Math.min(b.minY, n.position.y),
                maxX: Math.max(b.maxX, n.position.x + (n.width ?? 200)),
                maxY: Math.max(b.maxY, n.position.y + (n.height ?? 80)),
            }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
            const cb = bbox(customized);
            const PAD = 24;
            const overlapping = uncustomized.filter(n => {
                const x = n.position.x, y = n.position.y, w = n.width ?? 200, h = n.height ?? 80;
                return x < cb.maxX + PAD && x + w > cb.minX - PAD && y < cb.maxY + PAD && y + h > cb.minY - PAD;
            });
            if (overlapping.length > 0) {
                const topOver = Math.min(...overlapping.map(n => n.position.y));
                const shift = cb.maxY + 140 - topOver;
                if (shift > 0) overlapping.forEach(n => { n.position = { ...n.position, y: n.position.y + shift }; });
            }
        }

        // Anotações livres — NÃO passam pelo dagre (posição é do usuário).
        // Geometria: base na própria anotação, sobrescrita pelo customLayout
        // (mesmo mecanismo de drag/resize/persistência dos demais nós).
        const annoNodes: Node[] = annotations.map(a => {
            const c = customLayout[a.id];
            const w = c?.width ?? a.width;
            const h = c?.height ?? a.height;
            const nodeData: AnnotationNodeData = {
                annotation: a,
                onChange: updateAnnotation,
                onDelete: deleteAnnotation,
                onZoom: openZoomAnnotation,
            };
            return {
                id: a.id,
                type: a.kind === 'sticky' ? 'sticky' : a.kind === 'shape' ? 'shape' : 'imageAnno',
                position: { x: c?.x ?? a.x, y: c?.y ?? a.y },
                data: nodeData,
                width: w,
                height: h,
                style: { width: w, height: h },
            };
        });
        const annoEdges: Edge[] = manualEdges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            // Reaplica as bordas exatas para a seta sair/chegar onde foi puxada.
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            type: 'manual',
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            // Conexões manuais ficam ACIMA dos nós (por padrão a edge passa por
            // trás do card e some). zIndex alto traz a linha para a frente.
            zIndex: 1000,
            data: { manual: true, onDelete: () => deleteManualEdge(e.id) },
        }));

        return { layoutedNodes: [...final, ...annoNodes], layoutedEdges: [...edges, ...annoEdges] };
    }, [journeys, subflowsByJourney, casesBySubflow, expanded, expandedSubflows, activeSubflowId, activeCaseId, customLayout, toggleJourney, selectSubflow, openCaseFromMap, openZoom, onSubflowStepsChange, annotations, manualEdges, updateAnnotation, deleteAnnotation, openZoomAnnotation, deleteManualEdge, suppressedEdges, suppressEdge]);

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
        // Remoção (Delete/Backspace): só anotações podem ser apagadas; nós de
        // dado (jornada/sub-fluxo/caso/storyboard) são protegidos.
        const removedAnno: string[] = [];
        const safe = changes.filter(c => {
            if (c.type === 'remove') {
                if (isAnnotationId(c.id)) { removedAnno.push(c.id); return true; }
                return false;
            }
            return true;
        });
        setRfNodes(ns => applyNodeChanges(safe, ns));
        if (removedAnno.length) {
            const rm = new Set(removedAnno);
            setAnnotations(prev => prev.filter(a => !rm.has(a.id)));
            setManualEdges(prev => prev.filter(e => !rm.has(e.source) && !rm.has(e.target)));
            setCustomLayout(prev => { const n = { ...prev }; removedAnno.forEach(id => delete n[id]); return n; });
        }

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
        // Removíveis: conexões manuais (apaga) e setas de storyboard (suprime,
        // para "quebrar" a cadeia). Demais edges de dado ficam protegidas.
        const removedManual: string[] = [];
        const removedChain: string[] = [];
        const safe = changes.filter(c => {
            if (c.type === 'remove') {
                if (isManualEdgeId(c.id)) { removedManual.push(c.id); return true; }
                if (c.id.includes('vstep:')) { removedChain.push(c.id); return true; }
                return false;
            }
            return true;
        });
        setRfEdges(es => applyEdgeChanges(safe, es));
        if (removedManual.length) {
            const rm = new Set(removedManual);
            setManualEdges(prev => prev.filter(e => !rm.has(e.id)));
        }
        if (removedChain.length) {
            setSuppressedEdges(prev => {
                const next = new Set(prev);
                removedChain.forEach(id => next.add(id));
                return Array.from(next);
            });
        }
    }, []);

    // --- Drag agrupado (jornada move filhas) + anti-sobreposição ---

    // Contexto do drag corrente: posições iniciais do nó e das descendentes.
    const dragCtx = useRef<{
        nodeStart: { x: number; y: number };
        childStarts: Map<string, { x: number; y: number }>;
    } | null>(null);

    const onNodeDragStart = useCallback<NodeDragHandler>((_e, node) => {
        dragCtx.current = null;
        const ids = new Set<string>();
        // Grupo do usuário (move junto, sempre — independe do groupDrag).
        const grp = groupOf(node.id);
        if (grp) grp.forEach(id => { if (id !== node.id) ids.add(id); });
        // Filhas no grafo (jornada → sub-fluxos → casos), se groupDrag ligado.
        if (mapSettings.groupDrag) collectDescendants(node.id, rfEdgesRef.current).forEach(id => ids.add(id));
        if (ids.size === 0) return;
        const childStarts = new Map<string, { x: number; y: number }>();
        for (const n of rfNodesRef.current) {
            if (ids.has(n.id)) childStarts.set(n.id, { x: n.position.x, y: n.position.y });
        }
        dragCtx.current = {
            nodeStart: { x: node.position.x, y: node.position.y },
            childStarts,
        };
    }, [mapSettings.groupDrag, groupOf]);

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

    // Arrasto de MÚLTIPLOS nós (caixa de seleção / vários selecionados). Sem
    // isso, mover vários cards de uma vez não era persistido — e qualquer
    // rebuild (ex.: adicionar/editar um sticky note) descartava o
    // reposicionamento, voltando ao layout automático.
    const onSelectionDragStop = useCallback((_e: React.MouseEvent, nodes: Node[]) => {
        const finals = new Map<string, { x: number; y: number }>();
        for (const n of nodes) finals.set(n.id, { x: n.position.x, y: n.position.y });
        persistPositions(finals);

        if (!mapSettings.antiOverlap) return;
        const movedIds = new Set(finals.keys());
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

    // --- Spawn de anotações (estilo Figma/Miro) ---

    // Converte coordenadas de tela em coordenadas do canvas (flow). Sem args =
    // centro do viewport atual.
    const flowPoint = useCallback((clientX?: number, clientY?: number) => {
        const inst = rfInstance.current;
        const el = containerRef.current;
        if (inst && el) {
            const rect = el.getBoundingClientRect();
            const vp = inst.getViewport();
            const sx = clientX ?? rect.left + rect.width / 2;
            const sy = clientY ?? rect.top + rect.height / 2;
            return { x: (sx - rect.left - vp.x) / vp.zoom, y: (sy - rect.top - vp.y) / vp.zoom };
        }
        return { x: 0, y: 0 };
    }, []);

    // Acha um ponto livre perto do desejado (cascata) — evita nascer em cima de
    // outro nó. Atende "não deixar uma imagem ficar por cima da outra".
    const findFreeSpot = useCallback((x: number, y: number, w: number, h: number) => {
        const boxes = rfNodesRef.current.map(n => ({ x: n.position.x, y: n.position.y, w: n.width ?? 200, h: n.height ?? 80 }));
        const pad = 20;
        let px = x, py = y;
        for (let i = 0; i < 80; i++) {
            const hit = boxes.some(b => px < b.x + b.w + pad && px + w + pad > b.x && py < b.y + b.h + pad && py + h + pad > b.y);
            if (!hit) break;
            px += 28; py += 24;
        }
        return { x: px, y: py };
    }, []);

    // Cria uma anotação numa posição-base (achando um ponto livre próximo).
    const createAnnotation = useCallback((
        partial: Omit<CanvasAnnotation, 'id' | 'x' | 'y' | 'width' | 'height'>,
        w: number, h: number, baseX: number, baseY: number,
    ) => {
        const spot = findFreeSpot(baseX, baseY, w, h);
        setAnnotations(prev => [...prev, { id: genAnnotationId(), x: spot.x, y: spot.y, width: w, height: h, ...partial }]);
    }, [findFreeSpot]);

    // Cria centrado no cursor/viewport (toolbar, paste de imagem externa).
    const spawnAnnotation = useCallback((
        partial: Omit<CanvasAnnotation, 'id' | 'x' | 'y' | 'width' | 'height'>,
        w: number, h: number, clientX?: number, clientY?: number,
    ) => {
        const p = flowPoint(clientX, clientY);
        createAnnotation(partial, w, h, p.x - w / 2, p.y - h / 2);
    }, [flowPoint, createAnnotation]);

    // Cola os itens copiados (somente os que estavam selecionados), com offset.
    const pasteCopyBuffer = useCallback(() => {
        const items = copyBufferRef.current;
        if (!items.length) return;
        items.forEach(it => {
            const { x, y, width, height, ...rest } = it;
            createAnnotation(rest, width, height, x + 28, y + 28);
        });
    }, [createAnnotation]);

    const addSticky = useCallback(() => {
        spawnAnnotation({ kind: 'sticky', text: '', color: ANNOTATION_COLORS[0] }, STICKY_DEFAULT.width, STICKY_DEFAULT.height);
    }, [spawnAnnotation]);

    const addShape = useCallback((shape: ShapeVariant) => {
        spawnAnnotation(
            { kind: 'shape', shape, text: '', color: shape === 'diamond' ? ANNOTATION_COLORS[3] : ANNOTATION_COLORS[2] },
            SHAPE_DEFAULT.width, SHAPE_DEFAULT.height,
        );
    }, [spawnAnnotation]);

    const addImageFromBlob = useCallback(async (blob: Blob, clientX?: number, clientY?: number) => {
        try {
            const url = await uploadCanvasImage(projectId, blob);
            const dims = await new Promise<{ w: number; h: number }>(res => {
                const im = new Image();
                im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
                im.onerror = () => res({ w: IMAGE_DEFAULT.width, h: IMAGE_DEFAULT.height });
                im.src = url;
            });
            const scale = Math.min(1, 320 / Math.max(1, dims.w));
            const w = Math.round(dims.w * scale) || IMAGE_DEFAULT.width;
            const h = Math.round(dims.h * scale) || IMAGE_DEFAULT.height;
            spawnAnnotation({ kind: 'image', imageUrl: url }, w, h, clientX, clientY);
        } catch (e) {
            console.error('upload de imagem no canvas falhou:', e);
            alert('Falha ao enviar a imagem para o canvas.');
        }
    }, [projectId, spawnAnnotation]);

    const addImageFile = useCallback((file: File) => { void addImageFromBlob(file); }, [addImageFromBlob]);

    // Não interceptar atalhos quando o foco está num campo de texto (edição de
    // legenda/sticky/forma) — ali Ctrl+C/V é copiar/colar texto normal.
    const isEditingText = () => {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
    };

    // Ctrl/Cmd+C: copia SOMENTE os nós selecionados para a área interna e
    // impede o navegador de copiar um screenshot da região (causa de "copiou
    // os 3" em vez do card selecionado).
    useEffect(() => {
        const onCopy = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return;
            if (isEditingText()) return;
            // Se há texto selecionado na página, é cópia de texto — não interfere.
            if (window.getSelection()?.toString()) return;
            const items = selectedNodesRef.current.map(nodeToCopyItem).filter((x): x is CopyItem => x !== null);
            if (items.length) {
                copyBufferRef.current = items;
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', onCopy);
        return () => window.removeEventListener('keydown', onCopy);
    }, []);

    // Colar: prioriza a cópia interna (só o selecionado); se não houver, e o
    // clipboard tiver uma imagem externa, cria uma imagem-anotação.
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (isEditingText()) return;
            if (copyBufferRef.current.length) {
                e.preventDefault();
                pasteCopyBuffer();
                return;
            }
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const it of Array.from(items)) {
                if (it.type.startsWith('image/')) {
                    const f = it.getAsFile();
                    if (f) { e.preventDefault(); void addImageFromBlob(f, lastPointer.current?.x, lastPointer.current?.y); }
                    return;
                }
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [addImageFromBlob, pasteCopyBuffer]);

    // Atalhos de navegação estilo Figma:
    //   V = ponteiro (seleção) · H = mãozinha (pan)
    //   Espaço (segurar) = pan temporário; solta → volta ao modo anterior.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditingText()) return;
            if (e.code === 'Space') {
                if (!spacePanPrev.current) {              // ignora auto-repeat
                    spacePanPrev.current = interactionModeRef.current;
                    setInteractionMode('pan');
                }
                e.preventDefault();                        // não rola a página
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k === 'h') setInteractionMode('pan');
            else if (k === 'v') setInteractionMode('select');
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space' && spacePanPrev.current) {
                setInteractionMode(spacePanPrev.current);
                spacePanPrev.current = null;
            }
        };
        // Se a janela perde o foco com espaço pressionado, não trava no pan.
        const onBlur = () => {
            if (spacePanPrev.current) { setInteractionMode(spacePanPrev.current); spacePanPrev.current = null; }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, []);

    // Desfazer/refazer: Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z (ou Ctrl+Y).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'z') {
                if (isEditingText()) return; // deixa o textarea desfazer o texto
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if (k === 'y') {
                if (isEditingText()) return;
                e.preventDefault();
                redo();
            } else if (k === 'g') {
                if (isEditingText()) return;
                e.preventDefault();
                if (e.shiftKey) ungroupSelected(); else groupSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, groupSelected, ungroupSelected]);

    // Mantém o ref de seleção atualizado (origem do copiar).
    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        selectedNodesRef.current = nodes;
        setSelectedIds(nodes.map(n => n.id));
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
            onMouseMove={e => { lastPointer.current = { x: e.clientX, y: e.clientY }; }}
            onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }}
            onDrop={e => {
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith('image/')) { e.preventDefault(); void addImageFromBlob(f, e.clientX, e.clientY); }
            }}
        >
            <ParticleBackground />

            {/* Paleta de componentes (sticky / formas / imagem) */}
            <CanvasToolbar onAddSticky={addSticky} onAddShape={addShape} onAddImageFile={addImageFile} />

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
                            title="Mover a tela / mãozinha — tecla H (ou segure Espaço)"
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
                            title="Selecionar / ponteiro — tecla V (arraste para selecionar vários e mover em grupo)"
                            aria-label="Modo seleção múltipla"
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Desfazer / refazer (Ctrl+Z · Ctrl+Shift+Z) */}
                    <div className="bg-popover/80 backdrop-blur border border-border rounded-lg p-0.5 flex items-center">
                        <button
                            type="button"
                            onClick={undo}
                            disabled={!canUndo}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Desfazer (Ctrl+Z)"
                            aria-label="Desfazer"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={redo}
                            disabled={!canRedo}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Refazer (Ctrl+Shift+Z)"
                            aria-label="Refazer"
                        >
                            <Redo2 className="w-4 h-4" />
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

            {/* Barra de agrupar (aparece com 2+ nós selecionados) */}
            {(() => {
                const groupable = selectedIds.length >= 2;
                const hasGroup = selectedIds.some(id => groups.some(g => g.includes(id)));
                if (!groupable && !hasGroup) return null;
                return (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-popover/90 backdrop-blur border border-border rounded-lg p-1 shadow-lg pointer-events-auto">
                        {groupable && (
                            <button type="button" onClick={groupSelected} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-foreground hover:bg-brand/10 hover:text-brand transition-colors" title="Agrupar selecionados (Ctrl+G)">
                                <Group className="w-3.5 h-3.5" /> Agrupar {selectedIds.length}
                            </button>
                        )}
                        {hasGroup && (
                            <button type="button" onClick={ungroupSelected} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors" title="Desagrupar (Ctrl+Shift+G)">
                                <Ungroup className="w-3.5 h-3.5" /> Desagrupar
                            </button>
                        )}
                    </div>
                );
            })()}

            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                deleteKeyCode={['Backspace', 'Delete']}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onSelectionDragStop={onSelectionDragStop}
                onInit={inst => { rfInstance.current = inst; }}
                onConnect={onConnect}
                onSelectionChange={onSelectionChange}
                fitView
                fitViewOptions={{ padding: 0.25, includeHiddenNodes: false }}
                minZoom={0.4}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={true}
                nodesConnectable={true}
                // Conexão mais "tolerante": qualquer borda serve de origem/alvo
                // e o raio de captura maior facilita ligar um bloco a outro.
                connectionMode={ConnectionMode.Loose}
                connectionRadius={48}
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
                        : n.type === 'videoStep' ? '#10b981'
                        : n.type === 'sticky' || n.type === 'shape' ? '#f59e0b'
                        : n.type === 'imageAnno' ? '#10b981'
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

            <AnimatePresence>
                {htmlSubflowId && (() => {
                    const s = Object.values(subflowsByJourney).flat().find(x => x.id === htmlSubflowId);
                    const j = s ? journeys.find(x => x.id === s.journey_id) : null;
                    return s?.html_doc ? (
                        <HtmlDocModal
                            key={s.id}
                            title={s.title}
                            subtitle={`Documento do sub-fluxo${j ? ` · ${j.title}` : ''}`}
                            html={s.html_doc}
                            accentColor={j?.color || undefined}
                            onClose={() => setHtmlSubflowId(null)}
                        />
                    ) : null;
                })()}
            </AnimatePresence>

            <AnimatePresence>
                {zoomStep && (
                    <ImageLightbox
                        key={zoomStep.step.id}
                        step={zoomStep.step}
                        index={zoomStep.index}
                        onClose={() => setZoomStep(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
