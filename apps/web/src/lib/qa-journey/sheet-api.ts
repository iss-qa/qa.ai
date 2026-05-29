// Wrappers fetch para os endpoints qa-journey da API Fastify.

import type {
    QAJourneySheetConfig,
    QAJourneySheetConfigDraft,
    QAJourneySync,
    SheetPreview,
    SheetTab,
    SyncRunResult,
} from '@/types/qa-journey-sheet';

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

// Envolve fetch para diferenciar "API offline" (TypeError) de "API respondeu com erro".
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Backend Fastify offline em ${API_URL} (${msg}). Suba com: pnpm --filter api dev`);
    }
}

// Extrai o spreadsheetId de uma URL completa do Google Sheets.
// Aceita tambem o ID puro. Retorna null se nao for reconhecivel.
export function parseSpreadsheetId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    // Pode ja ser o ID puro
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
    return null;
}

// ============================================================
// Wizard helpers
// ============================================================

export async function fetchSheetTabs(spreadsheetId: string): Promise<SheetTab[]> {
    const u = new URL(`${API_URL}/qa-journey/sheet-tabs`);
    u.searchParams.set('spreadsheetId', spreadsheetId);
    const res = await safeFetch(u.toString(), { cache: 'no-store' });
    const body = await handleResponse<{ tabs: SheetTab[] }>(res);
    return body.tabs;
}

export async function fetchSheetPreview(
    spreadsheetId: string,
    sheetName: string,
    headerRow = 1,
    sampleRows = 10,
): Promise<SheetPreview> {
    const u = new URL(`${API_URL}/qa-journey/sheet-preview`);
    u.searchParams.set('spreadsheetId', spreadsheetId);
    u.searchParams.set('sheetName', sheetName);
    u.searchParams.set('headerRow', String(headerRow));
    u.searchParams.set('sampleRows', String(sampleRows));
    const res = await safeFetch(u.toString(), { cache: 'no-store' });
    return handleResponse<SheetPreview>(res);
}

// ============================================================
// Sheet configs
// ============================================================

export async function listSheetConfigs(projectId: string): Promise<QAJourneySheetConfig[]> {
    const u = new URL(`${API_URL}/qa-journey/sheet-configs`);
    u.searchParams.set('projectId', projectId);
    const res = await safeFetch(u.toString(), { cache: 'no-store' });
    const body = await handleResponse<{ configs: QAJourneySheetConfig[] }>(res);
    return body.configs;
}

export async function upsertSheetConfig(draft: QAJourneySheetConfigDraft): Promise<QAJourneySheetConfig> {
    const res = await safeFetch(`${API_URL}/qa-journey/sheet-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
    });
    const body = await handleResponse<{ config: QAJourneySheetConfig }>(res);
    return body.config;
}

export async function patchSheetConfig(
    id: string,
    updates: Partial<QAJourneySheetConfigDraft> & { is_active?: boolean },
): Promise<QAJourneySheetConfig> {
    const res = await safeFetch(`${API_URL}/qa-journey/sheet-configs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    const body = await handleResponse<{ config: QAJourneySheetConfig }>(res);
    return body.config;
}

export async function deleteSheetConfig(id: string): Promise<void> {
    const res = await safeFetch(`${API_URL}/qa-journey/sheet-configs/${id}`, { method: 'DELETE' });
    await handleResponse<{ ok: boolean }>(res);
}

// ============================================================
// Sync + history
// ============================================================

export async function runSync(configId: string): Promise<SyncRunResult> {
    const res = await safeFetch(`${API_URL}/qa-journey/sync/${configId}`, { method: 'POST' });
    return handleResponse<SyncRunResult>(res);
}

export async function listSyncs(projectId: string, limit = 50): Promise<QAJourneySync[]> {
    const u = new URL(`${API_URL}/qa-journey/syncs`);
    u.searchParams.set('projectId', projectId);
    u.searchParams.set('limit', String(limit));
    const res = await safeFetch(u.toString(), { cache: 'no-store' });
    const body = await handleResponse<{ syncs: QAJourneySync[] }>(res);
    return body.syncs;
}
