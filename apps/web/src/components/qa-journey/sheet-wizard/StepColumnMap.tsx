'use client';

import { AlertCircle } from 'lucide-react';
import type { ColumnMap, SheetDefaults } from '@/types/qa-journey-sheet';
import type { WizardState } from './types';
import { QA_JOURNEY_FIELDS } from './types';
import { PRIORITY_OPTIONS } from '@/lib/qa-journey/constants';
import { AUTOMATION_STATUS_OPTIONS } from '@/lib/qa-journey/constants';

interface Props {
    state: WizardState;
    update: (patch: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
}

// Step 3: para cada campo QAMind, escolher de qual coluna da planilha vem.
// Campos required precisam de uma coluna. Os outros podem usar default.
export function StepColumnMap({ state, update, onNext, onBack }: Props) {
    const headers = state.preview?.headers || [];

    const setColumn = (field: keyof ColumnMap, value: string) => {
        const nextMap: ColumnMap = { ...state.columnMap, [field]: value || null };
        update({ columnMap: nextMap });
    };

    const setDefault = (field: keyof SheetDefaults, value: string) => {
        const nextDefaults = { ...state.defaults, [field]: value || undefined };
        update({ defaults: nextDefaults as SheetDefaults });
    };

    const missingRequired = QA_JOURNEY_FIELDS
        .filter(f => f.required)
        .filter(f => !state.columnMap[f.key]);

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-slate-300">
                Para cada campo do QAMind, escolha qual coluna da planilha contém esse dado.
                Os campos marcados com <span className="text-red-400 font-bold">*</span> são obrigatórios.
                Para os outros, você pode deixar sem coluna e definir um valor padrão.
            </p>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/10 text-left">
                            <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-bold">Campo QAMind</th>
                            <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-bold">Coluna da planilha</th>
                            <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-bold">Default</th>
                        </tr>
                    </thead>
                    <tbody>
                        {QA_JOURNEY_FIELDS.map(field => {
                            const selectedColumn = state.columnMap[field.key] ?? '';
                            const defaultValue =
                                field.key === 'priority' ? state.defaults.priority :
                                field.key === 'automation_status' ? state.defaults.automation_status :
                                field.key === 'last_run_status' ? state.defaults.last_run_status :
                                undefined;
                            return (
                                <tr key={field.key} className="border-b border-white/5">
                                    <td className="px-4 py-3 text-white font-medium">
                                        {field.label}
                                        {field.required && <span className="text-red-400 ml-1">*</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={selectedColumn}
                                            onChange={e => setColumn(field.key, e.target.value)}
                                            className={inputClass + ' min-w-[200px]'}
                                        >
                                            <option value="">— Não tenho —</option>
                                            {headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        {field.categorical === 'priority' && (
                                            <select
                                                value={defaultValue || ''}
                                                onChange={e => setDefault('priority', e.target.value)}
                                                className={inputClass + ' min-w-[140px]'}
                                                disabled={Boolean(selectedColumn)}
                                            >
                                                <option value="">—</option>
                                                {PRIORITY_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        )}
                                        {field.categorical === 'automation_status' && (
                                            <select
                                                value={defaultValue || ''}
                                                onChange={e => setDefault('automation_status', e.target.value)}
                                                className={inputClass + ' min-w-[140px]'}
                                                disabled={Boolean(selectedColumn)}
                                            >
                                                <option value="">—</option>
                                                {AUTOMATION_STATUS_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        )}
                                        {field.key === 'last_run_status' && (
                                            <input
                                                type="text"
                                                value={defaultValue || ''}
                                                onChange={e => setDefault('last_run_status', e.target.value)}
                                                placeholder="—"
                                                className={inputClass + ' min-w-[140px]'}
                                                disabled={Boolean(selectedColumn)}
                                            />
                                        )}
                                        {!field.categorical && field.key !== 'last_run_status' && (
                                            <span className="text-slate-500 text-xs">{selectedColumn ? '—' : 'não aplicável'}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {missingRequired.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        Falta mapear: <strong>{missingRequired.map(f => f.label).join(', ')}</strong>. Esses campos são obrigatórios.
                    </div>
                </div>
            )}

            <div className="flex justify-between pt-4 border-t border-white/10">
                <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Voltar</button>
                <button
                    onClick={onNext}
                    disabled={missingRequired.length > 0}
                    className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50"
                >
                    Avançar
                </button>
            </div>
        </div>
    );
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';
