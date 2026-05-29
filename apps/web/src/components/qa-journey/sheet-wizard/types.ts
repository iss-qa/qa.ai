// Estado interno compartilhado pelos 5 steps do wizard.

import type { ColumnMap, SheetDefaults, SheetTransforms, SheetTab, SheetPreview } from '@/types/qa-journey-sheet';

export interface WizardState {
    projectId: string;
    spreadsheetUrl: string;
    spreadsheetId: string | null;
    tabs: SheetTab[];
    sheetName: string;
    headerRow: number;
    dataStartRow: number;
    preview: SheetPreview | null;
    columnMap: ColumnMap;
    defaults: SheetDefaults;
    transforms: SheetTransforms;
}

export const QA_JOURNEY_FIELDS: { key: keyof ColumnMap; label: string; required: boolean; categorical?: 'priority' | 'automation_status' }[] = [
    { key: 'external_id',      label: 'ID externo (chave única)',          required: true },
    { key: 'journey',          label: 'Jornada (módulo macro)',            required: true },
    { key: 'subflow',          label: 'Sub-fluxo (funcionalidade)',        required: true },
    { key: 'title',            label: 'Título do caso',                    required: true },
    { key: 'steps_summary',    label: 'Resumo dos passos',                 required: false },
    { key: 'expected_result',  label: 'Resultado esperado',                required: false },
    { key: 'priority',         label: 'Prioridade',                        required: false, categorical: 'priority' },
    { key: 'automation_status',label: 'Status de automação',               required: false, categorical: 'automation_status' },
    { key: 'last_run_status',  label: 'Status da última execução',         required: false },
];
