'use client';

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { AUTOMATION_STATUS_OPTIONS, PRIORITY_OPTIONS } from '@/lib/qa-journey/constants';
import type { AutomationStatus, CasePriority } from '@/types/qa-journey';
import type { SheetTransforms } from '@/types/qa-journey-sheet';
import type { WizardState } from './types';
import { QA_JOURNEY_FIELDS } from './types';

interface Props {
    state: WizardState;
    update: (patch: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
}

// Step 4: para campos categoricos com coluna mapeada, mostrar os valores
// unicos encontrados no preview e deixar o usuario mapear cada um para
// o enum QAMind.
export function StepTransforms({ state, update, onNext, onBack }: Props) {

    const categoricalFields = QA_JOURNEY_FIELDS
        .filter(f => f.categorical)
        .filter(f => Boolean(state.columnMap[f.key]));

    // Coleta valores unicos da preview para cada campo categorical
    const uniqueValuesByField = useMemo(() => {
        const m: Record<string, Set<string>> = {};
        if (!state.preview) return m;
        for (const field of categoricalFields) {
            const colName = state.columnMap[field.key];
            if (!colName) continue;
            const colIdx = state.preview.headers.indexOf(colName);
            if (colIdx < 0) continue;
            const set = new Set<string>();
            for (const row of state.preview.rows) {
                const v = (row[colIdx] || '').toString().trim();
                if (v) set.add(v);
            }
            m[field.key] = set;
        }
        return m;
    }, [categoricalFields, state.columnMap, state.preview]);

    const setTransform = (
        fieldKey: 'priority' | 'automation_status',
        sourceValue: string,
        targetValue: string,
    ) => {
        const cur = (state.transforms[fieldKey] || {}) as Record<string, string>;
        const next = { ...cur };
        if (targetValue) next[sourceValue] = targetValue;
        else delete next[sourceValue];
        update({
            transforms: {
                ...state.transforms,
                [fieldKey]: next,
            } as SheetTransforms,
        });
    };

    // Auto-sugestao: se o valor da planilha ja eh um enum valido, marca como mapeado
    const guessTarget = (fieldKey: 'priority' | 'automation_status', sourceValue: string): string => {
        const cur = (state.transforms[fieldKey] || {}) as Record<string, string>;
        if (cur[sourceValue]) return cur[sourceValue];
        const lower = sourceValue.toLowerCase();
        if (fieldKey === 'priority') {
            const map: Record<string, CasePriority> = {
                low: 'low', baixa: 'low', baixo: 'low',
                medium: 'medium', média: 'medium', media: 'medium',
                high: 'high', alta: 'high', alto: 'high',
                critical: 'critical', crítica: 'critical', critica: 'critical', critico: 'critical',
            };
            return map[lower] || '';
        }
        if (fieldKey === 'automation_status') {
            const map: Record<string, AutomationStatus> = {
                automated: 'automated', automatizado: 'automated', sim: 'automated', 'em dia': 'automated',
                partial: 'partial', parcial: 'partial',
                manual: 'manual', nao: 'manual', não: 'manual',
                none: 'none', 'sem cobertura': 'none', 'nenhum': 'none',
            };
            return map[lower] || '';
        }
        return '';
    };

    if (categoricalFields.length === 0) {
        return (
            <div className="flex flex-col gap-5">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-blue-300 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    Nenhum campo categórico mapeado a partir de coluna — nada para transformar. Pode avançar.
                </div>
                <div className="flex justify-between pt-4 border-t border-white/10">
                    <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Voltar</button>
                    <button onClick={onNext} className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90">Avançar</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <p className="text-sm text-slate-300">
                Para cada valor encontrado nas colunas categóricas da planilha, escolha o equivalente QAMind.
                Valores não mapeados serão tratados como o default do campo (ou ignorados).
            </p>

            {categoricalFields.map(field => {
                const fieldKey = field.categorical!;
                const values = Array.from(uniqueValuesByField[field.key] || []).sort();
                const options = fieldKey === 'priority' ? PRIORITY_OPTIONS : AUTOMATION_STATUS_OPTIONS;
                return (
                    <div key={field.key} className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-white/[0.02] border-b border-white/10">
                            <div className="text-xs font-bold text-white">{field.label}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Coluna: <span className="font-mono">{state.columnMap[field.key]}</span></div>
                        </div>
                        {values.length === 0 ? (
                            <div className="p-4 text-xs text-slate-500">Nenhum valor encontrado nas primeiras 10 linhas. Será aplicado o default.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/5 text-left">
                                        <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400 font-bold w-1/2">Valor na planilha</th>
                                        <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400 font-bold">→ QAMind</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {values.map(value => {
                                        const target = guessTarget(fieldKey, value);
                                        return (
                                            <tr key={value} className="border-b border-white/5">
                                                <td className="px-4 py-2 font-mono text-xs text-slate-300">&quot;{value}&quot;</td>
                                                <td className="px-4 py-2">
                                                    <select
                                                        value={target}
                                                        onChange={e => setTransform(fieldKey, value, e.target.value)}
                                                        className={inputClass + ' min-w-[180px]'}
                                                    >
                                                        <option value="">— Usar default —</option>
                                                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                );
            })}

            <div className="flex justify-between pt-4 border-t border-white/10">
                <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Voltar</button>
                <button onClick={onNext} className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90">Avançar</button>
            </div>
        </div>
    );
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';
