// Helpers do layout em colunas das Jornadas (modo "cards").
// Árvore de subfluxos (parent_subflow_id) + métricas por jornada/fluxo
// úteis para gestores e techleads (cobertura, automatizados, passando, falhando).

import type { QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

export interface SubflowTreeNode {
    subflow: QAJourneySubflow;
    children: SubflowTreeNode[];
}

/**
 * Monta a árvore de subfluxos de UMA jornada a partir da lista flat.
 * Raízes = parent_subflow_id null/ausente. Subfluxos órfãos (pai fora da
 * lista) são promovidos a raiz para nunca sumirem da tela.
 */
export function buildSubflowTree(subflows: QAJourneySubflow[]): SubflowTreeNode[] {
    const byId = new Map<string, QAJourneySubflow>();
    for (const s of subflows) byId.set(s.id, s);

    const childrenOf = new Map<string, QAJourneySubflow[]>();
    const roots: QAJourneySubflow[] = [];
    for (const s of subflows) {
        const parent = s.parent_subflow_id;
        if (parent && byId.has(parent)) {
            (childrenOf.get(parent) || childrenOf.set(parent, []).get(parent)!).push(s);
        } else {
            roots.push(s);
        }
    }

    const sortFn = (a: QAJourneySubflow, b: QAJourneySubflow) =>
        (a.sequence - b.sequence) || a.created_at.localeCompare(b.created_at);

    const build = (s: QAJourneySubflow): SubflowTreeNode => ({
        subflow: s,
        children: (childrenOf.get(s.id) || []).sort(sortFn).map(build),
    });

    return roots.sort(sortFn).map(build);
}

/** Todos os subfluxos da subárvore (inclui o próprio), p/ contagem agregada. */
export function flattenTree(node: SubflowTreeNode): QAJourneySubflow[] {
    return [node.subflow, ...node.children.flatMap(flattenTree)];
}

/** Ids do subfluxo + todos os descendentes — usado p/ não permitir um
 *  subfluxo virar filho de si mesmo (ciclo) no seletor de pai. */
export function descendantIds(subflows: QAJourneySubflow[], rootId: string): Set<string> {
    const childrenOf = new Map<string, QAJourneySubflow[]>();
    for (const s of subflows) {
        if (s.parent_subflow_id) {
            (childrenOf.get(s.parent_subflow_id) || childrenOf.set(s.parent_subflow_id, []).get(s.parent_subflow_id)!).push(s);
        }
    }
    const out = new Set<string>([rootId]);
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop()!;
        for (const c of childrenOf.get(id) || []) {
            if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); }
        }
    }
    return out;
}

/** Tempo relativo curto ("agora", "há 4min", "há 2h", "há 3d") a partir de ISO. */
export function formatRelativeTime(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const diffMin = Math.round((Date.now() - then) / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}min`;
    const h = Math.round(diffMin / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.round(h / 24)}d`;
}

export interface JourneyMetrics {
    totalCases: number;
    automatedCases: number;   // casos cujo subfluxo TEM teste Maestro vinculado (test_case_id)
    manualCases: number;      // casos cujo subfluxo NÃO tem vínculo Maestro
    coveragePct: number;      // automatedCases / totalCases
    passing: number;          // last_run_status === 'pass'
    failing: number;          // last_run_status === 'fail'
    healthPct: number | null; // passing / (passing+failing); null se sem execuções
}

/**
 * Métricas agregadas de um conjunto de subfluxos (uma jornada inteira ou uma
 * subárvore). "automatizado" é definido no nível do CASO via o status do seu
 * subfluxo (automation_status === 'automated').
 */
export function computeMetrics(
    subflows: QAJourneySubflow[],
    casesBySubflow: Record<string, QAJourneyCase[]>,
): JourneyMetrics {
    let totalCases = 0, automatedCases = 0, manualCases = 0, passing = 0, failing = 0;
    for (const s of subflows) {
        const cases = casesBySubflow[s.id] || [];
        for (const c of cases) {
            totalCases++;
            // Automatizado = CASO com teste Maestro vinculado (test_case_id).
            // Sem vínculo = manual.
            if (c.test_case_id) automatedCases++;
            else manualCases++;
            if (c.last_run_status === 'pass') passing++;
            else if (c.last_run_status === 'fail') failing++;
        }
    }
    const coveragePct = totalCases > 0 ? Math.round((automatedCases / totalCases) * 100) : 0;
    const runs = passing + failing;
    const healthPct = runs > 0 ? Math.round((passing / runs) * 100) : null;
    return { totalCases, automatedCases, manualCases, coveragePct, passing, failing, healthPct };
}
