'use client';

import { useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { PRIORITY_OPTIONS, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import type { QAJourneyCase, QAJourneyCaseDraft, CasePriority, CaseRunStatus } from '@/types/qa-journey';

interface CaseFormModalProps {
    subflowId: string;
    subflowTitle?: string;   // nome do sub-fluxo pai, exibido no título do modal
    initial?: QAJourneyCase | null;
    // Testes Maestro do projeto, para vincular quando o caso for automatizado.
    testCases?: TestCaseOption[];
    onClose: () => void;
    onSave: (draft: QAJourneyCaseDraft) => Promise<void>;
}

export function CaseFormModal({ subflowId, subflowTitle, initial, testCases = [], onClose, onSave }: CaseFormModalProps) {
    const [draft, setDraft] = useState<QAJourneyCaseDraft>(() => ({
        subflow_id: subflowId,
        external_id: initial?.external_id ?? '',
        title: initial?.title ?? '',
        steps_summary: initial?.steps_summary ?? '',
        expected_result: initial?.expected_result ?? '',
        priority: initial?.priority ?? 'medium',
        last_run_status: initial?.last_run_status ?? null,
        test_case_id: initial?.test_case_id ?? null,
        // undefined = campo não tocado (não vai no payload — compatível com
        // banco sem a migration 009 da coluna platform).
        platform: initial?.platform ?? undefined,
    }));
    // Tipo do caso: automatizado = tem teste Maestro vinculado.
    const [tipo, setTipo] = useState<'manual' | 'automated'>(initial?.test_case_id ? 'automated' : 'manual');
    const [saving, setSaving] = useState(false);

    const isEdit = Boolean(initial?.id);
    const canSave = (draft.title || '').trim().length > 0 && !saving;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            // Manual => limpa o vínculo. Guarded (padrão das migrations recentes):
            // só envia test_case_id quando há vínculo ou ao limpar um existente.
            const linkId = tipo === 'automated' ? (draft.test_case_id || null) : null;
            const test_case_id = linkId ? linkId : (initial?.test_case_id ? null : undefined);
            await onSave({
                ...draft,
                title: (draft.title || '').trim(),
                external_id: (draft.external_id || '').trim() || null,
                steps_summary: (draft.steps_summary || '').trim() || null,
                expected_result: (draft.expected_result || '').trim() || null,
                test_case_id,
                platform: draft.platform !== undefined ? ((draft.platform || '').trim() || null) : undefined,
            });
        } catch {
            // O pai já alertou o erro — só não fecha o modal.
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={
                <>
                    <FileText className="w-5 h-5 text-brand" />
                    <span className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                        {isEdit ? 'Editar Caso' : 'Novo Caso'}
                        {subflowTitle && (
                            <span className="text-muted-foreground font-normal truncate">
                                em <span className="text-brand font-bold">{subflowTitle}</span>
                            </span>
                        )}
                    </span>
                </>
            }
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSave}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEdit ? 'Salvar alterações' : 'Criar Caso'}
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1.5">
                    <Label>Título *</Label>
                    <input
                        type="text"
                        value={draft.title || ''}
                        onChange={e => setDraft({ ...draft, title: e.target.value })}
                        placeholder="ex: Login com email e senha válidos"
                        className={inputClass}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>ID externo</Label>
                    <input
                        type="text"
                        value={draft.external_id || ''}
                        onChange={e => setDraft({ ...draft, external_id: e.target.value })}
                        placeholder="ex: CT-0142"
                        className={`${inputClass} font-mono text-xs`}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>Resumo dos passos</Label>
                <textarea
                    value={draft.steps_summary || ''}
                    onChange={e => setDraft({ ...draft, steps_summary: e.target.value })}
                    placeholder="Passos em linguagem de negócio (não técnico)."
                    rows={8}
                    className={`${inputClass} resize-y min-h-[160px]`}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>Resultado esperado</Label>
                <textarea
                    value={draft.expected_result || ''}
                    onChange={e => setDraft({ ...draft, expected_result: e.target.value })}
                    placeholder="O que precisa acontecer para considerar o caso aprovado."
                    rows={5}
                    className={`${inputClass} resize-y min-h-[110px]`}
                />
            </div>

            {/* Tipo do teste: manual ou automatizado (com vínculo Maestro) */}
            <div className="flex flex-col gap-1.5">
                <Label>Tipo de teste</Label>
                <div className="inline-flex bg-foreground/5 border border-border rounded-lg p-1 gap-1 self-start">
                    <button
                        type="button"
                        onClick={() => { setTipo('manual'); setDraft(d => ({ ...d, test_case_id: null })); }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                            tipo === 'manual' ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Manual
                    </button>
                    <button
                        type="button"
                        onClick={() => setTipo('automated')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors ${
                            tipo === 'automated' ? 'bg-green-500/20 text-green-500' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Automatizado
                    </button>
                </div>
            </div>

            {tipo === 'automated' && (
                <div className="flex flex-col gap-1.5">
                    <Label>Teste Maestro vinculado</Label>
                    <select
                        value={draft.test_case_id || ''}
                        onChange={e => setDraft({ ...draft, test_case_id: e.target.value || null })}
                        className={inputClass}
                        disabled={testCases.length === 0}
                    >
                        <option value="">{testCases.length === 0 ? '— Nenhum teste Maestro no projeto —' : '— Selecione um teste —'}</option>
                        {testCases.map(tc => (
                            <option key={tc.id} value={tc.id}>{tc.name}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                        Liga este caso a um teste automatizado do Maestro. Sem vínculo, o caso conta como manual.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label>Plataforma</Label>
                    <input
                        type="text"
                        value={draft.platform || ''}
                        onChange={e => setDraft({ ...draft, platform: e.target.value })}
                        placeholder="ex: Web, Mobile, API"
                        className={inputClass}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Prioridade</Label>
                    <select
                        value={draft.priority || 'medium'}
                        onChange={e => setDraft({ ...draft, priority: e.target.value as CasePriority })}
                        className={inputClass}
                    >
                        {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Última execução</Label>
                    <select
                        value={draft.last_run_status || ''}
                        onChange={e => setDraft({ ...draft, last_run_status: (e.target.value || null) as CaseRunStatus | null })}
                        className={inputClass}
                    >
                        <option value="">— Não definido —</option>
                        {RUN_STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}
