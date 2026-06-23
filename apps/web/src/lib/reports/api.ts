// Camada de dados da página de Relatórios: consulta Supabase direto e
// devolve agregados prontos para os cards/gráficos. Sem lógica de UI aqui.

import { supabase } from '@/lib/supabase';
import { loadProjectInsights } from '@/lib/qa-journey/insights-api';
import type { InsightsAggregate } from '@/types/qa-journey-insights';

export type ReportPeriodDays = 7 | 15 | 30 | 90;

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
    test_case_id: string | null;
    test_name: string;
    platform: string | null;     // 'mobile' | 'web' | ...
    folder: string | null;       // folder_path — usado como "fluxo"
}

// Agregado por caso de teste no período — base das frases descritivas.
export interface FailingTestAgg {
    testCaseId: string | null;
    name: string;
    platform: string | null;
    flow: string | null;         // fluxo (pasta) — ex.: "Cadastro", "KYC"
    runs: number;                // execuções concluídas (pass + fail)
    failed: number;
    passed: number;
    failRate: number;            // 0-100 sobre execuções concluídas
    lastFailureAt: string | null;
    topError: string | null;     // mensagem de erro mais recorrente
}

// Agregado por fluxo (pasta) + plataforma — ranking de cenários problemáticos.
export interface FlowFailureAgg {
    flow: string;                // rótulo do fluxo ("Cadastro", "Sem fluxo")
    platform: string | null;
    runs: number;                // execuções concluídas
    failed: number;
    failRate: number;            // 0-100
    failingTests: number;        // casos distintos com ao menos 1 falha
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
    // Cenários problemáticos (base das frases descritivas)
    topFailingTests: FailingTestAgg[];
    failuresByFlow: FlowFailureAgg[];
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

    // Tenta com platform/folder_path (migrations 009/018); cai para o conjunto
    // antigo se as colunas ainda não existirem, sem zerar o relatório.
    const runsQuery = (caseColumns: string) =>
        supabase
            .from('test_runs')
            .select(`id, status, started_at, duration_ms, steps_total, steps_failed, triggered_by, error_message, test_case_id, test_cases:test_case_id ( ${caseColumns} )`)
            .eq('project_id', projectId)
            .gte('started_at', sinceIso)
            .order('started_at', { ascending: false })
            .limit(1000);

    const [runsRes, bugsRes, casesRes, insights] = await Promise.all([
        (async () => {
            const full = await runsQuery('name, platform, folder_path');
            if (!full.error) return full;
            return runsQuery('name');
        })(),
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

    type RunRow = Omit<ReportRun, 'test_name' | 'platform' | 'folder'> & {
        test_cases: { name: string; platform?: string | null; folder_path?: string | null } | null;
    };
    const runs: ReportRun[] = ((runsRes.data || []) as unknown as RunRow[]).map(r => ({
        id: r.id,
        status: r.status,
        started_at: r.started_at,
        duration_ms: r.duration_ms,
        steps_total: r.steps_total,
        steps_failed: r.steps_failed,
        triggered_by: r.triggered_by,
        error_message: r.error_message,
        test_case_id: r.test_case_id ?? null,
        test_name: r.test_cases?.name || '(teste removido)',
        platform: r.test_cases?.platform ?? null,
        folder: r.test_cases?.folder_path ?? null,
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

    // --- Cenários problemáticos: agrega por caso e por fluxo ---
    const { topFailingTests, failuresByFlow } = aggregateFailures(runs);

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
        topFailingTests,
        failuresByFlow,
        openBugs,
        resolvedInPeriod,
        bugsBySeverity,
        recentBugs: bugs.filter(b => openStatuses.has(b.status)).slice(0, 8),
        totalTestCases: cases.length,
        activeTestCases: cases.filter(c => c.is_active !== false).length,
        journeys: insights.aggregate,
    };
}

// Deriva o rótulo do "fluxo" a partir do folder_path (ex.: "Cadastro/Mobile" → "Cadastro").
// Sem pasta, tenta inferir o macro-fluxo por palavras-chave no nome do teste.
export function flowLabel(folder: string | null, testName?: string): string {
    if (folder && folder.trim()) {
        const top = folder.split('/').map(s => s.trim()).filter(Boolean)[0];
        if (top) return top;
    }
    const n = (testName || '').toLowerCase();
    const keywords: [RegExp, string][] = [
        [/\bkyc\b/, 'KYC'],
        [/onboard/, 'Onboarding'],
        [/cadastr|sign[\s-]?up|registr/, 'Cadastro'],
        [/(envio|upload).*(doc|documento)|doc(umento)?s?\b/, 'Envio de documentos'],
        [/login|autenticad?|sign[\s-]?in/, 'Login'],
        [/dep(o|ó)sit|saque|withdraw|transfer|pix/, 'Financeiro'],
        [/trade|ordem|order|book|matching/, 'Trading'],
    ];
    for (const [re, label] of keywords) if (re.test(n)) return label;
    return 'Sem fluxo';
}

const PLATFORM_LABELS: Record<string, string> = { mobile: 'Mobile', web: 'Web', android: 'Android', ios: 'iOS' };
export function platformLabel(platform: string | null): string | null {
    if (!platform) return null;
    return PLATFORM_LABELS[platform.toLowerCase()] || platform;
}

function aggregateFailures(runs: ReportRun[]): { topFailingTests: FailingTestAgg[]; failuresByFlow: FlowFailureAgg[] } {
    // Por caso de teste (agrupa pelo id; cai para o nome quando o caso foi removido).
    const byTest = new Map<string, {
        name: string; platform: string | null; folder: string | null;
        passed: number; failed: number; lastFailureAt: string | null; errors: Map<string, number>;
    }>();
    for (const r of runs) {
        if (r.status !== 'passed' && r.status !== 'failed') continue;
        const key = r.test_case_id || `name:${r.test_name}`;
        let acc = byTest.get(key);
        if (!acc) {
            acc = { name: r.test_name, platform: r.platform, folder: r.folder, passed: 0, failed: 0, lastFailureAt: null, errors: new Map() };
            byTest.set(key, acc);
        }
        if (r.status === 'passed') acc.passed++;
        else {
            acc.failed++;
            if (!acc.lastFailureAt || r.started_at > acc.lastFailureAt) acc.lastFailureAt = r.started_at;
            const err = (r.error_message || '').trim().slice(0, 160);
            if (err) acc.errors.set(err, (acc.errors.get(err) || 0) + 1);
        }
    }

    const topFailingTests: FailingTestAgg[] = Array.from(byTest.entries())
        .map(([key, a]) => {
            const total = a.passed + a.failed;
            const topError = Array.from(a.errors.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
            return {
                testCaseId: key.startsWith('name:') ? null : key,
                name: a.name,
                platform: a.platform,
                flow: flowLabel(a.folder, a.name),
                runs: total,
                failed: a.failed,
                passed: a.passed,
                failRate: total > 0 ? Math.round((a.failed / total) * 100) : 0,
                lastFailureAt: a.lastFailureAt,
                topError,
            };
        })
        .filter(t => t.failed > 0)
        .sort((x, y) => y.failed - x.failed || y.failRate - x.failRate)
        .slice(0, 12);

    // Por fluxo + plataforma.
    const byFlow = new Map<string, { flow: string; platform: string | null; passed: number; failed: number; tests: Set<string> }>();
    for (const r of runs) {
        if (r.status !== 'passed' && r.status !== 'failed') continue;
        const flow = flowLabel(r.folder, r.test_name);
        const key = `${flow}::${r.platform || ''}`;
        let acc = byFlow.get(key);
        if (!acc) {
            acc = { flow, platform: r.platform, passed: 0, failed: 0, tests: new Set() };
            byFlow.set(key, acc);
        }
        if (r.status === 'passed') acc.passed++;
        else {
            acc.failed++;
            acc.tests.add(r.test_case_id || `name:${r.test_name}`);
        }
    }
    const failuresByFlow: FlowFailureAgg[] = Array.from(byFlow.values())
        .map(a => {
            const total = a.passed + a.failed;
            return {
                flow: a.flow,
                platform: a.platform,
                runs: total,
                failed: a.failed,
                failRate: total > 0 ? Math.round((a.failed / total) * 100) : 0,
                failingTests: a.tests.size,
            };
        })
        .filter(f => f.failed > 0)
        .sort((x, y) => y.failed - x.failed || y.failRate - x.failRate)
        .slice(0, 8);

    return { topFailingTests, failuresByFlow };
}

export function formatDurationMs(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}
