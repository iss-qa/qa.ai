// Wrapper fetch para abrir um bug no Jira a partir de um caso reprovado.
// O backend Fastify (rota /qa-journey/cases/:caseId/jira-bug) e quem fala com
// o Jira — as credenciais ficam no servidor, nunca no browser.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CreatedJiraBug {
    key: string;
    url: string;
    self: string;
}

/**
 * Abre um bug no Jira para o caso `caseId`, incluindo a descricao detalhada
 * do problema informada pelo QA. Retorna a key + url da issue criada.
 */
export async function createJiraBugForCase(
    caseId: string,
    description: string,
): Promise<CreatedJiraBug> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}/qa-journey/cases/${caseId}/jira-bug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description }),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Backend Fastify offline em ${API_URL} (${msg}). Suba com: pnpm --filter api dev`);
    }

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
    return res.json() as Promise<CreatedJiraBug>;
}
