'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { runSync, upsertSheetConfig } from '@/lib/qa-journey/sheet-api';
import type { ColumnMap, SheetDefaults, SheetTransforms } from '@/types/qa-journey-sheet';
import type { WizardState } from './types';
import { QA_JOURNEY_FIELDS } from './types';

interface Props {
    state: WizardState;
    onBack: () => void;
}

// Step 5: aplica o mapping local nas primeiras 10 linhas e mostra como ficariam.
// Botoes: "Salvar configuracao" (sem sync) e "Salvar e sincronizar agora".
export function StepPreview({ state, onBack }: Props) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mappedRows = useMemo(() => applyMapping(state), [state]);

    const saveOnly = async () => {
        setError(null);
        setSaving(true);
        try {
            await upsertSheetConfig({
                project_id: state.projectId,
                spreadsheet_id: state.spreadsheetId!,
                sheet_name: state.sheetName,
                header_row: state.headerRow,
                data_start_row: state.dataStartRow,
                column_map: state.columnMap,
                defaults: state.defaults,
                transforms: state.transforms,
            });
            router.push(`/dashboard/qa-journey/admin/sheets?project=${state.projectId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSaving(false);
        }
    };

    const saveAndSync = async () => {
        setError(null);
        setSaving(true);
        try {
            const config = await upsertSheetConfig({
                project_id: state.projectId,
                spreadsheet_id: state.spreadsheetId!,
                sheet_name: state.sheetName,
                header_row: state.headerRow,
                data_start_row: state.dataStartRow,
                column_map: state.columnMap,
                defaults: state.defaults,
                transforms: state.transforms,
            });
            setSaving(false);
            setRunning(true);
            await runSync(config.id);
            router.push(`/dashboard/qa-journey/admin/sheets?project=${state.projectId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSaving(false);
            setRunning(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-slate-300">
                Preview de como as primeiras linhas serão importadas. Confira antes de salvar.
            </p>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-auto max-h-[400px]">
                <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-[#0A0C14] z-10">
                        <tr className="border-b border-white/10">
                            <th className="px-3 py-2 w-12 text-slate-400 font-bold">#</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">ID externo</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Jornada</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Sub-fluxo</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Título</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Prioridade</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Automação</th>
                            <th className="px-3 py-2 text-slate-400 font-bold">Validação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mappedRows.map((row, i) => {
                            const sheetRow = state.dataStartRow + i;
                            return (
                                <tr key={i} className={row.valid ? 'border-b border-white/5' : 'border-b border-white/5 bg-red-500/5'}>
                                    <td className="px-3 py-2 text-slate-500 font-mono">{sheetRow}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.values.external_id || '—'}</td>
                                    <td className="px-3 py-2 text-slate-200">{row.values.journey || '—'}</td>
                                    <td className="px-3 py-2 text-slate-200">{row.values.subflow || '—'}</td>
                                    <td className="px-3 py-2 text-slate-200 max-w-[200px] truncate">{row.values.title || '—'}</td>
                                    <td className="px-3 py-2 text-slate-300">{row.values.priority || '—'}</td>
                                    <td className="px-3 py-2 text-slate-300">{row.values.automation_status || '—'}</td>
                                    <td className="px-3 py-2">
                                        {row.valid
                                            ? <span className="text-green-400 inline-flex items-center gap-1 text-xs"><CheckCircle2 className="w-3 h-3" />OK</span>
                                            : <span className="text-red-400 text-xs">{row.reason}</span>}
                                    </td>
                                </tr>
                            );
                        })}
                        {mappedRows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-6 text-center text-slate-500 text-xs">
                                    Nenhuma linha encontrada nas primeiras 10 da planilha. Verifique se "data_start_row" está correto.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
            )}

            <div className="flex justify-between pt-4 border-t border-white/10">
                <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Voltar</button>
                <div className="flex gap-3">
                    <button
                        onClick={saveOnly}
                        disabled={saving || running}
                        className="border border-white/10 text-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-white/5 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && !running && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Save className="w-4 h-4" />
                        Salvar sem sincronizar
                    </button>
                    <button
                        onClick={saveAndSync}
                        disabled={saving || running}
                        className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {(saving || running) && <Loader2 className="w-4 h-4 animate-spin" />}
                        {running ? 'Sincronizando…' : 'Salvar e sincronizar agora'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Aplica o column_map + defaults + transforms localmente para gerar
// o preview - mesmo algoritmo (simplificado) do backend.
interface MappedRow {
    values: Partial<Record<keyof ColumnMap, string>>;
    valid: boolean;
    reason: string;
}

function applyMapping(state: WizardState): MappedRow[] {
    if (!state.preview) return [];
    return state.preview.rows.map(row => {
        const values: Partial<Record<keyof ColumnMap, string>> = {};
        for (const field of QA_JOURNEY_FIELDS) {
            const colName = state.columnMap[field.key];
            if (colName) {
                const idx = state.preview!.headers.indexOf(colName);
                const raw = idx >= 0 ? (row[idx] || '').toString().trim() : '';
                if (raw) {
                    const tx = (state.transforms as Record<string, Record<string, string>>)[field.key as string];
                    values[field.key] = tx?.[raw] || raw;
                    continue;
                }
            }
            const def = (state.defaults as Record<string, string | undefined>)[field.key as string];
            if (def) values[field.key] = def;
        }
        const missing = QA_JOURNEY_FIELDS
            .filter(f => f.required)
            .find(f => !values[f.key]);
        return {
            values,
            valid: !missing,
            reason: missing ? `falta ${missing.label}` : '',
        };
    });
}
