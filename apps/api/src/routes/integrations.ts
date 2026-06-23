// Rotas para gerenciar integracoes externas (Google Sheets, Jira)
// por organizacao. As creds nunca trafegam de volta para o cliente -
// apenas metadata + status do teste.

import { FastifyPluginAsync } from 'fastify';
import {
    deleteIntegration,
    listIntegrations,
    resolveDefaultOrgId,
    saveGoogleSheetsIntegration,
    saveGitHubIntegration,
    saveJiraIntegration,
    saveSlackIntegration,
    testIntegration,
    type GitHubCredentials,
    type GoogleSheetsCredentials,
    type IntegrationProvider,
    type JiraCredentials,
    type SlackCredentials,
} from '../services/org-integrations';

const VALID_PROVIDERS = new Set(['google_sheets', 'jira', 'slack', 'github']);
import { isEncryptionConfigured, encryptionConfigError } from '../services/encryption';

const integrationsRoutes: FastifyPluginAsync = async (fastify) => {

    // Helper: garante que encryption esta OK antes de qualquer operacao
    const requireEncryption = (reply: import('fastify').FastifyReply): boolean => {
        if (!isEncryptionConfigured()) {
            reply.status(500).send({
                error: 'encryption_not_configured',
                detail: encryptionConfigError() || 'INTEGRATIONS_ENCRYPTION_KEY ausente',
            });
            return false;
        }
        return true;
    };

    // GET /integrations - lista integracoes da org default
    fastify.get('/integrations', async (_request, reply) => {
        try {
            const orgId = await resolveDefaultOrgId();
            const list = await listIntegrations(orgId);
            return { org_id: orgId, integrations: list };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(500).send({ error: 'list_failed', detail: msg });
        }
    });

    // POST /integrations/google-sheets - salva ou atualiza
    // Body: { credentials: { client_email, private_key, project_id?, ... } }
    fastify.post('/integrations/google-sheets', async (request, reply) => {
        if (!requireEncryption(reply)) return;
        try {
            const body = request.body as { credentials?: GoogleSheetsCredentials };
            const creds = body?.credentials;
            if (!creds || typeof creds !== 'object') {
                return reply.status(400).send({ error: 'invalid_body', detail: 'credentials obrigatorio' });
            }
            const orgId = await resolveDefaultOrgId();
            const saved = await saveGoogleSheetsIntegration(orgId, creds);
            return { integration: saved };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(400).send({ error: 'save_failed', detail: msg });
        }
    });

    // POST /integrations/jira - salva ou atualiza
    // Body: { credentials: { host, email, api_token } }
    fastify.post('/integrations/jira', async (request, reply) => {
        if (!requireEncryption(reply)) return;
        try {
            const body = request.body as { credentials?: JiraCredentials };
            const creds = body?.credentials;
            if (!creds || typeof creds !== 'object') {
                return reply.status(400).send({ error: 'invalid_body', detail: 'credentials obrigatorio' });
            }
            const orgId = await resolveDefaultOrgId();
            const saved = await saveJiraIntegration(orgId, creds);
            return { integration: saved };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(400).send({ error: 'save_failed', detail: msg });
        }
    });

    // POST /integrations/slack - salva ou atualiza
    // Body: { credentials: { webhook_url, default_channel? } }
    fastify.post('/integrations/slack', async (request, reply) => {
        if (!requireEncryption(reply)) return;
        try {
            const body = request.body as { credentials?: SlackCredentials };
            const creds = body?.credentials;
            if (!creds || typeof creds !== 'object') {
                return reply.status(400).send({ error: 'invalid_body', detail: 'credentials obrigatorio' });
            }
            const orgId = await resolveDefaultOrgId();
            const saved = await saveSlackIntegration(orgId, creds);
            return { integration: saved };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(400).send({ error: 'save_failed', detail: msg });
        }
    });

    // POST /integrations/github - salva ou atualiza
    // Body: { credentials: { token } }
    fastify.post('/integrations/github', async (request, reply) => {
        if (!requireEncryption(reply)) return;
        try {
            const body = request.body as { credentials?: GitHubCredentials };
            const creds = body?.credentials;
            if (!creds || typeof creds !== 'object') {
                return reply.status(400).send({ error: 'invalid_body', detail: 'credentials obrigatorio' });
            }
            const orgId = await resolveDefaultOrgId();
            const saved = await saveGitHubIntegration(orgId, creds);
            return { integration: saved };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(400).send({ error: 'save_failed', detail: msg });
        }
    });

    // POST /integrations/:provider/test - testa a conexao
    fastify.post<{ Params: { provider: string } }>('/integrations/:provider/test', async (request, reply) => {
        if (!requireEncryption(reply)) return;
        const provider = request.params.provider;
        if (!VALID_PROVIDERS.has(provider)) {
            return reply.status(400).send({ error: 'invalid_provider' });
        }
        try {
            const orgId = await resolveDefaultOrgId();
            const result = await testIntegration(orgId, provider as IntegrationProvider);
            return result;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(500).send({ error: 'test_failed', detail: msg });
        }
    });

    // DELETE /integrations/:provider
    fastify.delete<{ Params: { provider: string } }>('/integrations/:provider', async (request, reply) => {
        const provider = request.params.provider;
        if (!VALID_PROVIDERS.has(provider)) {
            return reply.status(400).send({ error: 'invalid_provider' });
        }
        try {
            const orgId = await resolveDefaultOrgId();
            await deleteIntegration(orgId, provider as IntegrationProvider);
            return { ok: true };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return reply.status(500).send({ error: 'delete_failed', detail: msg });
        }
    });
};

export default integrationsRoutes;
