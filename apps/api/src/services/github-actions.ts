// Wrappers da GitHub Actions REST API usados pelos testes Web.
// Disparo de workflow (workflow_dispatch), correlação do run disparado e
// listagem de specs do repositório. Roda só no backend (Fastify) com o token
// GitHub cifrado em org_integrations (resolvido por github-actions caller).

import { githubHeaders } from './org-integrations';

const GH_API = 'https://api.github.com';

export interface RepoRef {
    owner: string;
    repo: string;
}

export interface DispatchParams extends RepoRef {
    workflow_file: string;          // ex.: 'playwright.yml' (nome do arquivo em .github/workflows)
    ref: string;                    // branch/tag
    inputs: Record<string, string>; // inputs do workflow_dispatch
}

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${GH_API}${path}`, {
        ...init,
        headers: { ...githubHeaders(token), ...(init?.headers as Record<string, string> | undefined) },
    });
}

/**
 * Dispara um workflow via workflow_dispatch. O workflow precisa declarar
 * `on: workflow_dispatch` com os inputs correspondentes no repo.
 * GitHub responde 204 (sem body) — não retorna o run id. A correlação é feita
 * depois por findRunByInput().
 */
export async function dispatchWorkflow(token: string, p: DispatchParams): Promise<void> {
    const res = await ghFetch(
        token,
        `/repos/${p.owner}/${p.repo}/actions/workflows/${encodeURIComponent(p.workflow_file)}/dispatches`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: p.ref, inputs: p.inputs }),
        },
    );
    if (res.status !== 204) {
        const txt = await res.text().catch(() => '');
        throw new Error(formatGithubWorkflowError(res.status, txt));
    }
}

function formatGithubWorkflowError(status: number, bodyText: string): string {
    const fallback = bodyText.slice(0, 300);
    const body = parseGithubErrorBody(bodyText);
    const message = body?.message || fallback;

    if (status === 422 && /Unexpected inputs provided/i.test(message)) {
        return [
            `GitHub workflow_dispatch falhou (HTTP ${status}): ${message}.`,
            'O arquivo .github/workflows/*.yml precisa declarar exatamente os inputs enviados pela API.',
            'No QAMind atual os inputs esperados sao: qamind_run_id, spec e env.',
        ].join(' ');
    }

    if (status === 404) {
        const suffix = fallback ? ` Detalhe do GitHub: ${fallback}` : '';
        return `GitHub workflow_dispatch falhou (HTTP ${status}): workflow nao encontrado. Confira owner, repositorio, branch e o nome do arquivo em .github/workflows/.${suffix}`;
    }

    return `GitHub workflow_dispatch falhou (HTTP ${status}): ${message.slice(0, 300)}`;
}

function parseGithubErrorBody(bodyText: string): { message?: string } | null {
    try {
        return JSON.parse(bodyText) as { message?: string };
    } catch {
        return null;
    }
}

export interface GhWorkflowRun {
    id: number;
    html_url: string;
    status: string;       // queued | in_progress | completed
    conclusion: string | null; // success | failure | cancelled | ...
    head_sha: string;
    head_branch: string;
    created_at: string;
    display_title: string;
    name: string;
}

/**
 * Lista runs recentes do workflow (para correlacionar com o que acabamos de
 * disparar). workflow_dispatch não devolve o run id, então pegamos o run mais
 * recente no branch/workflow logo após o dispatch. Best-effort.
 */
export async function findLatestRun(
    token: string,
    p: RepoRef & { workflow_file: string; branch: string; createdAfterIso?: string },
): Promise<GhWorkflowRun | null> {
    const params = new URLSearchParams({ branch: p.branch, event: 'workflow_dispatch', per_page: '10' });
    if (p.createdAfterIso) params.set('created', `>=${p.createdAfterIso}`);
    const res = await ghFetch(
        token,
        `/repos/${p.owner}/${p.repo}/actions/workflows/${encodeURIComponent(p.workflow_file)}/runs?${params.toString()}`,
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({})) as { workflow_runs?: GhWorkflowRun[] };
    const runs = body.workflow_runs || [];
    return runs.length ? runs[0] : null;
}

export async function getRun(token: string, p: RepoRef & { runId: number }): Promise<GhWorkflowRun | null> {
    const res = await ghFetch(token, `/repos/${p.owner}/${p.repo}/actions/runs/${p.runId}`);
    if (!res.ok) return null;
    return await res.json().catch(() => null) as GhWorkflowRun | null;
}

export interface RepoSpec {
    path: string;   // ex.: 'tests/login.spec.ts'
    name: string;   // ex.: 'login.spec.ts'
}

/**
 * Lista specs do repositório (arquivos *.spec.ts / *.spec.js / *.test.ts) sob
 * specsPath, usando a Git Trees API recursiva (1 chamada). Filtra no cliente.
 */
export async function listSpecs(
    token: string,
    p: RepoRef & { ref: string; specsPath: string },
): Promise<RepoSpec[]> {
    const res = await ghFetch(
        token,
        `/repos/${p.owner}/${p.repo}/git/trees/${encodeURIComponent(p.ref)}?recursive=1`,
    );
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`GitHub git/trees falhou (HTTP ${res.status}): ${txt.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => ({})) as { tree?: Array<{ path: string; type: string }> };
    const tree = body.tree || [];
    const base = (p.specsPath || '').replace(/^\/+|\/+$/g, '');
    const specRe = /\.(spec|test)\.(t|j)sx?$/;
    return tree
        .filter((n) => n.type === 'blob' && specRe.test(n.path))
        .filter((n) => (base ? n.path.startsWith(`${base}/`) || n.path === base : true))
        .map((n) => ({ path: n.path, name: n.path.split('/').pop() || n.path }))
        .sort((a, b) => a.path.localeCompare(b.path));
}
