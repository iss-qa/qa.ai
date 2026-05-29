// Wrappers fetch para a API Fastify de integracoes.
// Base URL vem de NEXT_PUBLIC_API_URL.

import type {
    GoogleSheetsCredentialsInput,
    IntegrationRecord,
    IntegrationTestResult,
    JiraCredentialsInput,
    IntegrationProvider,
} from '@/types/integrations';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const body = await res.json() as { detail?: string; error?: string };
            detail = body.detail || body.error || detail;
        } catch {
            detail = (await res.text().catch(() => '')) || detail;
        }
        throw new Error(detail);
    }
    return res.json() as Promise<T>;
}

// Diferencia "API offline" (TypeError) de "API respondeu com erro HTTP".
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Backend Fastify offline em ${API_URL} (${msg}). Suba com: pnpm --filter api dev`);
    }
}

export async function listIntegrations(): Promise<IntegrationRecord[]> {
    const res = await safeFetch(`${API_URL}/integrations`, { cache: 'no-store' });
    const body = await handleResponse<{ integrations: IntegrationRecord[] }>(res);
    return body.integrations;
}

export async function saveGoogleSheetsCredentials(creds: GoogleSheetsCredentialsInput): Promise<IntegrationRecord> {
    const res = await safeFetch(`${API_URL}/integrations/google-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: creds }),
    });
    const body = await handleResponse<{ integration: IntegrationRecord }>(res);
    return body.integration;
}

export async function saveJiraCredentials(creds: JiraCredentialsInput): Promise<IntegrationRecord> {
    const res = await safeFetch(`${API_URL}/integrations/jira`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: creds }),
    });
    const body = await handleResponse<{ integration: IntegrationRecord }>(res);
    return body.integration;
}

export async function testIntegration(provider: IntegrationProvider): Promise<IntegrationTestResult> {
    const res = await safeFetch(`${API_URL}/integrations/${provider}/test`, { method: 'POST' });
    return handleResponse<IntegrationTestResult>(res);
}

export async function deleteIntegration(provider: IntegrationProvider): Promise<void> {
    const res = await safeFetch(`${API_URL}/integrations/${provider}`, { method: 'DELETE' });
    await handleResponse<{ ok: boolean }>(res);
}
