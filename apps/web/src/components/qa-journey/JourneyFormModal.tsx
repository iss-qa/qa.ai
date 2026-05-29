'use client';

import { useEffect, useState } from 'react';
import { Loader2, Map } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { COLOR_SUGGESTIONS, ICON_SUGGESTIONS, toSlug } from '@/lib/qa-journey/constants';
import type { QAJourney, QAJourneyDraft } from '@/types/qa-journey';

interface JourneyFormModalProps {
    projectId: string;
    initial?: QAJourney | null;
    defaultSequence?: number;   // usado quando initial é null (nova jornada)
    onClose: () => void;
    onSave: (draft: QAJourneyDraft) => Promise<void>;
}

export function JourneyFormModal({ projectId, initial, defaultSequence = 0, onClose, onSave }: JourneyFormModalProps) {
    const [draft, setDraft] = useState<QAJourneyDraft>(() => ({
        project_id: projectId,
        slug: initial?.slug ?? '',
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        icon: initial?.icon ?? '',
        color: initial?.color ?? COLOR_SUGGESTIONS[0],
        sequence: initial?.sequence ?? defaultSequence,
        is_published: initial?.is_published ?? false,
    }));
    const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
    const [saving, setSaving] = useState(false);

    // Slug auto-derivado do titulo enquanto o usuario nao tocar manualmente
    useEffect(() => {
        if (slugTouched) return;
        setDraft(d => ({ ...d, slug: toSlug(d.title || '') }));
    }, [draft.title, slugTouched]);

    const isEdit = Boolean(initial?.id);
    const titleOk = (draft.title || '').trim().length > 0;
    const slugOk = (draft.slug || '').trim().length > 0;
    const canSave = titleOk && slugOk && !saving;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave({
                ...draft,
                title: (draft.title || '').trim(),
                slug: (draft.slug || '').trim(),
                description: (draft.description || '').trim() || null,
                icon: (draft.icon || '').trim() || null,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={<><Map className="w-5 h-5 text-brand" /> {isEdit ? 'Editar Jornada' : 'Nova Jornada'}</>}
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSave}
                        className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEdit ? 'Salvar alterações' : 'Criar Jornada'}
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
                        placeholder="ex: Autenticação"
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
                <Label>Slug *</Label>
                <input
                    type="text"
                    value={draft.slug || ''}
                    onChange={e => { setDraft({ ...draft, slug: e.target.value }); setSlugTouched(true); }}
                    placeholder="ex: autenticacao"
                    className={`${inputClass} font-mono text-xs`}
                />
                <p className="text-[10px] text-slate-500">
                    Identificador único na URL. Gerado a partir do título — edite se quiser sobrescrever.
                </p>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>Descrição</Label>
                <textarea
                    value={draft.description || ''}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    placeholder="O que esta jornada cobre — em linguagem de negócio."
                    rows={3}
                    className={`${inputClass} resize-none`}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label>Ícone (lucide)</Label>
                    <input
                        type="text"
                        list="qa-journey-icons"
                        value={draft.icon || ''}
                        onChange={e => setDraft({ ...draft, icon: e.target.value })}
                        placeholder="ex: Lock"
                        className={inputClass}
                    />
                    <datalist id="qa-journey-icons">
                        {ICON_SUGGESTIONS.map(name => <option key={name} value={name} />)}
                    </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Cor do nó</Label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={draft.color || COLOR_SUGGESTIONS[0]}
                            onChange={e => setDraft({ ...draft, color: e.target.value })}
                            className="w-10 h-10 rounded-md bg-transparent border border-white/10 cursor-pointer"
                        />
                        <input
                            type="text"
                            value={draft.color || ''}
                            onChange={e => setDraft({ ...draft, color: e.target.value })}
                            placeholder="#7c3aed"
                            className={`${inputClass} font-mono text-xs flex-1`}
                        />
                    </div>
                    <div className="flex gap-1 flex-wrap mt-1">
                        {COLOR_SUGGESTIONS.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setDraft({ ...draft, color: c })}
                                className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                                style={{ background: c }}
                                title={c}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={Boolean(draft.is_published)}
                    onChange={e => setDraft({ ...draft, is_published: e.target.checked })}
                    className="w-4 h-4 rounded bg-white/5 border-white/20 accent-brand"
                />
                Publicar no mapa público
            </label>
        </ModalShell>
    );
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{children}</label>;
}
