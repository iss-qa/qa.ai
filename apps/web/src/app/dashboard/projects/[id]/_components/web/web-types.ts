// Tipos do fluxo de testes Web (Playwright via GitHub Actions).

export interface WebConfig {
    project_id: string;
    repo_owner: string;
    repo_name: string;
    default_branch: string;
    workflow_file: string;
    specs_path: string;
    has_ingest_token: boolean;
}

export interface WebConfigInput {
    projectId: string;
    repo_owner: string;
    repo_name: string;
    default_branch?: string;
    workflow_file: string;
    specs_path?: string;
    rotateToken?: boolean;
}

export interface SaveConfigResponse {
    config: WebConfig;
    ingest_token: string | null; // só presente quando um token novo é gerado
    ingest_url: string;          // URL BASE da API (valor do secret QAMIND_INGEST_URL)
    ingest_url_example: string;  // ex.: {base}/web-runs/<runId>/ingest (ilustrativo)
    is_public: boolean;          // false quando a base é localhost (não alcançável pelo runner)
}

export interface RepoSpec {
    path: string;
    name: string;
}

export interface WebConfigSummary {
    project_id: string;
    project_name: string;
    repo_owner: string;
    repo_name: string;
    default_branch: string;
    specs_path: string;
}

export type WebRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';

export interface WebRun {
    id: string;
    status: WebRunStatus;
    trigger: string;
    branch: string | null;
    spec: string | null;
    commit_sha: string | null;
    gh_run_url: string | null;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    duration_ms: number | null;
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
    error_message: string | null;
}

export type WebResultStatus = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedOut' | 'interrupted';

export interface WebResultAttachment {
    name: string;
    contentType: string | null;
    path: string | null;
}

export interface WebResult {
    id: string;
    spec_file: string | null;
    title: string | null;
    status: WebResultStatus | null;
    duration_ms: number | null;
    retries: number;
    error_message: string | null;
    attachments: WebResultAttachment[];
    qa_journey_case_id: string | null;
}

export const RUN_ACTIVE: WebRunStatus[] = ['queued', 'running'];

export function isRunActive(status: WebRunStatus): boolean {
    return RUN_ACTIVE.includes(status);
}
