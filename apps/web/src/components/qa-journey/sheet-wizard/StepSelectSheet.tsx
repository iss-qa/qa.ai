'use client';

import { useState, Fragment } from 'react';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { fetchSheetTabs, parseSpreadsheetId } from '@/lib/qa-journey/sheet-api';
import type { WizardState } from './types';

// Renderiza um texto com URLs detectadas como links clicaveis.
function renderWithLinks(text: string): React.ReactNode {
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
        if (urlRegex.test(part)) {
            // reset regex state porque /g eh stateful
            urlRegex.lastIndex = 0;
            return (
                <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-red-200 inline-flex items-center gap-0.5 break-all"
                >
                    {part} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
            );
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

interface Props {
    state: WizardState;
    update: (patch: Partial<WizardState>) => void;
    onNext: () => void;
}

export function StepSelectSheet({ state, update, onNext }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTabs = async () => {
        setError(null);
        const id = parseSpreadsheetId(state.spreadsheetUrl);
        if (!id) { setError('URL inválida. Cole o link completo da planilha Google ou apenas o ID.'); return; }
        setLoading(true);
        try {
            const tabs = await fetchSheetTabs(id);
            update({ spreadsheetId: id, tabs, sheetName: tabs[0]?.title || '' });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Causas tipicas - mostra dica especifica conforme o erro:
            let hint = '';
            if (/Sheets API has not been used|sheets\.googleapis\.com.*disabled|has not been enabled/i.test(msg)) {
                hint = ' >>> A Google Sheets API NAO esta habilitada no projeto GCP do service account. Clique no link acima ("Enable it by visiting") para ativar, aguarde ~1min para propagar e tente de novo.';
            } else if (/Office file|must not be an Office file|not supported for this document/i.test(msg)) {
                hint = ' >>> Este arquivo eh um .xlsx (Excel) hospedado no Drive, nao uma planilha nativa do Google Sheets. A Sheets API NAO le .xlsx. Solucao: abra o arquivo no Google Sheets > menu Arquivo > "Salvar como Planilhas Google" - isso cria uma copia no formato nativo. Compartilhe a nova copia com o service account e use o link dela.';
            } else if (/offline|backend.*fetch|TypeError.*fetch/i.test(msg)) {
                hint = '';  // safeFetch ja explica
            } else if (/403|permission|access|forbidden/i.test(msg)) {
                hint = ' Compartilhe a planilha com o e-mail do service account (Configurações → Integrações → Google Sheets) com permissão Leitor.';
            } else if (/404|not.?found|notfound/i.test(msg)) {
                hint = ' Confira se a URL/ID da planilha está correto.';
            } else if (/401|unauthorized|invalid.*credentials/i.test(msg)) {
                hint = ' Credenciais do Google inválidas — reconfigure em Configurações → Integrações.';
            }
            setError(msg + hint);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-200 leading-relaxed">
                <strong className="text-amber-100">⚠ Importante:</strong> a planilha precisa estar no formato <strong>nativo do Google Sheets</strong>.
                Arquivos <code className="font-mono bg-amber-500/20 px-1 rounded">.xlsx</code> (Excel) hospedados no Drive <strong>não funcionam</strong>, mesmo abertos no Sheets — a API do Google retorna <em>"This operation is not supported for this document"</em>.
                {' '}Para converter um .xlsx existente: abra-o no Sheets → menu <strong>Arquivo</strong> → <strong>Salvar como Planilhas Google</strong> → use a URL da cópia gerada (com <strong>permissão Leitor</strong> para o service account).
            </div>

            <Field label="URL da planilha Google (ou ID)">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={state.spreadsheetUrl}
                        onChange={e => update({ spreadsheetUrl: e.target.value, spreadsheetId: null, tabs: [] })}
                        placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit"
                        className={`${inputClass} flex-1`}
                    />
                    <button
                        onClick={fetchTabs}
                        disabled={loading || !state.spreadsheetUrl.trim()}
                        className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2 shrink-0"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Carregar abas
                    </button>
                </div>
                <p className="text-[10px] text-slate-500">
                    A planilha precisa estar compartilhada com o e-mail do service account configurado em Configurações &rarr; Integrações.
                </p>
            </Field>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 whitespace-pre-wrap break-words leading-relaxed">
                    {renderWithLinks(error)}
                </div>
            )}

            {state.tabs.length > 0 && (
                <>
                    <Field label="Aba (sheet)">
                        <select
                            value={state.sheetName}
                            onChange={e => update({ sheetName: e.target.value })}
                            className={inputClass}
                        >
                            {state.tabs.map(t => (
                                <option key={t.sheetId} value={t.title}>
                                    {t.title} — {t.rowCount} linhas × {t.columnCount} colunas
                                </option>
                            ))}
                        </select>
                    </Field>
                    {state.spreadsheetId && (
                        <a
                            href={`https://docs.google.com/spreadsheets/d/${state.spreadsheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand hover:underline inline-flex items-center gap-1 self-start"
                        >
                            Abrir planilha no Google <ExternalLink className="w-3 h-3" />
                        </a>
                    )}
                </>
            )}

            <div className="flex justify-end pt-4 border-t border-white/10">
                <button
                    onClick={onNext}
                    disabled={!state.spreadsheetId || !state.sheetName}
                    className="bg-brand text-black px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50"
                >
                    Avançar
                </button>
            </div>
        </div>
    );
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
