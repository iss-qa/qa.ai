// CRUD + teste de conexao para integracoes externas por organizacao.
// As credenciais ficam cifradas em org_integrations.credentials_cipher.
// Este modulo SO roda no backend (Fastify) com service_role do Supabase.

import { supabase } from '../plugins/supabase';
import { decryptJson, encryptJson } from './encryption';
import { listSheetTabs, type GoogleServiceAccountCreds } from './google-sheets';

export type IntegrationProvider = 'google_sheets' | 'jira' | 'slack' | 'github';

export interface GoogleSheetsCredentials {
    client_email: string;
    private_key: string;
    project_id?: string;
    [key: string]: unknown;
}

export interface JiraCredentials {
    host: string;       // ex: "foxbit.atlassian.net"
    email: string;      // email da conta Atlassian
    api_token: string;  // token gerado em id.atlassian.com
}

export interface SlackCredentials {
    webhook_url: string;        // Incoming Webhook (https://hooks.slack.com/services/...)
    default_channel?: string;   // informativo — o canal real é fixado no webhook
}

export interface GitHubCredentials {
    token: string;   // PAT clássico ou fine-grained (escopos: actions:write + contents:read)
    name?: string;   // rótulo da conta (ex: "Pessoal", "Foxbit") — usado no upsert multi-conta
}

// Metadados visiveis na UI (nunca incluem segredos)
export interface IntegrationMetadata {
    google_sheets?: { client_email: string; project_id?: string };
    jira?:          { host: string; email: string };
}

export interface OrgIntegrationRecord {
    id: string;
    org_id: string;
    provider: IntegrationProvider;
    name: string;
    metadata: Record<string, unknown>;
    is_active: boolean;
    last_tested_at: string | null;
    last_test_status: 'ok' | 'error' | null;
    last_test_error: string | null;
    created_at: string;
    updated_at: string;
}

const INTEGRATION_SELECT = 'id, org_id, provider, name, metadata, is_active, last_tested_at, last_test_status, last_test_error, created_at, updated_at';

// ============================================================
// Org lookup
// ============================================================

let cachedDefaultOrgId: string | null = null;

/**
 * Resolve a org default da instalacao a partir do env DEFAULT_ORG_SLUG.
 * Cacheado em memoria. Quando auth multi-org existir, esta funcao
 * vai ser substituida por uma que le da sessao do usuario.
 */
export async function resolveDefaultOrgId(): Promise<string> {
    if (cachedDefaultOrgId) return cachedDefaultOrgId;
    const slug = (process.env.DEFAULT_ORG_SLUG || 'foxbit').trim();
    const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`Falha ao resolver org "${slug}": ${error.message}`);
    if (!data) throw new Error(`Organizacao "${slug}" nao encontrada (rode supabase/migrations/007_organizations.sql)`);
    cachedDefaultOrgId = data.id as string;
    return cachedDefaultOrgId;
}

// ============================================================
// List + Get
// ============================================================

export async function listIntegrations(orgId: string): Promise<OrgIntegrationRecord[]> {
    const { data, error } = await supabase
        .from('org_integrations')
        .select(INTEGRATION_SELECT)
        .eq('org_id', orgId);
    if (error) throw error;
    return (data || []) as OrgIntegrationRecord[];
}

/**
 * Retorna as credenciais decifradas do primeiro registro ativo de um provider.
 * Para providers de conta única (google_sheets, jira, slack) sempre há no máximo um.
 * Para github, retorna o primeiro ativo encontrado (ordena por created_at).
 */
export async function getDecryptedCredentials<T>(orgId: string, provider: IntegrationProvider): Promise<T | null> {
    const { data, error } = await supabase
        .from('org_integrations')
        .select('credentials_cipher')
        .eq('org_id', orgId)
        .eq('provider', provider)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row?.credentials_cipher) return null;
    return decryptJson<T>(row.credentials_cipher as string);
}

// ============================================================
// Save
// ============================================================

export async function saveGoogleSheetsIntegration(
    orgId: string,
    creds: GoogleSheetsCredentials,
): Promise<OrgIntegrationRecord> {
    if (!creds.client_email || !creds.private_key) {
        throw new Error('JSON do service account deve conter client_email e private_key');
    }
    const cipher = encryptJson(creds);
    const metadata = {
        client_email: creds.client_email,
        project_id: creds.project_id ?? null,
    };
    return upsertIntegration(orgId, 'google_sheets', cipher, metadata);
}

export async function saveJiraIntegration(
    orgId: string,
    creds: JiraCredentials,
): Promise<OrgIntegrationRecord> {
    if (!creds.host || !creds.email || !creds.api_token) {
        throw new Error('Jira: host, email e api_token sao obrigatorios');
    }
    // Normaliza host (remove protocolo e barras)
    const host = creds.host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    const cipher = encryptJson({ ...creds, host });
    const metadata = { host, email: creds.email };
    return upsertIntegration(orgId, 'jira', cipher, metadata);
}

export async function saveSlackIntegration(
    orgId: string,
    creds: SlackCredentials,
): Promise<OrgIntegrationRecord> {
    const url = (creds.webhook_url || '').trim();
    if (!/^https:\/\/hooks\.slack\.com\/(services|workflows)\//.test(url)) {
        throw new Error('Slack: informe uma Incoming Webhook URL válida (https://hooks.slack.com/services/...)');
    }
    const channel = (creds.default_channel || '').trim().replace(/^#/, '');
    const cipher = encryptJson({ webhook_url: url, default_channel: channel || null });
    // Metadata sem segredo: só o sufixo do webhook para identificação visual
    const metadata = {
        webhook_masked: `hooks.slack.com/…${url.slice(-6)}`,
        default_channel: channel || null,
    };
    return upsertIntegration(orgId, 'slack', cipher, metadata);
}

export async function saveGitHubIntegration(
    orgId: string,
    creds: GitHubCredentials,
): Promise<OrgIntegrationRecord> {
    const token = (creds.token || '').trim();
    const name = (creds.name || '').trim();

    if (!token) {
        throw new Error('GitHub: token é obrigatório');
    }
    // Valida o token e captura o login para metadata (sem expor o segredo).
    const res = await fetch('https://api.github.com/user', {
        headers: githubHeaders(token),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`GitHub recusou o token (HTTP ${res.status}): ${txt.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => ({})) as { login?: string };
    const scopes = res.headers.get('x-oauth-scopes') || '';
    const cipher = encryptJson({ token });
    const metadata = {
        login: body.login || null,
        scopes: scopes || null,
        token_masked: `…${token.slice(-4)}`,
        name: name || null,
    };
    return upsertIntegration(orgId, 'github', cipher, metadata, name);
}

export function githubHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'QAMind',
    };
}

async function upsertIntegration(
    orgId: string,
    provider: IntegrationProvider,
    credentialsCipher: string,
    metadata: Record<string, unknown>,
    name = '',
): Promise<OrgIntegrationRecord> {
    const { data, error } = await supabase
        .from('org_integrations')
        .upsert({
            org_id: orgId,
            provider,
            name,
            credentials_cipher: credentialsCipher,
            metadata,
            is_active: true,
            // Reseta resultado do teste anterior - precisa retestar
            last_tested_at: null,
            last_test_status: null,
            last_test_error: null,
        }, { onConflict: 'org_id,provider,name' })
        .select(INTEGRATION_SELECT)
        .single();
    if (error) throw error;
    return data as OrgIntegrationRecord;
}

export async function deleteIntegration(orgId: string, provider: IntegrationProvider): Promise<void> {
    const { error } = await supabase
        .from('org_integrations')
        .delete()
        .eq('org_id', orgId)
        .eq('provider', provider);
    if (error) throw error;
}

export async function deleteIntegrationById(id: string): Promise<void> {
    const { error } = await supabase
        .from('org_integrations')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function toggleIntegrationActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
        .from('org_integrations')
        .update({ is_active: isActive })
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// Test connection
// ============================================================

export interface TestResult {
    ok: boolean;
    detail: string;
}

export async function testIntegration(
    orgId: string,
    provider: IntegrationProvider,
): Promise<TestResult> {
    let result: TestResult;
    try {
        if (provider === 'google_sheets') {
            result = await testGoogleSheets(orgId);
        } else if (provider === 'slack') {
            result = await testSlack(orgId);
        } else if (provider === 'github') {
            result = await testGitHub(orgId);
        } else {
            result = await testJira(orgId);
        }
    } catch (e) {
        result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
    await supabase
        .from('org_integrations')
        .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: result.ok ? 'ok' : 'error',
            last_test_error: result.ok ? null : result.detail.slice(0, 500),
        })
        .eq('org_id', orgId)
        .eq('provider', provider);
    return result;
}

/**
 * Testa uma integração específica pelo seu ID (UUID).
 * Usado para GitHub multi-conta: cada card tem seu próprio botão "Testar".
 */
export async function testIntegrationById(id: string): Promise<TestResult> {
    const { data, error } = await supabase
        .from('org_integrations')
        .select('provider, credentials_cipher')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data?.credentials_cipher) return { ok: false, detail: 'Integração não encontrada' };

    const provider = data.provider as IntegrationProvider;
    let result: TestResult;

    try {
        if (provider === 'github') {
            const creds = decryptJson<GitHubCredentials>(data.credentials_cipher as string);
            const res = await fetch('https://api.github.com/user', { headers: githubHeaders(creds.token) });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                result = { ok: false, detail: `GitHub respondeu HTTP ${res.status}: ${txt.slice(0, 200)}` };
            } else {
                const body = await res.json().catch(() => ({})) as { login?: string };
                result = { ok: true, detail: `Autenticado como ${body.login || 'usuário GitHub'}` };
            }
        } else {
            const orgId = await resolveDefaultOrgId();
            result = await testIntegration(orgId, provider);
        }
    } catch (e) {
        result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }

    await supabase
        .from('org_integrations')
        .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: result.ok ? 'ok' : 'error',
            last_test_error: result.ok ? null : result.detail.slice(0, 500),
        })
        .eq('id', id);

    return result;
}

async function testGoogleSheets(orgId: string): Promise<TestResult> {
    const creds = await getDecryptedCredentials<GoogleServiceAccountCreds>(orgId, 'google_sheets');
    if (!creds) return { ok: false, detail: 'Integracao Google Sheets nao configurada' };
    // Validacao real: lista abas de uma planilha conhecida? Nao temos uma.
    // Aceitamos como "ok" se autenticarmos com sucesso (token gerado).
    // Importamos listSheetTabs aqui mas nao chamamos sem spreadsheetId.
    // Em vez disso, fazemos um get de token via JWT.
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: creds.client_email, private_key: creds.private_key },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    await auth.getAccessToken();
    void listSheetTabs; // referenciado para o tree-shaker nao remover
    return { ok: true, detail: `Autenticado como ${creds.client_email}` };
}

async function testSlack(orgId: string): Promise<TestResult> {
    const creds = await getDecryptedCredentials<SlackCredentials>(orgId, 'slack');
    if (!creds) return { ok: false, detail: 'Integracao Slack nao configurada' };
    // Incoming Webhook nao tem endpoint de "ping" - o teste envia uma
    // mensagem real no canal configurado no webhook.
    const res = await fetch(creds.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: ':white_check_mark: QAMind conectado — teste de integração Slack.',
        }),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, detail: `Slack respondeu HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    return {
        ok: true,
        detail: `Mensagem de teste enviada${creds.default_channel ? ` para #${creds.default_channel}` : ''}.`,
    };
}

async function testGitHub(orgId: string): Promise<TestResult> {
    const creds = await getDecryptedCredentials<GitHubCredentials>(orgId, 'github');
    if (!creds) return { ok: false, detail: 'Integração GitHub não configurada' };
    const res = await fetch('https://api.github.com/user', { headers: githubHeaders(creds.token) });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, detail: `GitHub respondeu HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const body = await res.json().catch(() => ({})) as { login?: string };
    return { ok: true, detail: `Autenticado como ${body.login || 'usuário GitHub'}` };
}

async function testJira(orgId: string): Promise<TestResult> {
    const creds = await getDecryptedCredentials<JiraCredentials>(orgId, 'jira');
    if (!creds) return { ok: false, detail: 'Integracao Jira nao configurada' };
    const url = `https://${creds.host}/rest/api/3/myself`;
    const auth = Buffer.from(`${creds.email}:${creds.api_token}`).toString('base64');
    const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, detail: `Jira respondeu HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const body = await res.json().catch(() => ({})) as { displayName?: string; emailAddress?: string };
    return { ok: true, detail: `Autenticado como ${body.displayName || body.emailAddress || creds.email}` };
}
