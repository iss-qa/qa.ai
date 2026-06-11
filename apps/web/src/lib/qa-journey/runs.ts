// Carrega histórico de execução + evidências para o detalhe de um caso da Jornada.
//
// IMPORTANTE — limitação de modelo de dados (ver CLAUDE.md / schema):
//  - `qa_journey_cases` (vindos de planilha) NÃO têm vínculo direto com uma
//    execução real. Só o SUB-FLUXO tem `test_case_id` → teste Maestro.
//  - `run_steps.screenshot_url` (1 print por passo) usa um `run_id` gerado pelo
//    daemon, que NÃO é igual a `test_runs.id`. Logo, não há como joinar prints
//    de passo a um run de forma confiável.
//  - O que É joinável: `test_runs` (por `test_case_id`) e `bug_reports`
//    (por `test_run_id`), que carregam screenshot/PDF/Jira por run com falha.
//
// Portanto a evidência exibida é a do SUB-FLUXO: histórico de runs do teste
// Maestro vinculado + anexos dos bug_reports daqueles runs.

import { supabase } from '@/lib/supabase';
import { QA_JOURNEY_MIGRATION_MISSING_CODE } from '@/types/qa-journey';

export interface SubflowTestRun {
    id: string;
    status: 'passed' | 'failed' | 'running' | 'cancelled';
    started_at: string;
    ended_at: string | null;
    duration_ms: number | null;
    steps_total: number | null;
    steps_passed: number | null;
    steps_failed: number | null;
    error_message: string | null;
    device_udid: string | null;
    triggered_by: string | null;
}

export interface RunEvidence {
    id: string;
    test_run_id: string | null;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    screenshot_url: string | null;
    pdf_url: string | null;
    jira_url: string | null;
    created_at: string;
}

export interface SubflowRunsResult {
    runs: SubflowTestRun[];
    /** bug_reports agrupados por test_run_id (evidências por run). */
    evidenceByRun: Record<string, RunEvidence[]>;
    /** true quando as tabelas test_runs/bug_reports ainda não existem. */
    migrationMissing: boolean;
}

const EMPTY: SubflowRunsResult = { runs: [], evidenceByRun: {}, migrationMissing: false };

function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === QA_JOURNEY_MIGRATION_MISSING_CODE;
}

/**
 * Histórico de execução (até `limit` runs mais recentes) do teste Maestro
 * vinculado ao sub-fluxo, junto das evidências (bug_reports) de cada run.
 */
export async function loadSubflowRuns(testCaseId: string | null, limit = 10): Promise<SubflowRunsResult> {
    if (!testCaseId) return EMPTY;

    const runsRes = await supabase
        .from('test_runs')
        .select('id,status,started_at,ended_at,duration_ms,steps_total,steps_passed,steps_failed,error_message,device_udid,triggered_by')
        .eq('test_case_id', testCaseId)
        .order('started_at', { ascending: false })
        .limit(limit);

    if (runsRes.error) {
        if (isMissingTable(runsRes.error as { code?: string })) {
            return { ...EMPTY, migrationMissing: true };
        }
        console.error('test_runs load failed:', runsRes.error);
        return EMPTY;
    }

    const runs = (runsRes.data || []) as SubflowTestRun[];
    if (runs.length === 0) return { runs, evidenceByRun: {}, migrationMissing: false };

    const runIds = runs.map(r => r.id);
    const evidenceByRun: Record<string, RunEvidence[]> = {};

    const bugsRes = await supabase
        .from('bug_reports')
        .select('id,test_run_id,title,severity,screenshot_url,pdf_url,jira_url,created_at')
        .in('test_run_id', runIds)
        .order('created_at', { ascending: false });

    if (bugsRes.error) {
        // bug_reports ausente não é fatal: ainda mostramos o histórico de runs.
        if (!isMissingTable(bugsRes.error as { code?: string })) {
            console.error('bug_reports load failed:', bugsRes.error);
        }
        return { runs, evidenceByRun, migrationMissing: false };
    }

    for (const b of (bugsRes.data || []) as RunEvidence[]) {
        if (!b.test_run_id) continue;
        (evidenceByRun[b.test_run_id] ||= []).push(b);
    }

    return { runs, evidenceByRun, migrationMissing: false };
}
