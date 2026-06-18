// Tipos da feature "Jornada do QA" (Parte 9).
// Espelham o schema definido em supabase/migrations/006_qa_journey.sql.

export type AutomationStatus = 'automated' | 'partial' | 'manual' | 'none';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';
export type CaseRunStatus = 'pass' | 'fail' | 'skipped' | 'not_run';
export type SyncSource = 'google_sheets' | 'jira' | 'manual';
export type SyncStatus = 'running' | 'success' | 'error';
// Modo de escrita do caso (migration 017).
export type CaseWritingMode = 'traditional' | 'gherkin';

export interface QAJourney {
    id: string;
    project_id: string;
    slug: string;
    title: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    sequence: number;
    is_published: boolean;
    // Documento HTML completo importado pelo admin (migration 008).
    // Renderizado em iframe sandbox quando a jornada é aberta no mapa.
    html_doc?: string | null;
    created_at: string;
    updated_at: string;
}

export interface QAJourneySubflow {
    id: string;
    journey_id: string;
    // Subfluxo pai (migration 015). NULL = raiz da jornada; preenchido = filho,
    // formando a árvore de subfluxos.
    parent_subflow_id?: string | null;
    title: string;
    description: string | null;
    sequence: number;
    automation_status: AutomationStatus;
    test_case_id: string | null;
    jira_query: string | null;
    // Documento HTML completo importado pelo admin (espelha o campo da jornada).
    // Renderizado em iframe sandbox quando o sub-fluxo é aberto no mapa.
    html_doc?: string | null;
    created_at: string;
    updated_at: string;
}

export interface QAJourneyCase {
    id: string;
    subflow_id: string;
    external_id: string | null;
    title: string;
    // Modo de escrita (migration 017). 'gherkin' usa o campo `gherkin`; os
    // campos description/steps_summary/expected_result ficam vazios.
    writing_mode?: CaseWritingMode;
    description?: string | null;
    gherkin?: string | null;
    steps_summary: string | null;
    expected_result: string | null;
    priority: CasePriority;
    // Teste Maestro vinculado (migration 016). Preenchido = caso automatizado;
    // null/ausente = manual.
    test_case_id?: string | null;
    // Plataforma/ambiente do caso (Web, Mobile, API, ...) — migration 009.
    platform?: string | null;
    // Evidência da última execução manual (migration 010).
    evidence_url?: string | null;
    evidence_type?: 'image' | 'video' | null;
    last_run_status: CaseRunStatus | null;
    last_run_at: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

// Variante "draft" usada em forms: campos opcionais para criacao.
export type QAJourneyDraft = Partial<QAJourney> & {
    project_id: string;
    slug: string;
    title: string;
};

export type QAJourneySubflowDraft = Partial<QAJourneySubflow> & {
    journey_id: string;
    title: string;
};

export type QAJourneyCaseDraft = Partial<QAJourneyCase> & {
    subflow_id: string;
    title: string;
};

// Alvo da migracao (codigo Postgres) quando a tabela ainda nao existe.
export const QA_JOURNEY_MIGRATION_MISSING_CODE = '42P01';
