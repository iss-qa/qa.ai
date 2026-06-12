'use client';

import { useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { AUTOMATION_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import type { QAJourneySubflow, QAJourneySubflowDraft, AutomationStatus } from '@/types/qa-journey';

interface SubflowFormModalProps {
    journeyId: string;
    journeyTitle?: string;      // nome da jornada pai, exibido no título do modal
    initial?: QAJourneySubflow | null;
    defaultSequence?: number;   // usado quando initial é null
    testCases: TestCaseOption[];
    onClose: () => void;
    onSave: (draft: QAJourneySubflowDraft) => Promise<void>;
}

export function SubflowFormModal({ journeyId, journeyTitle, initial, defaultSequence = 0, testCases, onClose, onSave }: SubflowFormModalProps) {
    const [draft, setDraft] = useState<QAJourneySubflowDraft>(() => ({
        journey_id: journeyId,
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        sequence: initial?.sequence ?? defaultSequence,
        automation_status: initial?.automation_status ?? 'manual',
        test_case_id: initial?.test_case_id ?? null,
    }));
    const [saving, setSaving] = useState(false);

    const isEdit = Boolean(initial?.id);
    const canSave = (draft.title || '').trim().length > 0 && !saving;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave({
                ...draft,
                title: (draft.title || '').trim(),
                description: (draft.description || '').trim() || null,
                test_case_id: draft.test_case_id || null,
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
                    <GitBranch className="w-5 h-5 text-brand" />
                    <span className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                        {isEdit ? 'Editar Sub-fluxo' : 'Novo Sub-fluxo'}
                        {journeyTitle && (
                            <span className="text-muted-foreground font-normal truncate">
                                de <span className="text-brand font-bold">{journeyTitle}</span>
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
                        {isEdit ? 'Salvar alterações' : 'Criar Sub-fluxo'}
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
                        placeholder="ex: Login com sucesso"
                        className={inputClass}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Ordem</Label>
                    <input
                        type="number"
                        value={draft.sequence ?? 0}
                        onChange={e => setDraft({ ...draft, sequence: Number(e.target.value) })}
                        className={inputClass}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>Descrição</Label>
                <textarea
                    value={draft.description || ''}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    placeholder="O que este fluxo cobre — visível para POs e liderança."
                    rows={3}
                    className={`${inputClass} resize-none`}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label>Status de automação</Label>
                    <select
                        value={draft.automation_status || 'manual'}
                        onChange={e => setDraft({ ...draft, automation_status: e.target.value as AutomationStatus })}
                        className={inputClass}
                    >
                        {AUTOMATION_STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Test case Maestro vinculado</Label>
                    <select
                        value={draft.test_case_id || ''}
                        onChange={e => setDraft({ ...draft, test_case_id: e.target.value || null })}
                        className={inputClass}
                        disabled={testCases.length === 0}
                    >
                        <option value="">— Nenhum —</option>
                        {testCases.map(tc => (
                            <option key={tc.id} value={tc.id}>{tc.name}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                        Liga este sub-fluxo a um teste automatizado já existente.
                    </p>
                </div>
            </div>
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}
