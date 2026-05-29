// Types para sheet configs + syncs da Jornada do QA.
// Espelha qa_journey_sheet_configs e qa_journey_syncs.

import type { AutomationStatus, CasePriority } from '@/types/qa-journey';

// ============================================================
// Sheet config
// ============================================================

export type QAJourneyField =
    | 'external_id'
    | 'journey'
    | 'subflow'
    | 'title'
    | 'steps_summary'
    | 'expected_result'
    | 'priority'
    | 'automation_status'
    | 'last_run_status';

// Map: campo QAMind -> nome da coluna na planilha (ou null = nao tenho)
export type ColumnMap = Partial<Record<QAJourneyField, string | null>>;

// Defaults para campos sem coluna mapeada
export interface SheetDefaults {
    priority?: CasePriority;
    automation_status?: AutomationStatus;
    last_run_status?: string;
}

// Transforms para campos categoricos: valor da planilha -> valor QAMind
export interface SheetTransforms {
    priority?: Record<string, CasePriority>;
    automation_status?: Record<string, AutomationStatus>;
}

export interface QAJourneySheetConfig {
    id: string;
    project_id: string;
    spreadsheet_id: string;
    sheet_name: string;
    header_row: number;
    data_start_row: number;
    column_map: ColumnMap;
    defaults: SheetDefaults;
    transforms: SheetTransforms;
    is_active: boolean;
    last_sync_at: string | null;
    created_at: string;
}

export interface QAJourneySheetConfigDraft {
    project_id: string;
    spreadsheet_id: string;
    sheet_name: string;
    header_row: number;
    data_start_row: number;
    column_map: ColumnMap;
    defaults: SheetDefaults;
    transforms: SheetTransforms;
}

// ============================================================
// Sync record
// ============================================================

export type SyncSource = 'google_sheets' | 'jira' | 'manual';
export type SyncStatus = 'running' | 'success' | 'error';

export interface QAJourneySync {
    id: string;
    project_id: string;
    source: SyncSource;
    source_ref: string | null;
    status: SyncStatus;
    rows_imported: number;
    rows_updated: number;
    rows_skipped: number;
    error_message: string | null;
    started_at: string;
    finished_at: string | null;
}

// ============================================================
// Sheet preview (wizard step 2)
// ============================================================

export interface SheetTab {
    sheetId: number;
    title: string;
    rowCount: number;
    columnCount: number;
}

export interface SheetPreview {
    headers: string[];
    rows: string[][];
    totalRows: number;
}

// ============================================================
// Sync result (retornado pelo endpoint sync)
// ============================================================

export interface SyncRunResult {
    sync_id: string;
    status: SyncStatus;
    rows_imported: number;
    rows_updated: number;
    rows_skipped: number;
    skipped_reasons: { row: number; reason: string }[];
    error_message: string | null;
}
