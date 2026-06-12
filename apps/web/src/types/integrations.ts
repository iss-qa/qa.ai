// Tipos espelhando o schema de org_integrations.
// Credenciais NUNCA voltam para o cliente - so metadata.

export type IntegrationProvider = 'google_sheets' | 'jira' | 'slack';

export interface IntegrationRecord {
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

// Metadados especificos do Google Sheets (mostrados na UI)
export interface GoogleSheetsMetadata {
    client_email?: string;
    project_id?: string | null;
}

// Metadados especificos do Jira (mostrados na UI)
export interface JiraMetadata {
    host?: string;
    email?: string;
}

// Metadados especificos do Slack (mostrados na UI — nunca o webhook completo)
export interface SlackMetadata {
    webhook_masked?: string;
    default_channel?: string | null;
}

// Inputs (so o que o cliente envia, sem dados sensiveis vindos do servidor)
export interface GoogleSheetsCredentialsInput {
    client_email: string;
    private_key: string;
    project_id?: string;
    [key: string]: unknown;
}

export interface JiraCredentialsInput {
    host: string;
    email: string;
    api_token: string;
}

export interface SlackCredentialsInput {
    webhook_url: string;
    default_channel?: string;
}

export interface IntegrationTestResult {
    ok: boolean;
    detail: string;
}
