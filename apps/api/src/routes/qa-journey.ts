// Rotas de sync da Jornada do QA (Google Sheets).
// As credenciais Google sao carregadas de org_integrations - nada de env.

import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../plugins/supabase';
import { listSheetTabs, previewSheet, type GoogleServiceAccountCreds } from '../services/google-sheets';
import { getDecryptedCredentials, resolveDefaultOrgId } from '../services/org-integrations';
import { runSheetSync, type SheetConfigRow } from '../services/qa-journey-sync';
import { captureSnapshot, captureAllSnapshots } from '../services/qa-journey-snapshots';

const qaJourneyRoutes: FastifyPluginAsync = async (fastify) => {

    // Helper: carrega creds do Google da org default
    async function getGoogleCreds(): Promise<GoogleServiceAccountCreds> {
        const orgId = await resolveDefaultOrgId();
        const creds = await getDecryptedCredentials<GoogleServiceAccountCreds>(orgId, 'google_sheets');
        if (!creds) {
            throw Object.assign(new Error('Integracao Google Sheets nao configurada em /dashboard/settings/integrations'), { statusCode: 412 });
        }
        return creds;
    }

    // ============================================================
    // Wizard helpers (sem persistir)
    // ============================================================

    // GET /qa-journey/sheet-tabs?spreadsheetId=...
    fastify.get<{ Querystring: { spreadsheetId?: string } }>(
        '/qa-journey/sheet-tabs',
        async (request, reply) => {
            const spreadsheetId = (request.query.spreadsheetId || '').trim();
            if (!spreadsheetId) return reply.status(400).send({ error: 'spreadsheetId obrigatorio' });
            try {
                const creds = await getGoogleCreds();
                const tabs = await listSheetTabs(creds, spreadsheetId);
                return { tabs };
            } catch (e) {
                return handleError(reply, e);
            }
        },
    );

    // GET /qa-journey/sheet-preview?spreadsheetId=...&sheetName=...&headerRow=1&sampleRows=10
    fastify.get<{ Querystring: { spreadsheetId?: string; sheetName?: string; headerRow?: string; sampleRows?: string } }>(
        '/qa-journey/sheet-preview',
        async (request, reply) => {
            const { spreadsheetId, sheetName } = request.query;
            const headerRow = Number(request.query.headerRow || '1') || 1;
            // Cap alto o suficiente para a importação de casos (modal lê a aba inteira).
            const sampleRows = Math.min(Number(request.query.sampleRows || '10') || 10, 1000);
            if (!spreadsheetId || !sheetName) {
                return reply.status(400).send({ error: 'spreadsheetId e sheetName obrigatorios' });
            }
            try {
                const creds = await getGoogleCreds();
                const preview = await previewSheet(creds, spreadsheetId, sheetName, headerRow, sampleRows);
                return preview;
            } catch (e) {
                return handleError(reply, e);
            }
        },
    );

    // ============================================================
    // Sheet configs CRUD
    // ============================================================

    // GET /qa-journey/sheet-configs?projectId=...
    fastify.get<{ Querystring: { projectId?: string } }>(
        '/qa-journey/sheet-configs',
        async (request, reply) => {
            const projectId = (request.query.projectId || '').trim();
            if (!projectId) return reply.status(400).send({ error: 'projectId obrigatorio' });
            const { data, error } = await supabase
                .from('qa_journey_sheet_configs')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });
            if (error) return handleError(reply, error);
            return { configs: data || [] };
        },
    );

    // POST /qa-journey/sheet-configs (upsert por unique constraint)
    fastify.post('/qa-journey/sheet-configs', async (request, reply) => {
        const body = request.body as Partial<SheetConfigRow>;
        if (!body?.project_id || !body.spreadsheet_id || !body.sheet_name) {
            return reply.status(400).send({ error: 'project_id, spreadsheet_id, sheet_name obrigatorios' });
        }
        const payload = {
            project_id: body.project_id,
            spreadsheet_id: body.spreadsheet_id,
            sheet_name: body.sheet_name,
            header_row: body.header_row ?? 1,
            data_start_row: body.data_start_row ?? 2,
            column_map: body.column_map ?? {},
            defaults: body.defaults ?? {},
            transforms: body.transforms ?? {},
            is_active: body.is_active ?? true,
        };
        const { data, error } = await supabase
            .from('qa_journey_sheet_configs')
            .upsert(payload, { onConflict: 'project_id,spreadsheet_id,sheet_name' })
            .select('*')
            .single();
        if (error) return handleError(reply, error);
        return { config: data };
    });

    // PATCH /qa-journey/sheet-configs/:id
    fastify.patch<{ Params: { id: string } }>(
        '/qa-journey/sheet-configs/:id',
        async (request, reply) => {
            const body = request.body as Partial<SheetConfigRow>;
            const updates: Record<string, unknown> = {};
            if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
            if (body.column_map) updates.column_map = body.column_map;
            if (body.defaults) updates.defaults = body.defaults;
            if (body.transforms) updates.transforms = body.transforms;
            if (typeof body.header_row === 'number') updates.header_row = body.header_row;
            if (typeof body.data_start_row === 'number') updates.data_start_row = body.data_start_row;
            if (Object.keys(updates).length === 0) {
                return reply.status(400).send({ error: 'nada para atualizar' });
            }
            const { data, error } = await supabase
                .from('qa_journey_sheet_configs')
                .update(updates)
                .eq('id', request.params.id)
                .select('*')
                .single();
            if (error) return handleError(reply, error);
            return { config: data };
        },
    );

    // DELETE /qa-journey/sheet-configs/:id
    fastify.delete<{ Params: { id: string } }>(
        '/qa-journey/sheet-configs/:id',
        async (request, reply) => {
            const { error } = await supabase
                .from('qa_journey_sheet_configs')
                .delete()
                .eq('id', request.params.id);
            if (error) return handleError(reply, error);
            return { ok: true };
        },
    );

    // ============================================================
    // Sync execution + history
    // ============================================================

    // POST /qa-journey/sync/:configId
    fastify.post<{ Params: { configId: string } }>(
        '/qa-journey/sync/:configId',
        async (request, reply) => {
            const { data: config, error } = await supabase
                .from('qa_journey_sheet_configs')
                .select('*')
                .eq('id', request.params.configId)
                .maybeSingle();
            if (error) return handleError(reply, error);
            if (!config) return reply.status(404).send({ error: 'config nao encontrado' });
            try {
                const result = await runSheetSync(config as SheetConfigRow);
                return result;
            } catch (e) {
                return handleError(reply, e);
            }
        },
    );

    // GET /qa-journey/syncs?projectId=...&limit=50
    fastify.get<{ Querystring: { projectId?: string; limit?: string } }>(
        '/qa-journey/syncs',
        async (request, reply) => {
            const projectId = (request.query.projectId || '').trim();
            if (!projectId) return reply.status(400).send({ error: 'projectId obrigatorio' });
            const limit = Math.min(Number(request.query.limit || '50') || 50, 200);
            const { data, error } = await supabase
                .from('qa_journey_syncs')
                .select('*')
                .eq('project_id', projectId)
                .order('started_at', { ascending: false })
                .limit(limit);
            if (error) return handleError(reply, error);
            return { syncs: data || [] };
        },
    );

    // ============================================================
    // Tree — arvore completa para consumo de outros sistemas (Parte 10+)
    // ============================================================

    // GET /qa-journey/tree/:projectId
    // Retorna a estrutura aninhada jornadas[].subflows[].cases[]
    // + qa cache de Jira por sub-fluxo. Contrato estavel para
    // integracoes externas (IA, exports, etc).
    fastify.get<{ Params: { projectId: string }; Querystring: { publishedOnly?: string } }>(
        '/qa-journey/tree/:projectId',
        async (request, reply) => {
            const { projectId } = request.params;
            const publishedOnly = (request.query.publishedOnly || '').toLowerCase() === 'true';
            try {
                // 1. Jornadas
                let query = supabase
                    .from('qa_journeys')
                    .select('*')
                    .eq('project_id', projectId)
                    .order('sequence', { ascending: true })
                    .order('created_at', { ascending: true });
                if (publishedOnly) query = query.eq('is_published', true);
                const { data: journeys, error: jErr } = await query;
                if (jErr) return handleError(reply, jErr);

                const journeyIds = (journeys || []).map(j => j.id);
                if (journeyIds.length === 0) {
                    return { project_id: projectId, journeys: [] };
                }

                // 2. Subflows
                const { data: subflows, error: sErr } = await supabase
                    .from('qa_journey_subflows')
                    .select('*')
                    .in('journey_id', journeyIds)
                    .order('sequence', { ascending: true })
                    .order('created_at', { ascending: true });
                if (sErr) return handleError(reply, sErr);
                const subflowIds = (subflows || []).map(s => s.id);

                // 3. Casos ativos (archived_at IS NULL)
                let cases: unknown[] = [];
                let jiraCache: unknown[] = [];
                if (subflowIds.length > 0) {
                    const [casesRes, jiraRes] = await Promise.all([
                        supabase
                            .from('qa_journey_cases')
                            .select('*')
                            .in('subflow_id', subflowIds)
                            .is('archived_at', null)
                            .order('created_at', { ascending: true }),
                        supabase
                            .from('qa_journey_jira_cache')
                            .select('*')
                            .in('subflow_id', subflowIds),
                    ]);
                    if (casesRes.error) return handleError(reply, casesRes.error);
                    if (jiraRes.error) return handleError(reply, jiraRes.error);
                    cases = casesRes.data || [];
                    jiraCache = jiraRes.data || [];
                }

                // 4. Composicao aninhada
                const casesBySubflow: Record<string, unknown[]> = {};
                for (const c of cases as { subflow_id: string }[]) {
                    (casesBySubflow[c.subflow_id] ||= []).push(c);
                }
                const jiraBySubflow: Record<string, unknown[]> = {};
                for (const j of jiraCache as { subflow_id: string }[]) {
                    (jiraBySubflow[j.subflow_id] ||= []).push(j);
                }
                const subflowsByJourney: Record<string, unknown[]> = {};
                for (const s of (subflows || []) as { id: string; journey_id: string }[]) {
                    const enriched = {
                        ...s,
                        cases: casesBySubflow[s.id] || [],
                        jira_cache: jiraBySubflow[s.id] || [],
                    };
                    (subflowsByJourney[s.journey_id] ||= []).push(enriched);
                }
                const tree = (journeys || []).map(j => ({
                    ...j,
                    subflows: subflowsByJourney[j.id] || [],
                }));

                return { project_id: projectId, journeys: tree };
            } catch (e) {
                return handleError(reply, e);
            }
        },
    );

    // ============================================================
    // Snapshots (Etapa 9.5)
    // ============================================================

    // POST /qa-journey/snapshots/run?projectId=... - dispara snapshot manual
    // Sem projectId, captura para todos os projetos.
    fastify.post<{ Querystring: { projectId?: string } }>(
        '/qa-journey/snapshots/run',
        async (request, reply) => {
            const projectId = (request.query.projectId || '').trim();
            try {
                if (projectId) {
                    const result = await captureSnapshot(projectId);
                    return { results: [result] };
                }
                const results = await captureAllSnapshots();
                return { results };
            } catch (e) {
                return handleError(reply, e);
            }
        },
    );

    // GET /qa-journey/snapshots?projectId=...&days=90
    fastify.get<{ Querystring: { projectId?: string; days?: string } }>(
        '/qa-journey/snapshots',
        async (request, reply) => {
            const projectId = (request.query.projectId || '').trim();
            if (!projectId) return reply.status(400).send({ error: 'projectId obrigatorio' });
            const days = Math.min(Number(request.query.days || '90') || 90, 365);
            const since = new Date();
            since.setDate(since.getDate() - days);
            const { data, error } = await supabase
                .from('qa_journey_snapshots')
                .select('*')
                .eq('project_id', projectId)
                .gte('snapshot_date', since.toISOString().slice(0, 10))
                .order('snapshot_date', { ascending: true });
            if (error) return handleError(reply, error);
            return { snapshots: data || [] };
        },
    );
};

function handleError(reply: import('fastify').FastifyReply, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { statusCode?: number })?.statusCode || 500;
    return reply.status(status).send({ error: 'request_failed', detail: msg });
}

export default qaJourneyRoutes;
