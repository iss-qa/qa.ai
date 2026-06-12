// Camada de dados da página de Relatórios: consulta Supabase direto e
// devolve agregados prontos para os cards/gráficos. Sem lógica de UI aqui.

import { supabase } from '@/lib/supabase';
import { loadProjectInsights } from '@/lib/qa-journey/insights-api';
import type { InsightsAggregate } from '@/types/qa-journey-insights';

export type ReportPeriodDays = 7 | 30 | 90;

export type RunStatus = 'passed' | 'failed' | 'running' | 'cancelled';
export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BugStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

export interface ReportRun {
    id: string;
    status: RunStatus;
    started_at: string;
    duration_ms: number | null;
    steps_total: number | null;
    steps_failed: number | null;
    triggered_by: string | null;
    error_message: string | null;
    test_name: string;
}

export interface ReportBug {
    id: string;
    severity: BugSeverity;
    status: BugStatus;
    title: string;
    created_at: string;
    resolved_at: string | null;
    jira_url: string | null;
}

export interface RunsTrendPoint {
    day: string;        // dd/mm
    passed: number;
    failed: number;
}

export interface ProjectReport {
    // Execuções (período)
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number | null;        // 0-100, null sem runs concluídas
    avgDurationMs: number | null;
    trend: RunsTrendPoint[];
    byTrigger: { name: string; count: number }[];
    recentFailures: ReportRun[];
    // Qualidade
    openBugs: number;
    resolvedInPeriod: number;
    bugsBySeverity: Record<BugSeverity, number>;
    recentBugs: ReportBug[];
    // Inventário
    totalTestCases: number;
    activeTestCases: number;
    // Jornadas (cobertura + execução manual)
    journeys: InsightsAggregate;
}

export async function loadProjectReport(projectId: string, days: ReportPeriodDays): Promise<ProjectReport> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();

    const [runsRes, bugsRes, casesRes, insights] = await Promise.all([
        supabase
            .from('test_runs')
            .select('id, status, started_at, duration_ms, steps_total, steps_failed, triggered_by, error_message, test_cases:test_case_id ( name )')
            .eq('project_id', projectId)
            .gte('started_at', sinceIso)
            .order('started_at', { ascending: false })
            .limit(1000),
        supabase
            .from('bug_reports')
            .select('id, severity, status, title, created_at, resolved_at, jira_url')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1000),
        supabase
            .from('test_cases')
            .select('id, is_active')
            .eq('project_id', projectId),
        loadProjectInsights(projectId),
    ]);

    if (runsRes.error) console.error('report runs failed:', runsRes.error);
    if (bugsRes.error) console.error('report bugs failed:', bugsRes.error);
    if (casesRes.error) console.error('report cases failed:', casesRes.error);

    type RunRow = Omit<ReportRun, 'test_name'> & { test_cases: { name: string } | null };
    const runs: ReportRun[] = ((runsRes.data || []) as unknown as RunRow[]).map(r => ({
        id: r.id,
        status: r.status,
        started_at: r.started_at,
        duration_ms: r.duration_ms,
        steps_total: r.steps_total,
        steps_failed: r.steps_failed,
        triggered_by: r.triggered_by,
        error_message: r.error_message,
        test_name: r.test_cases?.name || '(teste removido)',
    }));

    const bugs = (bugsRes.data || []) as ReportBug[];
    const cases = (casesRes.data || []) as { id: string; is_active: boolean | null }[];

    // --- Execuções ---
    const passed = runs.filter(r => r.status === 'passed').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const finished = passed + failed;
    const durations = runs.filter(r => r.duration_ms != null && r.status !== 'running').map(r => r.duration_ms as number);

    // Trend por dia (preenche dias vazios para o gráfico não "pular" datas)
    const buckets = new Map<string, { passed: number; failed: number }>();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), { passed: 0, failed: 0 });
    }
    for (const r of runs) {
        const key = r.started_at.slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        if (r.status === 'passed') b.passed++;
        else if (r.status === 'failed') b.failed++;
    }
    const trend: RunsTrendPoint[] = Array.from(buckets.entries()).map(([iso, v]) => ({
        day: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
        ...v,
    }));

    const triggerCount = new Map<string, number>();
    for (const r of runs) {
        const key = r.triggered_by || 'desconhecido';
        triggerCount.set(key, (triggerCount.get(key) || 0) + 1);
    }
    const byTrigger = Array.from(triggerCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // --- Qualidade ---
    const openStatuses = new Set<BugStatus>(['open', 'in_progress']);
    const bugsBySeverity: Record<BugSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    let openBugs = 0;
    let resolvedInPeriod = 0;
    for (const b of bugs) {
        if (openStatuses.has(b.status)) {
            openBugs++;
            if (b.severity in bugsBySeverity) bugsBySeverity[b.severity]++;
        }
        if (b.status === 'resolved' && b.resolved_at && b.resolved_at >= sinceIso) resolvedInPeriod++;
    }

    return {
        totalRuns: runs.length,
        passedRuns: passed,
        failedRuns: failed,
        passRate: finished > 0 ? Math.round((passed / finished) * 100) : null,
        avgDurationMs: durations.length > 0
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : null,
        trend,
        byTrigger,
        recentFailures: runs.filter(r => r.status === 'failed').slice(0, 8),
        openBugs,
        resolvedInPeriod,
        bugsBySeverity,
        recentBugs: bugs.filter(b => openStatuses.has(b.status)).slice(0, 8),
        totalTestCases: cases.length,
        activeTestCases: cases.filter(c => c.is_active !== false).length,
        journeys: insights.aggregate,
    };
}

export function formatDurationMs(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}
