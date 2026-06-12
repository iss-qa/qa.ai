// Helper para posicionar nodes do React Flow usando o algoritmo dagre.
// Os nodes/edges entram sem coordenadas - este modulo retorna a mesma
// estrutura com x/y calculados.

import dagre from 'dagre';
import { Position, type Edge, type Node } from 'reactflow';

export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
    direction?: LayoutDirection;
    nodeWidth?: number;
    nodeHeight?: number;
    rankSep?: number;     // distancia entre ranks (colunas em LR, linhas em TB)
    nodeSep?: number;     // distancia entre nodes do mesmo rank
}

export function applyDagreLayout<T = unknown>(
    nodes: Node<T>[],
    edges: Edge[],
    options: LayoutOptions = {},
): Node<T>[] {
    const {
        direction = 'LR',
        nodeWidth = 260,
        nodeHeight = 110,
        rankSep = 110,
        nodeSep = 36,
    } = options;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach(n => {
        g.setNode(n.id, {
            width: n.width ?? nodeWidth,
            height: n.height ?? nodeHeight,
        });
    });
    // minlen (via edge.data) afasta o alvo em N ranks — usado para empurrar
    // os casos de teste mais à frente e evitar que as linhas passem por
    // baixo de outros nós.
    edges.forEach(e => {
        const minlen = (e.data as { minlen?: number } | undefined)?.minlen ?? 1;
        g.setEdge(e.source, e.target, { minlen });
    });

    dagre.layout(g);

    return nodes.map(n => {
        const { x, y } = g.node(n.id);
        const w = n.width ?? nodeWidth;
        const h = n.height ?? nodeHeight;
        return {
            ...n,
            // dagre devolve o centro do node; React Flow espera o canto superior-esquerdo
            position: { x: x - w / 2, y: y - h / 2 },
            sourcePosition: direction === 'LR' ? Position.Right  : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left   : Position.Top,
        };
    });
}
