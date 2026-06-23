// Parse do report JSON do Playwright (reporter 'json') e mapeamento dos
// resultados de volta para os casos de Jornada (qa_journey_cases) que
// referenciam o spec via playwright_spec. Roda no backend (service_role).

import { supabase } from '../plugins/supabase';

// ---- Subconjunto do schema do reporter 'json' do Playwright ----
interface PwAttachment { name?: string; contentType?: string; path?: string; }
interface PwResult {
    status?: string;            // passed | failed | timedOut | skipped | interrupted
    duration?: number;
    error?: { message?: string };
    errors?: Array<{ message?: string }>;
    attachments?: PwAttachment[];
}
interface PwTest {
    projectName?: string;
    status?: string;            // expected | unexpected | flaky | skipped
    results?: PwResult[];
}
interface PwSpec {
    title?: string;
    file?: string;
    ok?: boolean;
    tests?: PwTest[];
}
interface PwSuite {
    title?: string;
    file?: string;
    specs?: PwSpec[];
    suites?: PwSuite[];
}
export interface PlaywrightReport {
    suites?: PwSuite[];
    stats?: { expected?: number; unexpected?: number; flaky?: number; skipped?: number; duration?: number };
}

export type ResultStatus = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedOut' | 'interrupted';

export interface ParsedResult {
    spec_file: string;
    title: string;
    status: ResultStatus;
    duration_ms: number;
    retries: number;
    error_message: string | null;
    attachments: Array<{ name: string; contentType: string | null; path: string | null }>;
}

export interface ParsedReport {
    results: ParsedResult[];
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    duration_ms: number;
}

// status do teste (expected/unexpected/flaky/skipped) → status normalizado
function normalizeStatus(test: PwTest, last: PwResult | undefined): ResultStatus {
    switch (test.status) {
        case 'expected': return 'passed';
        case 'flaky': return 'flaky';
        case 'skipped': return 'skipped';
        case 'unexpected':
        default: {
            const s = last?.status;
            if (s === 'timedOut') return 'timedOut';
            if (s === 'interrupted') return 'interrupted';
            if (s === 'skipped') return 'skipped';
            return 'failed';
        }
    }
}

function collectErrors(last: PwResult | undefined): string | null {
    if (!last) return null;
    const msgs: string[] = [];
    if (last.error?.message) msgs.push(last.error.message);
    for (const e of last.errors || []) if (e.message) msgs.push(e.message);
    return msgs.length ? msgs.join('\n').slice(0, 4000) : null;
}

/** Achata a árvore de suites/specs/tests em linhas (uma por teste×projeto). */
export function parsePlaywrightJson(report: PlaywrightReport): ParsedReport {
    const out: ParsedResult[] = [];

    const walk = (suite: PwSuite, parentTitles: string[]) => {
        const titlePath = suite.title ? [...parentTitles, suite.title] : parentTitles;
        for (const spec of suite.specs || []) {
            const specFile = spec.file || suite.file || titlePath[0] || '';
            for (const test of spec.tests || []) {
                const results = test.results || [];
                const last = results[results.length - 1];
                const titleParts = [...titlePath, spec.title || '', test.projectName || ''].filter(Boolean);
                out.push({
                    spec_file: specFile,
                    title: titleParts.join(' › '),
                    status: normalizeStatus(test, last),
                    duration_ms: Math.round(last?.duration || 0),
                    retries: Math.max(0, results.length - 1),
                    error_message: collectErrors(last),
                    attachments: (last?.attachments || []).map((a) => ({
                        name: a.name || 'attachment',
                        contentType: a.contentType || null,
                        path: a.path || null,
                    })),
                });
            }
        }
        for (const child of suite.suites || []) walk(child, titlePath);
    };

    for (const suite of report.suites || []) walk(suite, []);

    const passed = out.filter((r) => r.status === 'passed').length;
    const failed = out.filter((r) => r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted').length;
    const skipped = out.filter((r) => r.status === 'skipped').length;
    const flaky = out.filter((r) => r.status === 'flaky').length;
    const duration_ms = report.stats?.duration ?? out.reduce((s, r) => s + r.duration_ms, 0);

    return { results: out, total: out.length, passed, failed, skipped, flaky, duration_ms: Math.round(duration_ms) };
}

// status de resultado → last_run_status do caso de Jornada ('pass'|'fail'|'skipped')
function caseStatus(s: ResultStatus): 'pass' | 'fail' | 'skipped' {
    if (s === 'passed' || s === 'flaky') return 'pass';
    if (s === 'skipped') return 'skipped';
    return 'fail';
}

/**
 * Casa cada resultado com um qa_journey_case (automation_engine='playwright')
 * cujo playwright_spec bate com o spec_file (igual ou sufixo), e atualiza
 * last_run_status/last_run_at. Retorna mapa specPath→caseId para gravar o
 * qa_journey_case_id em web_test_results.
 */
export async function mapResultsToJourneyCases(
    projectId: string,
    results: ParsedResult[],
    runAtIso: string,
): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    // Casos Playwright do projeto (via subflow → journey → project).
    const { data: journeys } = await supabase
        .from('qa_journeys')
        .select('id')
        .eq('project_id', projectId);
    const journeyIds = (journeys || []).map((j) => j.id as string);
    if (!journeyIds.length) return map;

    const { data: subflows } = await supabase
        .from('qa_journey_subflows')
        .select('id')
        .in('journey_id', journeyIds);
    const subflowIds = (subflows || []).map((s) => s.id as string);
    if (!subflowIds.length) return map;

    const { data: cases } = await supabase
        .from('qa_journey_cases')
        .select('id, playwright_spec, automation_engine')
        .in('subflow_id', subflowIds)
        .eq('automation_engine', 'playwright');

    const specToCase = new Map<string, string>();
    for (const c of cases || []) {
        const spec = (c.playwright_spec as string | null)?.trim();
        if (spec) specToCase.set(spec, c.id as string);
    }
    if (!specToCase.size) return map;

    // Para cada spec_file dos resultados, encontra o caso (match exato ou sufixo)
    // e calcula o pior status entre os testes daquele spec.
    const bySpec = new Map<string, ParsedResult[]>();
    for (const r of results) {
        const arr = bySpec.get(r.spec_file) || [];
        arr.push(r);
        bySpec.set(r.spec_file, arr);
    }

    for (const [specFile, rs] of bySpec) {
        let caseId: string | undefined;
        for (const [spec, id] of specToCase) {
            if (specFile === spec || specFile.endsWith(spec) || spec.endsWith(specFile)) { caseId = id; break; }
        }
        if (!caseId) continue;
        map.set(specFile, caseId);

        // pior status manda: fail > skipped > pass
        const statuses = rs.map((r) => caseStatus(r.status));
        const worst = statuses.includes('fail') ? 'fail' : statuses.includes('skipped') ? 'skipped' : 'pass';
        await supabase
            .from('qa_journey_cases')
            .update({ last_run_status: worst, last_run_at: runAtIso })
            .eq('id', caseId);
    }

    return map;
}
