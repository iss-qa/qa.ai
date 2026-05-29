'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchSheetPreview } from '@/lib/qa-journey/sheet-api';
import type { WizardState } from './types';

interface Props {
    state: WizardState;
    update: (patch: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
}

// Step 2: usuario escolhe qual linha eh o header.
// Buscamos as primeiras 8 linhas (sem assumir header_row) e mostramos
// a tabela bruta para o usuario apontar.
export function StepHeaderRow({ state, update, onNext, onBack }: Props) {
    const [rawRows, setRawRows] = useState<string[][]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!state.spreadsheetId || !state.sheetName) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                // Carrega 8 linhas a partir da linha 1, sem aplicar header
                const preview = await fetchSheetPreview(state.spreadsheetId!, state.sheetName, 1, 8);
                if (cancelled) return;
                // headers + rows = sequencia bruta de linhas
                const all: string[][] = [preview.headers, ...preview.rows];
                setRawRows(all);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [state.spreadsheetId, state.sheetName]);

    const handleContinue = async () => {
        if (!state.spreadsheetId) return;
        setLoading(true);
        try {
            const preview = await fetchSheetPreview(state.spreadsheetId, state.sheetName, state.headerRow, 10);
            update({ preview });
            onNext();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-slate-300">
                Marque qual linha da planilha contém os <strong>cabeçalhos das colunas</strong>. As linhas abaixo dela serão tratadas como dados.
            </p>

            {loading && rawRows.length === 0 && (
                <div className="text-slate-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando primeiras linhas…
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
            )}

            {rawRows.length > 0 && (
                <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-auto max-h-[400px]">
                    <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-[#0A0C14] z-10">
                            <tr className="border-b border-white/10">
                                <th className="px-3 py-2 w-16 text-slate-400 font-bold">Header?</th>
                                <th className="px-3 py-2 w-12 text-slate-400 font-bold">#</th>
                                {rawRows[0] && rawRows[0].map((_, i) => (
                                    <th key={i} className="px-3 py-2 text-slate-400 font-bold font-mono">{indexToColumnLetter(i)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rawRows.map((row, rowIdx) => {
                                const sheetRowNum = rowIdx + 1;
                                const isHeader = state.headerRow === sheetRowNum;
                                return (
                                    <tr
                                        key={rowIdx}
                                        className={`border-b border-white/5 cursor-pointer ${isHeader ? 'bg-brand/10' : 'hover:bg-white/[0.02]'}`}
                                        onClick={() => update({ headerRow: sheetRowNum, dataStartRow: sheetRowNum + 1 })}
                                    >
                                        <td className="px-3 py-2">
                                            <input
                                                type="radio"
                                                checked={isHeader}
                                                onChange={() => update({ headerRow: sheetRowNum, dataStartRow: sheetRowNum + 1 })}
                                                className="accent-brand"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-slate-500 font-mono">{sheetRowNum}</td>
                                        {row.map((cell, ci) => (
                                            <td key={ci} className={`px-3 py-2 max-w-[200px] truncate ${isHeader ? 'font-bold text-white' : 'text-slate-300'}`} title={cell}>
                                                {cell || <span className="text-slate-600">—</span>}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="bg-white/[0.02] border border-white/10 rounded-lg px-4 py-3 flex items-center gap-6">
                <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Header</div>
                    <div className="text-sm text-white font-mono">Linha {state.headerRow}</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Dados começam em</div>
                    <input
                        type="number"
                        min={state.headerRow + 1}
                        value={state.dataStartRow}
                        onChange={e => update({ dataStartRow: Math.max(state.headerRow + 1, Number(e.target.value) || 0) })}
                        className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-sm text-white font-mono w-16 focus:outline-none focus:border-brand/50"
                    />
                </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-white/10">
                <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Voltar</button>
                <button
                    onClick={handleContinue}
                    disabled={loading || rawRows.length === 0}
                    className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Avançar
                </button>
            </div>
        </div>
    );
}

// 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA
function indexToColumnLetter(i: number): string {
    let n = i;
    let s = '';
    while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}
