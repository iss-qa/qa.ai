// Abertura automatica de bug no Jira a partir de um caso de teste da Jornada do QA.
//
// Conexao via REST API v3 (Atlassian Document Format / ADF), Basic auth com
// email + API token. As credenciais vem do ambiente (NUNCA do browser):
//   JIRA_USER_EMAIL  - email da conta Atlassian
//   JIRA_API_TOKEN   - token gerado em id.atlassian.com
//   JIRA_HOST        - opcional, default "foxbit.atlassian.net"
//   JIRA_PROJECT_KEY - opcional, default "INNO"
//   JIRA_ISSUE_TYPE  - opcional, default "Bug"
//
// Modelado no script .github/scripts/{generate-jira-payload,send-to-jira}.js
// que ja roda em produçao na automaçao E2E.

// Tipos espelhados de qa_journey_cases (web define os mesmos em
// @/types/qa-journey; a API e isolada, entao replicamos o necessario).
type CasePriority = 'low' | 'medium' | 'high' | 'critical';
type CaseRunStatus = 'pass' | 'fail' | 'skipped' | 'not_run';
type CaseWritingMode = 'traditional' | 'gherkin';

// Espelha o registro de qa_journey_cases que precisamos para montar o bug.
export interface JiraBugCase {
    id: string;
    external_id: string | null;
    title: string;
    writing_mode?: CaseWritingMode | null;
    description?: string | null;
    gherkin?: string | null;
    steps_summary?: string | null;
    expected_result?: string | null;
    priority: CasePriority;
    platform?: string | null;
    evidence_url?: string | null;
    last_run_status?: CaseRunStatus | null;
}

export interface CreatedJiraBug {
    key: string;
    url: string;
    self: string;
}

// ------------------------------------------------------------
// Config de ambiente
// ------------------------------------------------------------

interface JiraConfig {
    host: string;
    email: string;
    token: string;
    projectKey: string;
    issueType: string;
}

function loadConfig(): JiraConfig {
    const email = (process.env.JIRA_USER_EMAIL || '').trim();
    const token = (process.env.JIRA_API_TOKEN || '').trim();
    if (!email || !token) {
        throw Object.assign(
            new Error('Jira nao configurado: defina JIRA_USER_EMAIL e JIRA_API_TOKEN no ambiente da API.'),
            { statusCode: 412 },
        );
    }
    const host = (process.env.JIRA_HOST || 'foxbit.atlassian.net')
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .trim();
    return {
        host,
        email,
        token,
        projectKey: (process.env.JIRA_PROJECT_KEY || 'INNO').trim(),
        issueType: (process.env.JIRA_ISSUE_TYPE || 'Bug').trim(),
    };
}

// Prioridade do caso (low/medium/high/critical) -> nome de prioridade do Jira.
function mapPriority(priority: CasePriority): string {
    switch (priority) {
        case 'critical': return 'Highest';
        case 'high': return 'High';
        case 'medium': return 'Medium';
        case 'low': return 'Low';
        default: return 'Medium';
    }
}

const PRIORITY_LABEL: Record<CasePriority, string> = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
};

// ------------------------------------------------------------
// ADF helpers
// ------------------------------------------------------------

type AdfNode = Record<string, unknown>;

function heading(text: string, level = 3): AdfNode {
    return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function paragraph(text: string): AdfNode {
    return { type: 'paragraph', content: [{ type: 'text', text }] };
}

// Paragrafo "Rotulo: valor" com o rotulo em negrito.
function labeled(label: string, value: string): AdfNode {
    return {
        type: 'paragraph',
        content: [
            { type: 'text', text: `${label}: `, marks: [{ type: 'strong' }] },
            { type: 'text', text: value },
        ],
    };
}

function codeBlock(text: string): AdfNode {
    return { type: 'codeBlock', attrs: {}, content: [{ type: 'text', text }] };
}

function buildDescription(case_: JiraBugCase, userDescription: string): AdfNode {
    const isGherkin =
        case_.writing_mode === 'gherkin' || Boolean(case_.gherkin && case_.gherkin.trim());

    const content: AdfNode[] = [];

    content.push(heading('🔴 Falha registrada via QAMind', 2));

    // Metadados do caso
    if (case_.external_id) content.push(labeled('Caso (ID)', case_.external_id));
    if (case_.platform) content.push(labeled('Plataforma', case_.platform));
    content.push(labeled('Prioridade', PRIORITY_LABEL[case_.priority] || case_.priority));

    // Descricao detalhada do problema informada pelo QA
    if (userDescription && userDescription.trim()) {
        content.push(heading('Descrição do problema'));
        content.push(paragraph(userDescription.trim()));
    }

    if (isGherkin) {
        content.push(heading('Cenário Gherkin'));
        content.push(codeBlock((case_.gherkin || '').trim() || 'Nenhum cenário Gherkin informado.'));
    } else {
        // Estilo tradicional: todos os demais campos do caso.
        if (case_.description && case_.description.trim()) {
            content.push(heading('Descrição do caso'));
            content.push(paragraph(case_.description.trim()));
        }
        content.push(heading('Passos'));
        content.push(paragraph((case_.steps_summary || '').trim() || 'Nenhum passo descrito.'));
        content.push(heading('Resultado esperado'));
        content.push(paragraph((case_.expected_result || '').trim() || 'Não informado.'));
    }

    if (case_.evidence_url) {
        content.push(heading('Evidência'));
        content.push({
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: case_.evidence_url,
                    marks: [{ type: 'link', attrs: { href: case_.evidence_url } }],
                },
            ],
        });
    }

    content.push(heading('ℹ️ Informações adicionais'));
    content.push(paragraph('Bug aberto automaticamente pelo QAMind ao marcar este caso como FALHOU.'));

    return { type: 'doc', version: 1, content };
}

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

/**
 * Abre um bug no Jira a partir de um caso de teste reprovado.
 * @returns key + url da issue criada.
 */
export async function createBugFromCase(
    case_: JiraBugCase,
    userDescription = '',
): Promise<CreatedJiraBug> {
    const cfg = loadConfig();

    // Titulo do card = titulo do cenario (limite de 255 do Jira).
    const summary = `[QA] ${case_.title}`.slice(0, 255);

    const payload = {
        fields: {
            project: { key: cfg.projectKey },
            issuetype: { name: cfg.issueType },
            summary,
            priority: { name: mapPriority(case_.priority) },
            description: buildDescription(case_, userDescription),
            labels: ['qamind', 'qa-journey', 'manual-fail'],
        },
    };

    const url = `https://${cfg.host}/rest/api/3/issue`;
    const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (res.status !== 201) {
        // Repassa o detalhe do Jira para facilitar o diagnostico (ex: prioridade
        // ou tipo de issue inexistente no projeto).
        let detail = text;
        try {
            const err = JSON.parse(text) as { errors?: Record<string, string>; errorMessages?: string[] };
            const parts = [
                ...(err.errorMessages || []),
                ...Object.entries(err.errors || {}).map(([k, v]) => `${k}: ${v}`),
            ];
            if (parts.length) detail = parts.join('; ');
        } catch {
            /* resposta nao-JSON: usa o texto cru */
        }
        throw Object.assign(
            new Error(`Jira respondeu HTTP ${res.status}: ${detail.slice(0, 500)}`),
            { statusCode: 502 },
        );
    }

    const data = JSON.parse(text) as { key: string; self: string };
    return {
        key: data.key,
        self: data.self,
        url: `https://${cfg.host}/browse/${data.key}`,
    };
}

/**
 * Abre um bug genérico no Jira (sem caso de Jornada vinculado).
 * Usado pelo BugTracker para criar tickets a partir do formulário manual.
 */
export async function createBugGeneral(opts: {
    title: string;
    description?: string;
    priority?: CasePriority;
    source?: string;
}): Promise<CreatedJiraBug> {
    const cfg = loadConfig();
    const summary = `[QA] ${opts.title}`.slice(0, 255);
    const desc: object = {
        type: 'doc',
        version: 1,
        content: [
            {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: '🔴 Bug reportado via QAMind' }],
            },
            ...(opts.description ? [{
                type: 'paragraph',
                content: [{ type: 'text', text: opts.description }],
            }] : []),
            {
                type: 'paragraph',
                content: [{ type: 'text', text: `Fonte: ${opts.source || 'manual'} | Prioridade: ${opts.priority || 'medium'}`, marks: [{ type: 'em' }] }],
            },
        ],
    };
    const payload = {
        fields: {
            project: { key: cfg.projectKey },
            issuetype: { name: cfg.issueType },
            summary,
            priority: { name: mapPriority((opts.priority as CasePriority) || 'medium') },
            description: desc,
            labels: ['qamind', 'manual'],
        },
    };
    const url = `https://${cfg.host}/rest/api/3/issue`;
    const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (res.status !== 201) {
        let detail = text;
        try {
            const err = JSON.parse(text) as { errors?: Record<string, string>; errorMessages?: string[] };
            const parts = [...(err.errorMessages || []), ...Object.entries(err.errors || {}).map(([k, v]) => `${k}: ${v}`)];
            if (parts.length) detail = parts.join('; ');
        } catch { /* resposta nao-JSON */ }
        throw Object.assign(new Error(`Jira respondeu HTTP ${res.status}: ${detail.slice(0, 500)}`), { statusCode: 502 });
    }
    const data = JSON.parse(text) as { key: string; self: string };
    return { key: data.key, self: data.self, url: `https://${cfg.host}/browse/${data.key}` };
}

/** Retorna true se as credenciais Jira estão configuradas (sem lançar exceção). */
export function isJiraConfigured(): boolean {
    return !!(process.env.JIRA_USER_EMAIL?.trim() && process.env.JIRA_API_TOKEN?.trim());
}
