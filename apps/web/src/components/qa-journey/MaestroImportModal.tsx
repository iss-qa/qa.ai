'use client';

import { useMemo, useState } from 'react';
import { Loader2, Sparkles, Link2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { updateSubflow } from '@/lib/qa-journey/api';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import type { QAJourneySubflow } from '@/types/qa-journey';

interface Props {
    subflows: QAJourneySubflow[];
    testCases: TestCaseOption[];
    onClose: () => void;
    onSubflowUpdated: (updated: QAJourneySubflow) => void;
}

// Modal que mostra todos os sub-fluxos da jornada e permite vincular
// um test_case Maestro a cada um, em lote.
// Sugere matches por similaridade nome <-> titulo do sub-fluxo.
export function MaestroImportModal({ subflows, testCases, onClose, onSubflowUpdated }: Props) {
    // Map subflow_id -> test_case_id selecionado (incluindo "" = nenhum)
    const [assignments, setAssignments] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        for (const s of subflows) m[s.id] = s.test_case_id || '';
        return m;
    });
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Sugestao: para cada sub-fluxo sem test_case, achar test_case com nome similar
    const suggestions = useMemo(() => {
        const result: Record<string, string> = {};
        const lc = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        for (const s of subflows) {
            if (s.test_case_id) continue;
            const subTitle = lc(s.title);
            // tokens em comum
            const subTokens = subTitle.split(/[^a-z0-9]+/).filter(t => t.length >= 3);
            let best: { tc: TestCaseOption; score: number } | null = null;
            for (const tc of testCases) {
                const tcName = lc(tc.name);
                if (tcName === subTitle) { best = { tc, score: 999 }; break; }
                let score = 0;
                if (tcName.includes(subTitle) || subTitle.includes(tcName)) score += 5;
                for (const t of subTokens) {
                    if (tcName.includes(t)) score += 1;
                }
                if (!best || score > best.score) best = { tc, score };
            }
            if (best && best.score >= 2) result[s.id] = best.tc.id;
        }
        return result;
    }, [subflows, testCases]);

    const applySuggestions = () => {
        setAssignments(prev => {
            const next = { ...prev };
            for (const [subId, tcId] of Object.entries(suggestions)) {
                if (!next[subId]) next[subId] = tcId;
            }
            return next;
        });
    };

    const handleSave = async (subflow: QAJourneySubflow) => {
        const newId = assignments[subflow.id] || null;
        if (newId === (subflow.test_case_id || null)) return; // sem mudanca
        setSavingId(subflow.id);
        setError(null);
        try {
            const updated = await updateSubflow(subflow.id, {
                journey_id: subflow.journey_id,
                title: subflow.title,
                description: subflow.description,
                sequence: subflow.sequence,
                automation_status: subflow.automation_status,
                test_case_id: newId,
            });
            onSubflowUpdated(updated);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSavingId(null);
        }
    };

    const unmatchedCount = Object.keys(suggestions).length;

    return (
        <ModalShell
            title={<><Link2 className="w-5 h-5 text-brand" /> Vincular automação Maestro</>}
            onClose={onClose}
            maxWidth="max-w-4xl"
            footer={
                <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
                    Fechar
                </button>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                    Vincule um <strong className="text-white">test case</strong> do Maestro (da pasta <code className="font-mono text-slate-200">/dashboard/tests</code>) a cada sub-fluxo desta jornada.
                    Sub-fluxos vinculados aparecem com ícone <Link2 className="w-3 h-3 inline" /> no mapa público.
                </p>

                {testCases.length === 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200">
                        Este projeto não tem nenhum test case Maestro cadastrado. Crie testes em <code className="font-mono">/dashboard/tests</code> primeiro.
                    </div>
                )}

                {unmatchedCount > 0 && (
                    <div className="bg-brand/5 border border-brand/30 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-brand inline-flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Identifiquei {unmatchedCount} sugestões de match por similaridade de nome.
                        </span>
                        <button onClick={applySuggestions} className="text-brand font-bold hover:underline">
                            Aplicar sugestões
                        </button>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                        {error}
                    </div>
                )}

                <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-white/10">
                            <tr className="text-left">
                                <th className="px-4 py-3">Sub-fluxo</th>
                                <th className="px-4 py-3">Test case Maestro</th>
                                <th className="px-4 py-3 w-24"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {subflows.length === 0 && (
                                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500 text-xs">
                                    Nenhum sub-fluxo cadastrado nesta jornada.
                                </td></tr>
                            )}
                            {subflows.map(s => {
                                const currentTcId = assignments[s.id] || '';
                                const dirty = currentTcId !== (s.test_case_id || '');
                                const suggestedId = suggestions[s.id];
                                const isSaving = savingId === s.id;
                                return (
                                    <tr key={s.id} className="hover:bg-white/[0.02]">
                                        <td className="px-4 py-3">
                                            <div className="text-white font-medium">{s.title}</div>
                                            {s.description && (
                                                <div className="text-[10px] text-slate-500 truncate max-w-[280px]">{s.description}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={currentTcId}
                                                onChange={e => setAssignments(prev => ({ ...prev, [s.id]: e.target.value }))}
                                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 min-w-[280px]"
                                                disabled={testCases.length === 0}
                                            >
                                                <option value="">— Nenhum —</option>
                                                {testCases.map(tc => (
                                                    <option key={tc.id} value={tc.id}>{tc.name}</option>
                                                ))}
                                            </select>
                                            {suggestedId && !currentTcId && (
                                                <div className="text-[10px] text-brand mt-1 inline-flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Sugestão: <em>{testCases.find(t => t.id === suggestedId)?.name}</em>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleSave(s)}
                                                disabled={!dirty || isSaving}
                                                className="text-xs font-bold text-brand hover:underline disabled:opacity-30 disabled:no-underline disabled:text-slate-500 inline-flex items-center gap-1"
                                            >
                                                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                                Salvar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </ModalShell>
    );
}
