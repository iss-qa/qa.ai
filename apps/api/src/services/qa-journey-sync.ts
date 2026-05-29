// Orquestra o sync de uma planilha (linha-a-linha) com upsert nas
// tabelas qa_journeys / qa_journey_subflows / qa_journey_cases.
//
// Estrategia anti-duplicacao:
// - jornadas: chave (project_id, slug)  -> slug derivado do valor "journey"
// - subflows: chave (journey_id, title) -> find-or-create (sem unique)
// - cases:    chave (external_id) dentro do projeto -> cache em memoria por run
//
// Linhas com required ausente sao skipped (gravadas com motivo em log).
// Casos que somem da planilha sao marcados com archived_at (nao deletados).

import { supabase } from '../plugins/supabase';
import { readSheetRows, type GoogleServiceAccountCreds } from './google-sheets';
import { getDecryptedCredentials, resolveDefaultOrgId } from './org-integrations';

// ============================================================
// Tipos espelhando o que o frontend envia
// ============================================================

export type QAJourneyField =
    | 'external_id' | 'journey' | 'subflow' | 'title'
    | 'steps_summary' | 'expected_result'
    | 'priority' | 'automation_status' | 'last_run_status';

const REQUIRED_FIELDS: QAJourneyField[] = ['external_id', 'journey', 'subflow', 'title'];

export type ColumnMap = Partial<Record<QAJourneyField, string | null>>;

export interface SheetDefaults {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    automation_status?: 'automated' | 'partial' | 'manual' | 'none';
    last_run_status?: string;
}

export interface SheetTransforms {
    priority?: Record<string, 'low' | 'medium' | 'high' | 'critical'>;
    automation_status?: Record<string, 'automated' | 'partial' | 'manual' | 'none'>;
}

export interface SheetConfigRow {
    id: string;
    project_id: string;
    spreadsheet_id: string;
    sheet_name: string;
    header_row: number;
    data_start_row: number;
    column_map: ColumnMap;
    defaults: SheetDefaults;
    transforms: SheetTransforms;
    is_active: boolean;
}

export interface SyncResult {
    sync_id: string;
    status: 'success' | 'error';
    rows_imported: number;
    rows_updated: number;
    rows_skipped: number;
    skipped_reasons: { row: number; reason: string }[];
    error_message: string | null;
}

// ============================================================
// Helpers
// ============================================================

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

function applyMapping(
    row: Record<string, string>,
    columnMap: ColumnMap,
    defaults: SheetDefaults,
    transforms: SheetTransforms,
): Record<QAJourneyField, string | null> {
    const result: Record<QAJourneyField, string | null> = {
        external_id: null, journey: null, subflow: null, title: null,
        steps_summary: null, expected_result: null,
        priority: null, automation_status: null, last_run_status: null,
    };
    (Object.keys(result) as QAJourneyField[]).forEach(field => {
        const sheetCol = columnMap[field];
        const raw = sheetCol ? (row[sheetCol] || '').toString().trim() : '';
        if (raw) {
            // Aplicar transform se houver
            const tx = (transforms as Record<string, Record<string, string>>)[field];
            if (tx && tx[raw]) {
                result[field] = tx[raw];
            } else {
                result[field] = raw;
            }
        } else {
            // Fallback nos defaults
            const def = (defaults as Record<string, string | undefined>)[field];
            result[field] = def ?? null;
        }
    });
    return result;
}

function validateRow(mapped: Record<QAJourneyField, string | null>): string | null {
    for (const field of REQUIRED_FIELDS) {
        if (!mapped[field] || !mapped[field]?.trim()) {
            return `Campo obrigatorio "${field}" vazio`;
        }
    }
    return null;
}

// ============================================================
// Loaders + caches por run
// ============================================================

type IdMap = Map<string, string>;

async function loadJourneyMap(projectId: string): Promise<IdMap> {
    const { data, error } = await supabase
        .from('qa_journeys')
        .select('id, slug')
        .eq('project_id', projectId);
    if (error) throw error;
    const m: IdMap = new Map();
    (data || []).forEach(j => m.set(j.slug, j.id));
    return m;
}

async function loadSubflowMap(journeyIds: string[]): Promise<Map<string, string>> {
    if (journeyIds.length === 0) return new Map();
    const { data, error } = await supabase
        .from('qa_journey_subflows')
        .select('id, journey_id, title')
        .in('journey_id', journeyIds);
    if (error) throw error;
    const m = new Map<string, string>();
    (data || []).forEach(s => m.set(`${s.journey_id}::${s.title}`, s.id));
    return m;
}

async function loadCaseMap(projectId: string): Promise<Map<string, { id: string; subflow_id: string }>> {
    // Cases nao tem project_id direto. Query via join logica:
    const { data: subflowsData, error: subErr } = await supabase
        .from('qa_journey_subflows')
        .select('id, journey_id')
        .in('journey_id', (await loadJourneyIds(projectId)));
    if (subErr) throw subErr;
    const subflowIds = (subflowsData || []).map(s => s.id);
    if (subflowIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from('qa_journey_cases')
        .select('id, subflow_id, external_id')
        .in('subflow_id', subflowIds)
        .not('external_id', 'is', null);
    if (error) throw error;
    const m = new Map<string, { id: string; subflow_id: string }>();
    (data || []).forEach(c => {
        if (c.external_id) m.set(c.external_id, { id: c.id, subflow_id: c.subflow_id });
    });
    return m;
}

async function loadJourneyIds(projectId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('qa_journeys')
        .select('id')
        .eq('project_id', projectId);
    if (error) throw error;
    return (data || []).map(j => j.id);
}

// ============================================================
// Find-or-create helpers
// ============================================================

async function findOrCreateJourney(projectId: string, slug: string, title: string, journeyCache: IdMap): Promise<string> {
    const cached = journeyCache.get(slug);
    if (cached) return cached;
    const { data, error } = await supabase
        .from('qa_journeys')
        .upsert({ project_id: projectId, slug, title }, { onConflict: 'project_id,slug' })
        .select('id')
        .single();
    if (error) throw error;
    journeyCache.set(slug, data.id);
    return data.id;
}

async function findOrCreateSubflow(
    journeyId: string,
    title: string,
    automationStatus: string,
    subflowCache: Map<string, string>,
): Promise<string> {
    const key = `${journeyId}::${title}`;
    const cached = subflowCache.get(key);
    if (cached) {
        // Atualiza automation_status mesmo no cache (caso a planilha mude)
        await supabase
            .from('qa_journey_subflows')
            .update({ automation_status: automationStatus })
            .eq('id', cached);
        return cached;
    }
    const { data, error } = await supabase
        .from('qa_journey_subflows')
        .insert({ journey_id: journeyId, title, automation_status: automationStatus })
        .select('id')
        .single();
    if (error) throw error;
    subflowCache.set(key, data.id);
    return data.id;
}

// ============================================================
// Entry point
// ============================================================

export async function runSheetSync(config: SheetConfigRow): Promise<SyncResult> {
    // 1. Criar registro qa_journey_syncs (status=running)
    const syncStart = await supabase
        .from('qa_journey_syncs')
        .insert({
            project_id: config.project_id,
            source: 'google_sheets',
            source_ref: `${config.spreadsheet_id}::${config.sheet_name}`,
            status: 'running',
        })
        .select('id')
        .single();
    if (syncStart.error) throw syncStart.error;
    const syncId = syncStart.data.id as string;

    try {
        // 2. Carregar credenciais Google da org default
        const orgId = await resolveDefaultOrgId();
        const creds = await getDecryptedCredentials<GoogleServiceAccountCreds>(orgId, 'google_sheets');
        if (!creds) throw new Error('Integracao Google Sheets nao configurada em Settings');

        // 3. Ler planilha
        const rows = await readSheetRows(creds, config.spreadsheet_id, config.sheet_name, config.header_row, config.data_start_row);

        // 4. Pre-carregar caches
        const journeyCache = await loadJourneyMap(config.project_id);
        const journeyIds = Array.from(journeyCache.values());
        const subflowCache = await loadSubflowMap(journeyIds);
        const caseCache = await loadCaseMap(config.project_id);

        // 5. Set de external_ids vistos neste sync (para archive de orfaos)
        const seenExternalIds = new Set<string>();

        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const skippedReasons: { row: number; reason: string }[] = [];

        // 6. Processar cada linha
        for (let i = 0; i < rows.length; i++) {
            const rowNum = config.data_start_row + i; // numero real na planilha
            try {
                const mapped = applyMapping(rows[i], config.column_map, config.defaults, config.transforms);
                const err = validateRow(mapped);
                if (err) {
                    skipped++;
                    skippedReasons.push({ row: rowNum, reason: err });
                    continue;
                }
                const externalId = mapped.external_id!;
                seenExternalIds.add(externalId);

                // Resolver jornada
                const journeySlug = toSlug(mapped.journey!);
                if (!journeySlug) {
                    skipped++;
                    skippedReasons.push({ row: rowNum, reason: 'journey vazio apos slugify' });
                    continue;
                }
                const journeyId = await findOrCreateJourney(config.project_id, journeySlug, mapped.journey!, journeyCache);

                // Resolver sub-fluxo
                const automation = (mapped.automation_status || 'manual') as 'automated' | 'partial' | 'manual' | 'none';
                const subflowId = await findOrCreateSubflow(journeyId, mapped.subflow!, automation, subflowCache);

                // Upsert caso
                const existing = caseCache.get(externalId);
                const casePayload = {
                    subflow_id: subflowId,
                    external_id: externalId,
                    title: mapped.title!,
                    steps_summary: mapped.steps_summary,
                    expected_result: mapped.expected_result,
                    priority: (mapped.priority || 'medium') as 'low' | 'medium' | 'high' | 'critical',
                    last_run_status: mapped.last_run_status,
                    archived_at: null,
                };

                if (existing) {
                    const { error } = await supabase
                        .from('qa_journey_cases')
                        .update(casePayload)
                        .eq('id', existing.id);
                    if (error) throw error;
                    updated++;
                } else {
                    const { error } = await supabase
                        .from('qa_journey_cases')
                        .insert(casePayload);
                    if (error) throw error;
                    imported++;
                }
            } catch (e) {
                skipped++;
                skippedReasons.push({
                    row: rowNum,
                    reason: 'erro: ' + (e instanceof Error ? e.message : String(e)),
                });
            }
        }

        // 7. Arquivar casos que sumiram da planilha
        // (so casos NAO vistos E que tinham external_id, dentro deste projeto)
        const allCaseExternalIds = Array.from(caseCache.keys());
        const archiveIds: string[] = [];
        for (const extId of allCaseExternalIds) {
            if (!seenExternalIds.has(extId)) {
                const c = caseCache.get(extId);
                if (c) archiveIds.push(c.id);
            }
        }
        if (archiveIds.length > 0) {
            await supabase
                .from('qa_journey_cases')
                .update({ archived_at: new Date().toISOString() })
                .in('id', archiveIds);
        }

        // 8. Marcar sync como sucesso
        await supabase
            .from('qa_journey_syncs')
            .update({
                status: 'success',
                rows_imported: imported,
                rows_updated: updated,
                rows_skipped: skipped,
                finished_at: new Date().toISOString(),
            })
            .eq('id', syncId);

        // 9. Atualizar last_sync_at do config
        await supabase
            .from('qa_journey_sheet_configs')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', config.id);

        return {
            sync_id: syncId,
            status: 'success',
            rows_imported: imported,
            rows_updated: updated,
            rows_skipped: skipped,
            skipped_reasons: skippedReasons,
            error_message: null,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase
            .from('qa_journey_syncs')
            .update({
                status: 'error',
                error_message: msg.slice(0, 1000),
                finished_at: new Date().toISOString(),
            })
            .eq('id', syncId);
        return {
            sync_id: syncId,
            status: 'error',
            rows_imported: 0,
            rows_updated: 0,
            rows_skipped: 0,
            skipped_reasons: [],
            error_message: msg,
        };
    }
}
