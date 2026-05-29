// Types para o dashboard executivo (Etapa 9.5).

export interface QAJourneySnapshot {
    id: string;
    project_id: string;
    snapshot_date: string;          // YYYY-MM-DD
    total_journeys: number;
    total_subflows: number;
    total_cases: number;
    automated_subflows: number;
    partial_subflows: number;
    manual_subflows: number;
    open_bugs_count: number;
    open_tasks_count: number;
    pass_rate_7d: number | null;
    created_at: string;
}

// Aggregate calculado em runtime a partir das tabelas atuais
export interface InsightsAggregate {
    total_journeys: number;
    total_subflows: number;
    total_cases: number;
    automated_subflows: number;
    partial_subflows: number;
    manual_subflows: number;
    no_coverage_subflows: number;
    automation_pct: number;          // 0-100
    open_bugs_count: number;
    open_tasks_count: number;
    last_sync_at: string | null;
}

// Linha do treemap (1 por jornada)
export interface JourneyTreemapDatum {
    journey_id: string;
    title: string;
    color: string;
    case_count: number;
    automation_pct: number;          // 0-100, cor do bloco
    subflow_total: number;
    subflow_automated: number;
}

// Linha "Gap" — sub-fluxo sem cobertura
export interface CoverageGap {
    subflow_id: string;
    journey_id: string;
    journey_title: string;
    subflow_title: string;
    automation_status: string;
    case_count: number;
    has_test_case: boolean;
}
