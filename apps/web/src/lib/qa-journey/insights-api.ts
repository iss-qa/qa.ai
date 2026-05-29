// Fetch + compute helpers para o dashboard executivo (Etapa 9.5).
// Mistura chamadas Supabase direto (leituras) + apps/api Fastify (snapshot trigger).

import { supabase } from '@/lib/supabase';
import type { QAJourney, QAJourneySubflow, QAJourneyCase } from '@/types/qa-journey';
import { QA_JOURNEY_MIGRATION_MISSING_CODE } from '@/types/qa-journey';
import type {
    CoverageGap,
    InsightsAggregate,
    JourneyTreemapDatum,
    QAJourneySnapshot,
} from '@/types/qa-journey-insights';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================
// Snapshot trigger via API
// ============================================================

export async function triggerSnapshot(projectId: string): Promise<void> {
    const u = new URL(`${API_URL}/qa-journey/snapshots/run`);
    u.searchParams.set('projectId', projectId);
    let res: Response;
    try {
        res = await fetch(u.toString(), { method: 'POST' });
    } catch {
        throw new Error(`Backend Fastify offline em ${API_URL}. Suba com: pnpm --filter api dev`);
    }
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const body = await res.json() as { detail?: string; error?: string };
            detail = body.detail || body.error || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
    }
}

// ============================================================
// Snapshots (timeline)
// ============================================================

export async function loadSnapshots(projectId: string, days = 90): Promise<QAJourneySnapshot[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
        .from('qa_journey_snapshots')
        .select('*')
        .eq('project_id', projectId)
        .gte('snapshot_date', since.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: true });
    if (error) {
        if ((error as { code?: string }).code === QA_JOURNEY_MIGRATION_MISSING_CODE) return [];
        console.error('loadSnapshots failed:', error);
        return [];
    }
    return (data || []) as QAJourneySnapshot[];
}

// ============================================================
// Aggregate atual (KPIs)
// ============================================================

export interface InsightsBundle {
    aggregate: InsightsAggregate;
    treemap: JourneyTreemapDatum[];
    gaps: CoverageGap[];
    migrationMissing: boolean;
}

export async function loadProjectInsights(projectId: string): Promise<InsightsBundle> {
    const empty: InsightsAggregate = {
        total_journeys: 0,
        total_subflows: 0,
        total_cases: 0,
        automated_subflows: 0,
        partial_subflows: 0,
        manual_subflows: 0,
        no_coverage_subflows: 0,
        automation_pct: 0,
        open_bugs_count: 0,
        open_tasks_count: 0,
        last_sync_at: null,
    };

    // 1. Jornadas
    const { data: journeys, error: jErr } = await supabase
        .from('qa_journeys')
        .select('*')
        .eq('project_id', projectId);
    if (jErr) {
        if ((jErr as { code?: string }).code === QA_JOURNEY_MIGRATION_MISSING_CODE) {
            return { aggregate: empty, treemap: [], gaps: [], migrationMissing: true };
        }
        console.error('insights journeys load failed:', jErr);
        return { aggregate: empty, treemap: [], gaps: [], migrationMissing: false };
    }
    const journeyList = (journeys || []) as QAJourney[];
    const journeyIds = journeyList.map(j => j.id);

    if (journeyIds.length === 0) {
        return { aggregate: empty, treemap: [], gaps: [], migrationMissing: false };
    }

    // 2. Sub-fluxos
    const { data: subflows } = await supabase
        .from('qa_journey_subflows')
        .select('*')
        .in('journey_id', journeyIds);
    const subflowList = (subflows || []) as QAJourneySubflow[];
    const subflowIds = subflowList.map(s => s.id);

    // 3. Casos ativos
    const { data: cases } = subflowIds.length > 0
        ? await supabase
            .from('qa_journey_cases')
            .select('*')
            .in('subflow_id', subflowIds)
            .is('archived_at', null)
        : { data: [] as QAJourneyCase[] };
    const caseList = (cases || []) as QAJourneyCase[];

    // 4. Jira cache
    const { data: jiraCache } = subflowIds.length > 0
        ? await supabase
            .from('qa_journey_jira_cache')
            .select('issue_type, subflow_id')
            .in('subflow_id', subflowIds)
        : { data: [] as { issue_type: string | null; subflow_id: string }[] };

    let openBugs = 0;
    let openTasks = 0;
    for (const j of jiraCache || []) {
        if ((j.issue_type || '').toLowerCase() === 'bug') openBugs++;
        else openTasks++;
    }

    // 5. Last sync
    const { data: lastSync } = await supabase
        .from('qa_journey_syncs')
        .select('finished_at')
        .eq('project_id', projectId)
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1);
    const lastSyncAt = lastSync && lastSync[0]?.finished_at ? lastSync[0].finished_at as string : null;

    // 6. Agregar
    const automated = subflowList.filter(s => s.automation_status === 'automated').length;
    const partial   = subflowList.filter(s => s.automation_status === 'partial').length;
    const manual    = subflowList.filter(s => s.automation_status === 'manual').length;
    const noCover   = subflowList.filter(s => s.automation_status === 'none').length;
    const automationPct = subflowList.length > 0
        ? Math.round((automated / subflowList.length) * 100)
        : 0;

    const aggregate: InsightsAggregate = {
        total_journeys: journeyList.length,
        total_subflows: subflowList.length,
        total_cases: caseList.length,
        automated_subflows: automated,
        partial_subflows: partial,
        manual_subflows: manual,
        no_coverage_subflows: noCover,
        automation_pct: automationPct,
        open_bugs_count: openBugs,
        open_tasks_count: openTasks,
        last_sync_at: lastSyncAt,
    };

    // 7. Treemap por jornada
    const subflowsByJourney: Record<string, QAJourneySubflow[]> = {};
    for (const s of subflowList) {
        (subflowsByJourney[s.journey_id] ||= []).push(s);
    }
    const casesBySubflow: Record<string, number> = {};
    for (const c of caseList) {
        casesBySubflow[c.subflow_id] = (casesBySubflow[c.subflow_id] || 0) + 1;
    }
    const treemap: JourneyTreemapDatum[] = journeyList.map(j => {
        const subs = subflowsByJourney[j.id] || [];
        const caseCount = subs.reduce((acc, s) => acc + (casesBySubflow[s.id] || 0), 0);
        const auto = subs.filter(s => s.automation_status === 'automated').length;
        return {
            journey_id: j.id,
            title: j.title,
            color: j.color || '#7c3aed',
            case_count: Math.max(caseCount, 1),  // evita treemap com size 0
            automation_pct: subs.length > 0 ? Math.round((auto / subs.length) * 100) : 0,
            subflow_total: subs.length,
            subflow_automated: auto,
        };
    });

    // 8. Gaps - sub-fluxos sem cobertura ou sem test_case
    const gaps: CoverageGap[] = subflowList
        .filter(s => s.automation_status === 'none' || s.automation_status === 'manual' || !s.test_case_id)
        .map(s => {
            const journey = journeyList.find(j => j.id === s.journey_id);
            return {
                subflow_id: s.id,
                journey_id: s.journey_id,
                journey_title: journey?.title || '?',
                subflow_title: s.title,
                automation_status: s.automation_status,
                case_count: casesBySubflow[s.id] || 0,
                has_test_case: Boolean(s.test_case_id),
            };
        })
        // Priorizar 'none' antes de 'manual', e por contagem de casos desc
        .sort((a, b) => {
            const order = { none: 0, manual: 1, partial: 2, automated: 3 } as Record<string, number>;
            const oa = order[a.automation_status] ?? 9;
            const ob = order[b.automation_status] ?? 9;
            if (oa !== ob) return oa - ob;
            return b.case_count - a.case_count;
        });

    return { aggregate, treemap, gaps, migrationMissing: false };
}
