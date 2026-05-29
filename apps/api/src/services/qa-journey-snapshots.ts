// Snapshots semanais de KPIs por projeto (Etapa 9.5).
// Roda via cron domingo 23h. Tambem pode ser disparado on-demand.
//
// Granularidade: 1 row por projeto por dia (a UNIQUE constraint
// (project_id, snapshot_date) garante idempotencia - re-rodar no
// mesmo dia atualiza a row existente).

import { supabase } from '../plugins/supabase';

export interface SnapshotResult {
    project_id: string;
    snapshot_date: string;
    metrics: SnapshotMetrics;
}

export interface SnapshotMetrics {
    total_journeys: number;
    total_subflows: number;
    total_cases: number;
    automated_subflows: number;
    partial_subflows: number;
    manual_subflows: number;
    open_bugs_count: number;
    open_tasks_count: number;
    pass_rate_7d: number | null;
}

/** Computa metricas atuais de um projeto sem persistir. */
export async function computeProjectMetrics(projectId: string): Promise<SnapshotMetrics> {
    // 1. Jornadas
    const { data: journeys, error: jErr } = await supabase
        .from('qa_journeys')
        .select('id')
        .eq('project_id', projectId);
    if (jErr) throw jErr;
    const journeyIds = (journeys || []).map(j => j.id);
    const totalJourneys = journeyIds.length;

    // 2. Sub-fluxos (com automation_status para agregar)
    let subflowIds: string[] = [];
    let automated = 0;
    let partial = 0;
    let manual = 0;
    let totalSubflows = 0;
    if (journeyIds.length > 0) {
        const { data: subs, error: sErr } = await supabase
            .from('qa_journey_subflows')
            .select('id, automation_status')
            .in('journey_id', journeyIds);
        if (sErr) throw sErr;
        const list = subs || [];
        subflowIds = list.map(s => s.id);
        totalSubflows = list.length;
        for (const s of list) {
            if (s.automation_status === 'automated') automated++;
            else if (s.automation_status === 'partial') partial++;
            else if (s.automation_status === 'manual') manual++;
        }
    }

    // 3. Casos ativos (archived_at IS NULL)
    let totalCases = 0;
    if (subflowIds.length > 0) {
        const { count, error: cErr } = await supabase
            .from('qa_journey_cases')
            .select('id', { count: 'exact', head: true })
            .in('subflow_id', subflowIds)
            .is('archived_at', null);
        if (cErr) throw cErr;
        totalCases = count || 0;
    }

    // 4. Jira cache (bugs + tasks abertos)
    let openBugs = 0;
    let openTasks = 0;
    if (subflowIds.length > 0) {
        const { data: jiraCache, error: jcErr } = await supabase
            .from('qa_journey_jira_cache')
            .select('issue_type')
            .in('subflow_id', subflowIds);
        if (jcErr) throw jcErr;
        for (const j of jiraCache || []) {
            const type = (j.issue_type || '').toLowerCase();
            if (type === 'bug') openBugs++;
            else openTasks++;
        }
    }

    // 5. Pass rate 7d - usa test_runs filtrados por projeto + janela 7 dias
    let passRate7d: number | null = null;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const { data: runs, error: rErr } = await supabase
        .from('test_runs')
        .select('status')
        .eq('project_id', projectId)
        .gte('started_at', since.toISOString());
    if (rErr) {
        // Se a tabela test_runs nao tem project_id ou nao existe, ignora
        console.warn('pass_rate_7d skipped:', rErr.message);
    } else if ((runs || []).length > 0) {
        const total = runs!.length;
        const passed = runs!.filter(r => r.status === 'passed').length;
        passRate7d = Math.round((passed / total) * 10000) / 100; // 2 casas decimais
    }

    return {
        total_journeys: totalJourneys,
        total_subflows: totalSubflows,
        total_cases: totalCases,
        automated_subflows: automated,
        partial_subflows: partial,
        manual_subflows: manual,
        open_bugs_count: openBugs,
        open_tasks_count: openTasks,
        pass_rate_7d: passRate7d,
    };
}

/** Persiste snapshot do dia atual (idempotente via UNIQUE). */
export async function captureSnapshot(projectId: string, date?: Date): Promise<SnapshotResult> {
    const d = date ?? new Date();
    const snapshotDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const metrics = await computeProjectMetrics(projectId);
    const { error } = await supabase
        .from('qa_journey_snapshots')
        .upsert({
            project_id: projectId,
            snapshot_date: snapshotDate,
            ...metrics,
        }, { onConflict: 'project_id,snapshot_date' });
    if (error) throw error;
    return { project_id: projectId, snapshot_date: snapshotDate, metrics };
}

/** Snapshot de todos os projetos ativos. Usado pelo cron. */
export async function captureAllSnapshots(): Promise<SnapshotResult[]> {
    const { data, error } = await supabase
        .from('projects')
        .select('id')
        .or('is_archived.is.null,is_archived.eq.false');
    if (error) throw error;
    const results: SnapshotResult[] = [];
    for (const p of data || []) {
        try {
            results.push(await captureSnapshot(p.id));
        } catch (e) {
            console.error(`Falha no snapshot do projeto ${p.id}:`, e instanceof Error ? e.message : e);
        }
    }
    return results;
}
