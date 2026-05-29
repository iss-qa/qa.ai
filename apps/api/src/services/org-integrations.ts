// CRUD + teste de conexao para integracoes externas por organizacao.
// As credenciais ficam cifradas em org_integrations.credentials_cipher.
// Este modulo SO roda no backend (Fastify) com service_role do Supabase.

import { supabase } from '../plugins/supabase';
import { decryptJson, encryptJson } from './encryption';
import { listSheetTabs, type GoogleServiceAccountCreds } from './google-sheets';

export type IntegrationProvider = 'google_sheets' | 'jira';

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

// Metadados visiveis na UI (nunca incluem segredos)
export interface IntegrationMetadata {
    google_sheets?: { client_email: string; project_id?: string };
    jira?:          { host: string; email: string };
}

export interface OrgIntegrationRecord {
    id: string;
    org_id: string;
    provider: IntegrationProvider;
    metadata: Record<string, unknown>;
    is_active: boolean;
    last_tested_at: string | null;
    last_test_status: 'ok' | 'error' | null;
    last_test_error: string | null;
    created_at: string;
    updated_at: string;
}

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
        .select('id, org_id, provider, metadata, is_active, last_tested_at, last_test_status, last_test_error, created_at, updated_at')
        .eq('org_id', orgId);
    if (error) throw error;
    return (data || []) as OrgIntegrationRecord[];
}

export async function getDecryptedCredentials<T>(orgId: string, provider: IntegrationProvider): Promise<T | null> {
    const { data, error } = await supabase
        .from('org_integrations')
        .select('credentials_cipher, is_active')
        .eq('org_id', orgId)
        .eq('provider', provider)
        .maybeSingle();
    if (error) throw error;
    if (!data || !data.is_active || !data.credentials_cipher) return null;
    return decryptJson<T>(data.credentials_cipher as string);
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

async function upsertIntegration(
    orgId: string,
    provider: IntegrationProvider,
    credentialsCipher: string,
    metadata: Record<string, unknown>,
): Promise<OrgIntegrationRecord> {
    const { data, error } = await supabase
        .from('org_integrations')
        .upsert({
            org_id: orgId,
            provider,
            credentials_cipher: credentialsCipher,
            metadata,
            is_active: true,
            // Reseta resultado do teste anterior - precisa retestar
            last_tested_at: null,
            last_test_status: null,
            last_test_error: null,
        }, { onConflict: 'org_id,provider' })
        .select('id, org_id, provider, metadata, is_active, last_tested_at, last_test_status, last_test_error, created_at, updated_at')
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
