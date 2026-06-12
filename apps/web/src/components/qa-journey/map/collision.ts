// Anti-sobreposição de nós do mapa: quando o usuário solta um card em cima
// de outro, os cards "atropelados" são empurrados suavemente para o lado /
// cima / baixo até não haver mais sobreposição (com cascata limitada).

import type { Node } from 'reactflow';

interface Box {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

function toBox(n: Node): Box {
    return {
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? 220,
        height: n.height ?? 80,
    };
}

// Resolve colisões empurrando os nós NÃO movidos para fora dos movidos.
// `movedIds` (nó arrastado + filhas agrupadas) nunca é deslocado — a posição
// escolhida pelo usuário é soberana. Retorna apenas os nós deslocados.
export function resolveCollisions(
    nodes: Node[],
    movedIds: Set<string>,
    padding = 20,
): Map<string, { x: number; y: number }> {
    const boxes = nodes.map(toBox);
    const displaced = new Map<string, { x: number; y: number }>();

    // Empurradores da rodada: começa pelos nós movidos pelo usuário e
    // cascateia para os que foram deslocados por consequência.
    for (let pass = 0; pass < 8; pass++) {
        let anyMove = false;
        for (const pusher of boxes) {
            const isPusher = movedIds.has(pusher.id) || displaced.has(pusher.id);
            if (!isPusher) continue;
            for (const other of boxes) {
                if (other.id === pusher.id || movedIds.has(other.id)) continue;

                const cxP = pusher.x + pusher.width / 2;
                const cyP = pusher.y + pusher.height / 2;
                const cxO = other.x + other.width / 2;
                const cyO = other.y + other.height / 2;

                const overlapX = (pusher.width + other.width) / 2 + padding - Math.abs(cxP - cxO);
                const overlapY = (pusher.height + other.height) / 2 + padding - Math.abs(cyP - cyO);
                if (overlapX <= 0 || overlapY <= 0) continue;

                // Empurra pelo eixo de menor sobreposição, afastando do pusher.
                if (overlapX < overlapY) {
                    other.x += overlapX * (cxO >= cxP ? 1 : -1);
                } else {
                    other.y += overlapY * (cyO >= cyP ? 1 : -1);
                }
                displaced.set(other.id, { x: other.x, y: other.y });
                anyMove = true;
            }
        }
        if (!anyMove) break;
    }

    return displaced;
}

// Anima nós até as posições-alvo com ease-out (rAF), usando o setter de
// estado do React Flow. Chama onDone ao terminar (para persistir o layout).
export function animateNodesTo(
    setNodes: (updater: (ns: Node[]) => Node[]) => void,
    targets: Map<string, { x: number; y: number }>,
    duration = 240,
    onDone?: () => void,
): void {
    if (targets.size === 0) {
        onDone?.();
        return;
    }
    const starts = new Map<string, { x: number; y: number }>();
    let startTime: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
        if (startTime == null) startTime = now;
        const t = Math.min(1, (now - startTime) / duration);
        const k = ease(t);
        setNodes(ns => ns.map(n => {
            const target = targets.get(n.id);
            if (!target) return n;
            let s = starts.get(n.id);
            if (!s) {
                s = { x: n.position.x, y: n.position.y };
                starts.set(n.id, s);
            }
            return {
                ...n,
                position: {
                    x: s.x + (target.x - s.x) * k,
                    y: s.y + (target.y - s.y) * k,
                },
            };
        }));
        if (t < 1) requestAnimationFrame(step);
        else onDone?.();
    };
    requestAnimationFrame(step);
}

// Descendentes de um nó seguindo as edges (jornada → sub-fluxos → casos).
export function collectDescendants(rootId: string, edges: { source: string; target: string }[]): string[] {
    const children = new Map<string, string[]>();
    for (const e of edges) {
        const list = children.get(e.source);
        if (list) list.push(e.target);
        else children.set(e.source, [e.target]);
    }
    const result: string[] = [];
    const queue = [...(children.get(rootId) ?? [])];
    while (queue.length > 0) {
        const id = queue.shift()!;
        result.push(id);
        queue.push(...(children.get(id) ?? []));
    }
    return result;
}
