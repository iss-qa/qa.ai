// Schedulers periodicos do backend Fastify.
// Sao registrados uma vez no boot do server (index.ts).

import cron from 'node-cron';
import { supabase } from '../plugins/supabase';
import { runSheetSync, type SheetConfigRow } from './qa-journey-sync';
import { captureAllSnapshots } from './qa-journey-snapshots';
import { resolveDefaultOrgId, getDecryptedCredentials, type GitHubCredentials } from './org-integrations';
import { dispatchWorkflow } from './github-actions';

const TZ = 'America/Sao_Paulo';

export function registerCronJobs() {
    // 1. Sync diario de planilhas - 7h
    // Roda runSheetSync para cada qa_journey_sheet_config com is_active=true.
    cron.schedule('0 7 * * *', async () => {
        console.log('[cron] sheet-sync diario iniciando...');
        try {
            const { data, error } = await supabase
                .from('qa_journey_sheet_configs')
                .select('*')
                .eq('is_active', true);
            if (error) throw error;
            for (const config of data || []) {
                try {
                    const result = await runSheetSync(config as SheetConfigRow);
                    console.log(`[cron] sheet-sync ${config.id}: ${result.status}, +${result.rows_imported}/~${result.rows_updated}/-${result.rows_skipped}`);
                } catch (e) {
                    console.error(`[cron] sheet-sync ${config.id} falhou:`, e instanceof Error ? e.message : e);
                }
            }
        } catch (e) {
            console.error('[cron] sheet-sync diario falhou:', e instanceof Error ? e.message : e);
        }
    }, { timezone: TZ });

    // 2. Snapshot semanal - domingo 23h
    cron.schedule('0 23 * * 0', async () => {
        console.log('[cron] snapshot semanal iniciando...');
        try {
            const results = await captureAllSnapshots();
            console.log(`[cron] snapshot: ${results.length} projetos processados`);
        } catch (e) {
            console.error('[cron] snapshot semanal falhou:', e instanceof Error ? e.message : e);
        }
    }, { timezone: TZ });

    // 3. Web schedules — checa a cada minuto quais têm next_run_at <= now().
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date().toISOString();
            const { data: schedules } = await supabase
                .from('web_test_schedules')
                .select('id, project_id, specs, branch, name')
                .eq('is_active', true)
                .lte('next_run_at', now);

            if (!schedules?.length) return;

            // Token GitHub (org-level)
            let ghToken: string | null = null;
            try {
                const orgId = await resolveDefaultOrgId();
                const creds = await getDecryptedCredentials<GitHubCredentials>(orgId, 'github');
                ghToken = creds?.token ?? null;
            } catch { /* sem integração GitHub */ }

            for (const sched of schedules) {
                try {
                    const { data: cfg } = await supabase
                        .from('web_test_configs')
                        .select('repo_owner, repo_name, workflow_file, ingest_token_hash')
                        .eq('project_id', sched.project_id)
                        .maybeSingle();

                    if (!cfg || !ghToken) continue;

                    // Cria web_test_run (queued)
                    const specs: string[] = Array.isArray(sched.specs) ? sched.specs : [];
                    const { data: run } = await supabase
                        .from('web_test_runs')
                        .insert({ project_id: sched.project_id, status: 'queued', trigger: 'cron', branch: sched.branch })
                        .select('id')
                        .single();

                    if (run) {
                        const inputs: Record<string, string> = { qamind_run_id: (run as { id: string }).id };
                        if (specs.length === 1) inputs.spec = specs[0];
                        await dispatchWorkflow(ghToken, {
                            owner: cfg.repo_owner as string, repo: cfg.repo_name as string,
                            workflow_file: cfg.workflow_file as string, ref: sched.branch, inputs,
                        });
                    }

                    // Atualiza last_run_at; next_run_at é recalculado pelo front ao salvar.
                    await supabase.from('web_test_schedules').update({ last_run_at: now, next_run_at: null }).eq('id', sched.id);

                    console.log(`[cron] web-schedule ${sched.name} disparado (project ${sched.project_id})`);
                } catch (e) {
                    console.error(`[cron] web-schedule ${sched.id} falhou:`, e instanceof Error ? e.message : e);
                }
            }
        } catch (e) {
            console.error('[cron] web-schedules check falhou:', e instanceof Error ? e.message : e);
        }
    }, { timezone: TZ });

    console.log(`[cron] jobs registrados: sheet-sync (0 7 * * *), snapshot (0 23 * * 0), web-schedules (* * * * *), TZ=${TZ}`);
}
