// Client das rotas de testes Web (apps/api). Diferente do fetchApi genérico,
// estas funções extraem a mensagem `detail` do corpo de erro da API.

import type {
    WebConfig, WebConfigInput, SaveConfigResponse, RepoSpec, WebRun, WebResult, WebConfigSummary,
} from './web-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// URL pública de produção da API (EasyPanel + Traefik). Usada como sugestão de
// QAMIND_INGEST_URL quando a API atual é localhost (não alcançável pelo runner
// do GitHub Actions). Configurável via NEXT_PUBLIC_QAMIND_INGEST_URL.
export const PUBLIC_API_FALLBACK =
    process.env.NEXT_PUBLIC_QAMIND_INGEST_URL
    || process.env.NEXT_PUBLIC_PUBLIC_API_URL
    || 'https://api.qamind.issqa.com.br';

export function isLocalApiBase(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(url.trim());
}

export function publicIngestBase(url: string): string {
    const base = url.trim().replace(/\/+$/, '');
    return base && !isLocalApiBase(base) ? base : PUBLIC_API_FALLBACK;
}

async function call<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail = (body as { detail?: string; error?: string }).detail
            || (body as { error?: string }).error
            || res.statusText;
        throw new Error(detail);
    }
    return body as T;
}

export function getWebConfig(projectId: string) {
    return call<{ config: WebConfig | null }>(`/web-config?projectId=${encodeURIComponent(projectId)}`);
}

export function saveWebConfig(input: WebConfigInput) {
    return call<SaveConfigResponse>('/web-config', { method: 'POST', body: JSON.stringify(input) });
}

export function listAllWebConfigs() {
    return call<{ configs: WebConfigSummary[] }>('/web-configs');
}

export function getSpecContent(projectId: string, path: string, ref?: string) {
    const q = new URLSearchParams({ projectId, path });
    if (ref) q.set('ref', ref);
    return call<{ content: string; path: string; ref: string }>(`/web-runs/spec-content?${q.toString()}`);
}

export function listWebSpecs(projectId: string, ref?: string) {
    const q = new URLSearchParams({ projectId });
    if (ref) q.set('ref', ref);
    return call<{ specs: RepoSpec[] }>(`/web-runs/specs?${q.toString()}`);
}

export function triggerWebRun(projectId: string, opts?: { branch?: string; spec?: string; env?: string }) {
    return call<{ runId: string; status: string }>('/web-runs/trigger', {
        method: 'POST',
        body: JSON.stringify({ projectId, ...opts }),
    });
}

export function listWebRuns(projectId: string) {
    return call<{ runs: WebRun[] }>(`/web-runs?projectId=${encodeURIComponent(projectId)}`);
}

export function getWebRun(runId: string) {
    return call<{ run: WebRun; results: WebResult[] }>(`/web-runs/${encodeURIComponent(runId)}`);
}
