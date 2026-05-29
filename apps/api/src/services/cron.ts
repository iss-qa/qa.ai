// Schedulers periodicos do backend Fastify.
// Sao registrados uma vez no boot do server (index.ts).

import cron from 'node-cron';
import { supabase } from '../plugins/supabase';
import { runSheetSync, type SheetConfigRow } from './qa-journey-sync';
import { captureAllSnapshots } from './qa-journey-snapshots';

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

    console.log(`[cron] jobs registrados: sheet-sync (0 7 * * *), snapshot (0 23 * * 0), TZ=${TZ}`);
}
