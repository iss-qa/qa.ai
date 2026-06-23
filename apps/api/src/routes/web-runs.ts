// Rotas de testes Web (Playwright via GitHub Actions).
//
// Fluxo (push): QA aperta Play → POST /web-runs/trigger cria um web_test_runs
// (queued) e dispara o workflow no GitHub (workflow_dispatch) passando o run id
// como input. O CI roda o Playwright e faz POST do report JSON de volta em
// /web-runs/:id/ingest (autenticado por token de ingestão). A API parseia,
// grava resultados/totais e mapeia para os casos de Jornada.
//
// web_test_configs guarda o repo + workflow + HASH do token de ingestão.
// O token em claro é retornado UMA vez (na criação da config) para o QA colar
// como secret no repositório.

import { FastifyPluginAsync } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { supabase } from '../plugins/supabase';
import {
    resolveDefaultOrgId,
    getDecryptedCredentials,
    type GitHubCredentials,
} from '../services/org-integrations';
import {
    dispatchWorkflow,
    findLatestRun,
    getRun,
    listSpecs,
} from '../services/github-actions';
import {
    parsePlaywrightJson,
    mapResultsToJourneyCases,
    type PlaywrightReport,
} from '../services/web-test-runs';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface WebConfigRow {
    id: string;
    project_id: string;
    repo_owner: string;
    repo_name: string;
    default_branch: string;
    workflow_file: string;
    specs_path: string;
    ingest_token_hash: string | null;
}

async function getConfig(projectId: string): Promise<WebConfigRow | null> {
    const { data } = await supabase
        .from('web_test_configs')
        .select('id, project_id, repo_owner, repo_name, default_branch, workflow_file, specs_path, ingest_token_hash')
        .eq('project_id', projectId)
        .maybeSingle();
    return (data as WebConfigRow | null) ?? null;
}

// metadata pública da config (sem o hash do token)
function publicConfig(c: WebConfigRow) {
    return {
        project_id: c.project_id,
        repo_owner: c.repo_owner,
        repo_name: c.repo_name,
        default_branch: c.default_branch,
        workflow_file: c.workflow_file,
        specs_path: c.specs_path,
        has_ingest_token: !!c.ingest_token_hash,
    };
}

async function resolveGitHubToken(): Promise<string> {
    const orgId = await resolveDefaultOrgId();
    const creds = await getDecryptedCredentials<GitHubCredentials>(orgId, 'github');
    if (!creds?.token) throw new Error('Integração GitHub não configurada (Configurações → Integrações)');
    return creds.token;
}

const webRunsRoutes: FastifyPluginAsync = async (fastify) => {

    // ============================================================
    // Config do projeto Web (repo + workflow + token de ingestão)
    // ============================================================

    // GET /web-config?projectId=...
    fastify.get('/web-config', async (request, reply) => {
        const { projectId } = request.query as { projectId?: string };
        if (!projectId) return reply.status(400).send({ error: 'projectId obrigatório' });
        try {
            const c = await getConfig(projectId);
            return { config: c ? publicConfig(c) : null };
        } catch (e) {
            return reply.status(500).send({ error: 'get_config_failed', detail: msg(e) });
        }
    });

    // POST /web-config  → cria/atualiza. Gera ingest_token na 1ª vez (ou quando
    // rotateToken=true) e o retorna EM CLARO apenas nesta resposta.
    fastify.post('/web-config', async (request, reply) => {
        const body = request.body as {
            projectId?: string;
            repo_owner?: string; repo_name?: string;
            default_branch?: string; workflow_file?: string; specs_path?: string;
            rotateToken?: boolean;
        };
        if (!body?.projectId || !body.repo_owner || !body.repo_name || !body.workflow_file) {
            return reply.status(400).send({ error: 'projectId, repo_owner, repo_name e workflow_file são obrigatórios' });
        }
        try {
            const existing = await getConfig(body.projectId);
            let plainToken: string | null = null;
            let ingest_token_hash = existing?.ingest_token_hash ?? null;
            if (!ingest_token_hash || body.rotateToken) {
                plainToken = randomBytes(24).toString('hex');
                ingest_token_hash = sha256(plainToken);
            }
            const row = {
                project_id: body.projectId,
                repo_owner: body.repo_owner.trim(),
                repo_name: body.repo_name.trim(),
                default_branch: (body.default_branch || 'main').trim(),
                workflow_file: body.workflow_file.trim(),
                specs_path: (body.specs_path || 'tests').trim(),
                ingest_token_hash,
            };
            const { data, error } = await supabase
                .from('web_test_configs')
                .upsert(row, { onConflict: 'project_id' })
                .select('id, project_id, repo_owner, repo_name, default_branch, workflow_file, specs_path, ingest_token_hash')
                .single();
            if (error) throw error;
            const base = publicApiBase(request);
            return {
                config: publicConfig(data as WebConfigRow),
                // só presente quando um token novo foi gerado nesta chamada
                ingest_token: plainToken,
                // URL BASE da API — é o que vai no secret QAMIND_INGEST_URL.
                // O workflow monta o resto: {base}/web-runs/{qamind_run_id}/ingest
                ingest_url: base,
                ingest_url_example: `${base}/web-runs/<runId>/ingest`,
                is_public: !/localhost|127\.0\.0\.1/.test(base),
            };
        } catch (e) {
            return reply.status(400).send({ error: 'save_config_failed', detail: msg(e) });
        }
    });

    // ============================================================
    // Specs do repositório
    // ============================================================

    // GET /web-runs/specs?projectId=...&ref=optional
    fastify.get('/web-runs/specs', async (request, reply) => {
        const { projectId, ref } = request.query as { projectId?: string; ref?: string };
        if (!projectId) return reply.status(400).send({ error: 'projectId obrigatório' });
        try {
            const c = await getConfig(projectId);
            if (!c) return reply.status(404).send({ error: 'config_missing', detail: 'Repositório não conectado' });
            const token = await resolveGitHubToken();
            const specs = await listSpecs(token, {
                owner: c.repo_owner, repo: c.repo_name,
                ref: ref || c.default_branch, specsPath: c.specs_path,
            });
            return { specs };
        } catch (e) {
            return reply.status(500).send({ error: 'list_specs_failed', detail: msg(e) });
        }
    });

    // ============================================================
    // Disparo de execução
    // ============================================================

    // POST /web-runs/trigger  { projectId, branch?, spec?, env? }
    fastify.post('/web-runs/trigger', async (request, reply) => {
        const body = request.body as { projectId?: string; branch?: string; spec?: string; env?: string };
        if (!body?.projectId) return reply.status(400).send({ error: 'projectId obrigatório' });
        try {
            const c = await getConfig(body.projectId);
            if (!c) return reply.status(404).send({ error: 'config_missing', detail: 'Repositório não conectado' });
            const token = await resolveGitHubToken();
            const branch = (body.branch || c.default_branch).trim();

            // 1) cria o run (queued)
            const { data: run, error } = await supabase
                .from('web_test_runs')
                .insert({
                    project_id: body.projectId,
                    status: 'queued',
                    trigger: 'manual',
                    branch,
                    spec: body.spec || null,
                })
                .select('id')
                .single();
            if (error) throw error;
            const runId = (run as { id: string }).id;

            // 2) dispara o workflow
            const inputs: Record<string, string> = { qamind_run_id: runId };
            if (body.spec) inputs.spec = body.spec;
            if (body.env) inputs.env = body.env;
            try {
                await dispatchWorkflow(token, {
                    owner: c.repo_owner, repo: c.repo_name,
                    workflow_file: c.workflow_file, ref: branch, inputs,
                });
            } catch (dispatchErr) {
                await supabase.from('web_test_runs')
                    .update({ status: 'error', error_message: msg(dispatchErr), ended_at: new Date().toISOString() })
                    .eq('id', runId);
                return reply.status(502).send({ error: 'dispatch_failed', detail: msg(dispatchErr), runId });
            }

            // 3) correlação + watchdog em background (best-effort)
            void correlateAndWatch(runId, token, {
                owner: c.repo_owner, repo: c.repo_name,
                workflow_file: c.workflow_file, branch,
            });

            return { runId, status: 'queued' };
        } catch (e) {
            return reply.status(500).send({ error: 'trigger_failed', detail: msg(e) });
        }
    });

    // ============================================================
    // Ingestão de resultados (chamada pelo CI)
    // ============================================================

    // POST /web-runs/:id/ingest   header: x-ingest-token
    // query opcional: gh_run_id, gh_run_url, commit
    // body: report JSON do Playwright (reporter 'json')
    fastify.post<{ Params: { id: string } }>('/web-runs/:id/ingest', async (request, reply) => {
        const runId = request.params.id;
        const provided = (request.headers['x-ingest-token'] as string | undefined) || '';
        const q = request.query as { gh_run_id?: string; gh_run_url?: string; commit?: string };
        try {
            const { data: run } = await supabase
                .from('web_test_runs')
                .select('id, project_id')
                .eq('id', runId)
                .maybeSingle();
            if (!run) return reply.status(404).send({ error: 'run_not_found' });
            const projectId = (run as { project_id: string }).project_id;

            const cfg = await getConfig(projectId);
            if (!cfg?.ingest_token_hash) {
                return reply.status(403).send({ error: 'ingest_not_configured' });
            }
            if (!provided || sha256(provided) !== cfg.ingest_token_hash) {
                return reply.status(401).send({ error: 'invalid_ingest_token' });
            }

            const report = request.body as PlaywrightReport;
            if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) {
                return reply.status(400).send({ error: 'invalid_report', detail: 'Esperado report JSON do Playwright (com suites[])' });
            }

            const parsed = parsePlaywrightJson(report);
            const nowIso = new Date().toISOString();
            const status = parsed.failed > 0 ? 'failed' : 'passed';

            // mapeia specs → casos de Jornada (e atualiza last_run_* dos casos)
            const specToCase = await mapResultsToJourneyCases(projectId, parsed.results, nowIso);

            // grava resultados (substitui eventuais anteriores deste run)
            await supabase.from('web_test_results').delete().eq('run_id', runId);
            if (parsed.results.length) {
                const rows = parsed.results.map((r) => ({
                    run_id: runId,
                    spec_file: r.spec_file,
                    title: r.title,
                    status: r.status,
                    duration_ms: r.duration_ms,
                    retries: r.retries,
                    error_message: r.error_message,
                    attachments: r.attachments,
                    qa_journey_case_id: specToCase.get(r.spec_file) ?? null,
                }));
                // insere em lotes para evitar payloads gigantes
                for (let i = 0; i < rows.length; i += 500) {
                    await supabase.from('web_test_results').insert(rows.slice(i, i + 500));
                }
            }

            await supabase.from('web_test_runs').update({
                status,
                total: parsed.total,
                passed: parsed.passed,
                failed: parsed.failed,
                skipped: parsed.skipped,
                flaky: parsed.flaky,
                duration_ms: parsed.duration_ms,
                commit_sha: q.commit || null,
                gh_run_id: q.gh_run_id ? Number(q.gh_run_id) : undefined,
                gh_run_url: q.gh_run_url || undefined,
                ended_at: nowIso,
            }).eq('id', runId);

            return { ok: true, status, total: parsed.total, passed: parsed.passed, failed: parsed.failed };
        } catch (e) {
            return reply.status(500).send({ error: 'ingest_failed', detail: msg(e) });
        }
    });

    // ============================================================
    // Leitura (histórico + detalhe) — para o polling do front
    // ============================================================

    // GET /web-runs?projectId=...
    fastify.get('/web-runs', async (request, reply) => {
        const { projectId } = request.query as { projectId?: string };
        if (!projectId) return reply.status(400).send({ error: 'projectId obrigatório' });
        try {
            const { data, error } = await supabase
                .from('web_test_runs')
                .select('id, status, trigger, branch, spec, commit_sha, gh_run_url, total, passed, failed, skipped, flaky, duration_ms, started_at, ended_at, created_at, error_message')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return { runs: data || [] };
        } catch (e) {
            return reply.status(500).send({ error: 'list_runs_failed', detail: msg(e) });
        }
    });

    // GET /web-runs/:id  → run + resultados
    fastify.get<{ Params: { id: string } }>('/web-runs/:id', async (request, reply) => {
        const runId = request.params.id;
        try {
            const { data: run, error } = await supabase
                .from('web_test_runs')
                .select('*')
                .eq('id', runId)
                .maybeSingle();
            if (error) throw error;
            if (!run) return reply.status(404).send({ error: 'run_not_found' });
            const { data: results } = await supabase
                .from('web_test_results')
                .select('id, spec_file, title, status, duration_ms, retries, error_message, attachments, qa_journey_case_id')
                .eq('run_id', runId)
                .order('spec_file', { ascending: true });
            return { run, results: results || [] };
        } catch (e) {
            return reply.status(500).send({ error: 'get_run_failed', detail: msg(e) });
        }
    });
};

// ============================================================
// Helpers
// ============================================================

function msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

// Base URL pública desta API (para montar a ingest_url exibida ao QA).
function publicApiBase(request: { headers: Record<string, unknown>; protocol?: string }): string {
    const env = (process.env.QAMIND_INGEST_URL || process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
    if (env) return env;
    const host = (request.headers['x-forwarded-host'] || request.headers['host']) as string | undefined;
    const proto = (request.headers['x-forwarded-proto'] as string | undefined) || request.protocol || 'http';
    return host ? `${proto}://${host}` : 'http://localhost:3001';
}

// Best-effort: captura o gh_run_id/url do run disparado e vigia até concluir.
// Se a ingestão não chegar mas o GitHub reportar concluído, marca o status a
// partir da conclusion. Se nada acontecer dentro da janela, marca 'error'.
async function correlateAndWatch(
    runId: string,
    token: string,
    p: { owner: string; repo: string; workflow_file: string; branch: string },
): Promise<void> {
    const createdAfterIso = new Date(Date.now() - 60_000).toISOString();
    let ghRunId: number | null = null;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 1) correlaciona (workflow_dispatch não devolve o id)
    for (let i = 0; i < 6 && !ghRunId; i++) {
        await sleep(5000);
        try {
            const latest = await findLatestRun(token, { ...p, createdAfterIso });
            if (latest) {
                ghRunId = latest.id;
                await supabase.from('web_test_runs').update({
                    status: 'running',
                    gh_run_id: latest.id,
                    gh_run_url: latest.html_url,
                    commit_sha: latest.head_sha,
                    started_at: new Date().toISOString(),
                }).eq('id', runId);
            }
        } catch { /* best-effort */ }
    }

    // 2) vigia conclusão (~20 min, 30s entre polls)
    for (let i = 0; i < 40; i++) {
        await sleep(30_000);
        // se a ingestão já finalizou o run, encerramos
        const { data } = await supabase.from('web_test_runs').select('status').eq('id', runId).maybeSingle();
        const st = (data as { status?: string } | null)?.status;
        if (st && ['passed', 'failed', 'cancelled', 'error'].includes(st)) return;

        if (ghRunId) {
            try {
                const gh = await getRun(token, { owner: p.owner, repo: p.repo, runId: ghRunId });
                if (gh?.status === 'completed') {
                    // GitHub concluiu mas a ingestão não chegou → deriva status da conclusion
                    const derived = gh.conclusion === 'success' ? 'passed'
                        : gh.conclusion === 'cancelled' ? 'cancelled' : 'failed';
                    await supabase.from('web_test_runs').update({
                        status: derived,
                        ended_at: new Date().toISOString(),
                        error_message: 'Resultados não ingeridos pelo CI; status derivado do GitHub Actions.',
                    }).eq('id', runId).in('status', ['queued', 'running']);
                    return;
                }
            } catch { /* best-effort */ }
        }
    }

    // 3) timeout
    await supabase.from('web_test_runs').update({
        status: 'error',
        ended_at: new Date().toISOString(),
        error_message: 'Timeout: execução não concluiu nem reportou resultados.',
    }).eq('id', runId).in('status', ['queued', 'running']);
}

export default webRunsRoutes;
