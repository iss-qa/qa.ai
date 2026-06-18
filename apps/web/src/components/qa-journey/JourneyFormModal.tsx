'use client';

import { useEffect, useRef, useState } from 'react';
import { FileCode2, Loader2, Map, Trash2, Upload } from 'lucide-react';
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
        // Nova jornada já nasce publicada; ao editar, respeita o valor atual.
        is_published: initial?.is_published ?? true,
    }));
    const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
    const [saving, setSaving] = useState(false);

    // Documento HTML anexado à jornada (renderizado no mapa em iframe).
    const [htmlEnabled, setHtmlEnabled] = useState(Boolean(initial?.html_doc));
    const [htmlDoc, setHtmlDoc] = useState<string | null>(initial?.html_doc ?? null);
    const [htmlFileName, setHtmlFileName] = useState<string | null>(initial?.html_doc ? 'documento atual' : null);
    const [htmlError, setHtmlError] = useState<string | null>(null);
    const htmlInputRef = useRef<HTMLInputElement>(null);

    const handleHtmlFile = (file: File | undefined) => {
        setHtmlError(null);
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            setHtmlError('Arquivo muito grande (máx. 2 MB). Remova imagens embutidas pesadas e tente de novo.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setHtmlDoc(String(reader.result || ''));
            setHtmlFileName(file.name);
        };
        reader.onerror = () => setHtmlError('Falha ao ler o arquivo.');
        reader.readAsText(file);
    };

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
            // html_doc: undefined = campo não tocado (não vai no payload —
            // compatível com banco sem a migration 008).
            const htmlPayload = htmlEnabled
                ? (htmlDoc ?? null)
                : (initial?.html_doc ? null : undefined);
            await onSave({
                ...draft,
                title: (draft.title || '').trim(),
                slug: (draft.slug || '').trim(),
                description: (draft.description || '').trim() || null,
                icon: (draft.icon || '').trim() || null,
                html_doc: htmlPayload,
            });
        } catch {
            // O pai já alertou o erro — só não fecha o modal.
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
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSave}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
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
                <p className="text-[10px] text-muted-foreground">
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
                            className="w-10 h-10 rounded-md bg-transparent border border-border cursor-pointer"
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
                                className="w-5 h-5 rounded-full border border-border hover:scale-110 transition-transform"
                                style={{ background: c }}
                                title={c}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Documento HTML anexado */}
            <div className="border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={htmlEnabled}
                        onClick={() => setHtmlEnabled(v => !v)}
                        className={`relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors ${
                            htmlEnabled ? 'bg-brand' : 'bg-foreground/15'
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                htmlEnabled ? 'left-[18px]' : 'left-0.5'
                            }`}
                        />
                    </button>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <FileCode2 className="w-3.5 h-3.5 text-brand" /> Documento HTML
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-snug">
                            Importe um HTML formatado (ex.: planilha de testes estilizada). Ele será renderizado
                            ao abrir a jornada no mapa — com cores, abas e interações preservadas.
                        </span>
                    </div>
                </div>

                {htmlEnabled && (
                    <div className="flex flex-wrap items-center gap-2 pl-12">
                        <input
                            ref={htmlInputRef}
                            type="file"
                            accept=".html,.htm,text/html"
                            className="hidden"
                            onChange={e => { handleHtmlFile(e.target.files?.[0]); e.target.value = ''; }}
                        />
                        <button
                            type="button"
                            onClick={() => htmlInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand border border-brand/30 rounded-lg px-3 py-1.5 hover:bg-brand/10 transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {htmlDoc ? 'Substituir arquivo' : 'Importar arquivo HTML'}
                        </button>
                        {htmlDoc && (
                            <>
                                <span className="text-[11px] text-muted-foreground">
                                    {htmlFileName} · {(htmlDoc.length / 1024).toFixed(0)} KB
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setHtmlDoc(null); setHtmlFileName(null); }}
                                    className="inline-flex items-center gap-1 text-[11px] text-danger hover:underline"
                                >
                                    <Trash2 className="w-3 h-3" /> Remover
                                </button>
                            </>
                        )}
                        {htmlError && <span className="text-[11px] text-danger w-full">{htmlError}</span>}
                    </div>
                )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={Boolean(draft.is_published)}
                    onChange={e => setDraft({ ...draft, is_published: e.target.checked })}
                    className="w-4 h-4 rounded bg-foreground/5 border-border accent-brand"
                />
                Publicar no mapa público
            </label>
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}
