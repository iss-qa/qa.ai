'use client';

import { useRef, useState } from 'react';
import { FileArchive, FileCode2, GitBranch, Loader2, Trash2, Upload } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { AUTOMATION_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { readHtmlDocument } from '@/lib/qa-journey/html-bundle';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import type { QAJourneySubflow, QAJourneySubflowDraft, AutomationStatus } from '@/types/qa-journey';

interface SubflowFormModalProps {
    journeyId: string;
    journeyTitle?: string;      // nome da jornada pai, exibido no título do modal
    initial?: QAJourneySubflow | null;
    defaultSequence?: number;   // usado quando initial é null
    testCases: TestCaseOption[];
    // Candidatos a subfluxo pai (mesma jornada). O chamador já exclui o próprio
    // subfluxo e seus descendentes para evitar ciclos.
    parentOptions?: QAJourneySubflow[];
    defaultParentId?: string | null;  // pré-seleciona o pai ao criar dentro de um subfluxo
    onClose: () => void;
    onSave: (draft: QAJourneySubflowDraft) => Promise<void>;
}

export function SubflowFormModal({ journeyId, journeyTitle, initial, defaultSequence = 0, testCases, parentOptions = [], defaultParentId = null, onClose, onSave }: SubflowFormModalProps) {
    const [draft, setDraft] = useState<QAJourneySubflowDraft>(() => ({
        journey_id: journeyId,
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        sequence: initial?.sequence ?? defaultSequence,
        automation_status: initial?.automation_status ?? 'manual',
        test_case_id: initial?.test_case_id ?? null,
        parent_subflow_id: initial?.parent_subflow_id ?? defaultParentId ?? null,
    }));
    const [saving, setSaving] = useState(false);

    // Documento HTML anexado ao sub-fluxo (renderizado no mapa em iframe).
    const [htmlEnabled, setHtmlEnabled] = useState(Boolean(initial?.html_doc));
    const [htmlDoc, setHtmlDoc] = useState<string | null>(initial?.html_doc ?? null);
    const [htmlFileName, setHtmlFileName] = useState<string | null>(initial?.html_doc ? 'documento atual' : null);
    const [htmlAssetCount, setHtmlAssetCount] = useState(0);
    const [htmlError, setHtmlError] = useState<string | null>(null);
    const [htmlLoading, setHtmlLoading] = useState(false);
    const htmlInputRef = useRef<HTMLInputElement>(null);

    const handleHtmlFile = async (file: File | undefined) => {
        setHtmlError(null);
        if (!file) return;
        // .zip é maior (HTML + anexos); HTML solto fica no limite anterior.
        const maxRaw = file.name.toLowerCase().endsWith('.zip') ? 20 * 1024 * 1024 : 4 * 1024 * 1024;
        if (file.size > maxRaw) {
            setHtmlError(`Arquivo muito grande (máx. ${maxRaw / 1024 / 1024} MB).`);
            return;
        }
        setHtmlLoading(true);
        try {
            // Pacote .zip → HTML com imagens embutidas (data URI); .html → texto cru.
            const doc = await readHtmlDocument(file);
            setHtmlDoc(doc.html);
            setHtmlFileName(doc.fileName);
            setHtmlAssetCount(doc.assetCount);
        } catch (e) {
            setHtmlError(e instanceof Error ? e.message : 'Falha ao ler o arquivo.');
        } finally {
            setHtmlLoading(false);
        }
    };

    const isEdit = Boolean(initial?.id);
    const canSave = (draft.title || '').trim().length > 0 && !saving && !htmlLoading;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            // html_doc: undefined = campo não tocado (não vai no payload —
            // compatível com banco sem a coluna html_doc no subflow).
            const htmlPayload = htmlEnabled
                ? (htmlDoc ?? null)
                : (initial?.html_doc ? null : undefined);
            // Mesmo padrão do html_doc: só manda parent_subflow_id quando há um
            // pai definido ou quando se está limpando um pai existente. Raiz que
            // nunca teve pai -> undefined (omitido), compatível com banco sem 015.
            const parentPayload = draft.parent_subflow_id
                ? draft.parent_subflow_id
                : (initial?.parent_subflow_id ? null : undefined);
            await onSave({
                ...draft,
                title: (draft.title || '').trim(),
                description: (draft.description || '').trim() || null,
                test_case_id: draft.test_case_id || null,
                parent_subflow_id: parentPayload,
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

            <div className="flex flex-col gap-1.5">
                <Label>Subfluxo pai (opcional)</Label>
                <select
                    value={draft.parent_subflow_id || ''}
                    onChange={e => setDraft({ ...draft, parent_subflow_id: e.target.value || null })}
                    className={inputClass}
                >
                    <option value="">— Raiz da jornada —</option>
                    {parentOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                    Sem pai = subfluxo raiz da jornada. Com pai = vira ramo (filho) daquele subfluxo.
                </p>
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
                            Importe um HTML formatado (ex.: planilha de testes estilizada) ou um{' '}
                            <span className="font-semibold text-foreground">.zip</span> com o HTML + a pasta de anexos.
                            No .zip as imagens são embutidas automaticamente, então prints e ícones aparecem ao
                            abrir o sub-fluxo — com cores, abas e interações preservadas.
                        </span>
                    </div>
                </div>

                {htmlEnabled && (
                    <div className="flex flex-wrap items-center gap-2 pl-12">
                        <input
                            ref={htmlInputRef}
                            type="file"
                            accept=".html,.htm,.zip,text/html,application/zip"
                            className="hidden"
                            onChange={e => { void handleHtmlFile(e.target.files?.[0]); e.target.value = ''; }}
                        />
                        <button
                            type="button"
                            onClick={() => htmlInputRef.current?.click()}
                            disabled={htmlLoading}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand border border-brand/30 rounded-lg px-3 py-1.5 hover:bg-brand/10 disabled:opacity-50 transition-colors"
                        >
                            {htmlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {htmlLoading ? 'Processando…' : htmlDoc ? 'Substituir arquivo' : 'Importar HTML ou .zip'}
                        </button>
                        {htmlDoc && !htmlLoading && (
                            <>
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    {htmlAssetCount > 0 && <FileArchive className="w-3 h-3 text-brand" />}
                                    {htmlFileName} · {(htmlDoc.length / 1024).toFixed(0)} KB
                                    {htmlAssetCount > 0 && ` · ${htmlAssetCount} ${htmlAssetCount === 1 ? 'anexo embutido' : 'anexos embutidos'}`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setHtmlDoc(null); setHtmlFileName(null); setHtmlAssetCount(0); }}
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
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}
