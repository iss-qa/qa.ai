import { supabase } from '@/lib/supabase';
import type { TestStep } from './editor-types';

/**
 * Upsert a test_cases row from the editor's Save dialog. Resolves which row to
 * UPDATE so saving with the same name doesn't multiply rows:
 *   1. testIdParam (the row loaded into the editor) — always wins.
 *   2. Existing row in this project with the same name → update it.
 *   3. Otherwise → insert a new row.
 * Throws on supabase error so the caller can surface it.
 */
export async function saveTestCase(args: {
    trimmedName: string;
    steps: TestStep[];
    selectedEngine: 'uiautomator2' | 'maestro';
    currentProjectId: string | null;
    testAppId: string | null;
    testIdParam: string | null;
}): Promise<void> {
    const { trimmedName, steps, selectedEngine, currentProjectId, testAppId, testIdParam } = args;
    const stepsForDb = steps.map((s, idx) => ({
        id: s.id,
        num: idx + 1,
        action: s.action,
        target: s.target || '',
        value: s.value || '',
        engine: s.engine || selectedEngine,
        maestro_command: s.maestro_command || '',
        confidence: s.confidence || '',
        confidence_comment: s.confidence_comment || '',
    }));
    const baseRow: Record<string, unknown> = {
        name: trimmedName,
        description: `Teste com ${steps.length} passos`,
        steps: stepsForDb,
        tags: [selectedEngine === 'maestro' ? 'maestro' : 'u2'],
        is_active: true,
    };
    if (currentProjectId) baseRow.project_id = currentProjectId;
    // Preserve the appId that was loaded with the test so re-saving
    // (rename, edit, mark green/red after a run) doesn't blank it.
    if (testAppId) baseRow.app_id = testAppId;
    // Editor edits invalidate the cached raw_yaml (which preserves
    // Studio comments/formatting). Clear it so the Studio reopen
    // regenerates a fresh YAML from the new steps[] — otherwise
    // it would still show the pre-edit version.
    baseRow.raw_yaml = null;

    let targetId: string | null = testIdParam || null;
    if (!targetId && currentProjectId) {
        const { data: existing, error: lookupErr } = await supabase
            .from('test_cases')
            .select('id')
            .eq('project_id', currentProjectId)
            .eq('name', trimmedName)
            .order('created_at', { ascending: false })
            .limit(1);
        if (lookupErr) throw lookupErr;
        if (existing && existing.length > 0) targetId = existing[0].id as string;
    }

    if (targetId) {
        const { error } = await supabase
            .from('test_cases')
            .update(baseRow)
            .eq('id', targetId);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('test_cases')
            .insert({ ...baseRow, version: 1 });
        if (error) throw error;
    }
}

/**
 * Persist a Maestro Studio run result:
 *  - test_cases (last_run_at + status) so list views show fresh state
 *  - test_runs (full history row) so the dashboard can compute real
 *    duration / per-day charts / recent runs from execution history
 *    instead of relying on the single "latest" snapshot on test_cases.
 *  - bug_reports (auto-created on failure)
 */
export async function persistRunResult(args: {
    passed: boolean;
    finalSteps: TestStep[];
    testIdParam: string | null;
    currentProjectId: string | null;
    testName: string;
    deviceUdid: string | null;
    runStartedAt: Date;
}): Promise<void> {
    const { passed, finalSteps, testIdParam, currentProjectId, testName, deviceUdid, runStartedAt } = args;
    if (!testIdParam) return;
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - runStartedAt.getTime();
    const stepsTotal = finalSteps.length;
    const stepsPassed = finalSteps.filter(s => s.status === 'success').length;
    const stepsFailed = finalSteps.filter(s => s.status === 'error').length;
    const errorMessage = finalSteps.find(s => s.status === 'error' && s.error_message)?.error_message
        || (passed ? null : 'Test failed');

    try {
        await supabase.from('test_cases').update({
            last_run_at: endedAt.toISOString(),
            status: passed ? 'passed' : 'failed',
        }).eq('id', testIdParam);
    } catch (e) {
        console.error('test_cases update failed:', e);
    }

    let testRunId: string | null = null;
    try {
        const { data, error } = await supabase.from('test_runs').insert({
            test_case_id: testIdParam,
            project_id: currentProjectId || null,
            status: passed ? 'passed' : 'failed',
            started_at: runStartedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            duration_ms: durationMs,
            device_udid: deviceUdid || null,
            error_message: errorMessage,
            steps_total: stepsTotal,
            steps_passed: stepsPassed,
            steps_failed: stepsFailed,
            triggered_by: 'editor',
        }).select('id').single();
        if (error) throw error;
        testRunId = data?.id || null;
    } catch (e) {
        console.error('test_runs insert failed:', e);
    }

    // Auto-create a bug report when the run failed. Severity is picked
    // from how many steps actually failed — a single-step failure is
    // usually a regression on one assertion (medium); multiple failed
    // steps point to a broader breakage (high).
    if (!passed) {
        const failedStep = finalSteps.find(s => s.status === 'error');
        const severity = stepsFailed >= 3 ? 'high' : stepsFailed === 0 ? 'high' : 'medium';
        const stepDesc = failedStep
            ? `Passo ${(finalSteps.indexOf(failedStep) + 1)}: ${failedStep.action} ${failedStep.target || ''}`.trim()
            : 'Sem detalhe do passo';
        try {
            await supabase.from('bug_reports').insert({
                title: `Falha em ${testName || 'teste'} — ${stepDesc.slice(0, 80)}`,
                severity,
                description: [
                    `Captura automática durante execução no editor.`,
                    ``,
                    `**Erro:** ${errorMessage || 'sem mensagem'}`,
                    ``,
                    `**Passos:** ${stepsPassed} ✓ / ${stepsFailed} ✗ / ${stepsTotal} total`,
                    failedStep ? `**Primeiro passo que falhou:** ${stepDesc}` : '',
                ].filter(Boolean).join('\n'),
                project_id: currentProjectId || null,
                test_case_id: testIdParam,
                test_run_id: testRunId,
                status: 'open',
                source: 'automation',
            });
        } catch (e) {
            // bug_reports may not exist yet (migration pending). Don't
            // break the editor — log and move on.
            console.warn('auto bug_report insert failed:', e);
        }
    }
}
