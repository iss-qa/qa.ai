'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileSpreadsheet, Loader2 } from 'lucide-react';
import { ModalShell } from '@/components/qa-journey/ModalShell';
import { saveGoogleSheetsCredentials } from '@/lib/integrations/api';
import type { GoogleSheetsCredentialsInput, IntegrationRecord } from '@/types/integrations';

interface Props {
    onClose: () => void;
    onSaved: (rec: IntegrationRecord) => void;
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';

export function GoogleSheetsIntegrationModal({ onClose, onSaved }: Props) {
    const [jsonText, setJsonText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [showGuide, setShowGuide] = useState(true);

    const validateAndExtract = (): GoogleSheetsCredentialsInput | null => {
        setError(null);
        const trimmed = jsonText.trim();
        if (!trimmed) { setError('Cole o conteudo do arquivo JSON.'); return null; }
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed);
        } catch (e) {
            setError('JSON invalido: ' + (e instanceof Error ? e.message : String(e)));
            return null;
        }
        if (!parsed.client_email || typeof parsed.client_email !== 'string') {
            setError('JSON nao tem campo "client_email".');
            return null;
        }
        if (!parsed.private_key || typeof parsed.private_key !== 'string') {
            setError('JSON nao tem campo "private_key".');
            return null;
        }
        return parsed as GoogleSheetsCredentialsInput;
    };

    const handleSubmit = async () => {
        const creds = validateAndExtract();
        if (!creds) return;
        setSaving(true);
        try {
            const saved = await saveGoogleSheetsCredentials(creds);
            onSaved(saved);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={<><FileSpreadsheet className="w-5 h-5 text-brand" /> Configurar Google Sheets</>}
            onClose={onClose}
            maxWidth="max-w-3xl"
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Salvar credenciais
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                {/* Guia colapsável passo-a-passo */}
                <div className="bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowGuide(s => !s)}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-200 hover:bg-white/[0.04]"
                    >
                        <span>Como gerar a JSON do service account (6 passos)</span>
                        {showGuide ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    {showGuide && (
                        <ol className="px-5 pb-4 pt-1 text-xs text-slate-300 space-y-2 list-decimal list-outside">
                            <li>
                                <strong className="text-white">Criar/escolher projeto GCP</strong> em{' '}
                                <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">
                                    console.cloud.google.com <ExternalLink className="w-2.5 h-2.5" />
                                </a>. No topo da página, seletor de projeto → "Novo projeto" (ou reutilizar um existente).
                            </li>
                            <li>
                                <strong className="text-white">Habilitar a Google Sheets API</strong> nesse projeto (passo mais esquecido):
                                <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5 ml-1">
                                    Biblioteca de APIs → Google Sheets API → Ativar <ExternalLink className="w-2.5 h-2.5" />
                                </a>.
                                Sem isso, o sync falha com erro <code className="font-mono bg-red-500/10 text-red-300 px-1 rounded">"Sheets API has not been used"</code>.
                            </li>
                            <li>
                                <strong className="text-white">Criar Service Account</strong> em{' '}
                                <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">
                                    IAM & Admin → Contas de serviço → "Criar conta de serviço" <ExternalLink className="w-2.5 h-2.5" />
                                </a>.
                                Nome livre (ex: <code className="font-mono text-slate-200">qamind-sheets-reader</code>). <strong>Pule</strong> as etapas de roles e usuários — não precisa.
                            </li>
                            <li>
                                <strong className="text-white">Gerar chave JSON</strong>: na lista de contas, clica na que você criou → aba <strong>Chaves</strong> → <strong>Adicionar chave</strong> → <strong>Criar nova chave</strong> → tipo <strong>JSON</strong> → Criar. O arquivo .json é baixado automaticamente.
                            </li>
                            <li>
                                <strong className="text-white">Compartilhar planilhas</strong>: abre a .json no editor, copia o campo <code className="font-mono bg-white/5 px-1 rounded">client_email</code> (algo como <code className="font-mono bg-white/5 px-1 rounded">xxx@projeto.iam.gserviceaccount.com</code>). Em cada planilha que vai sincronizar: botão <strong>Compartilhar</strong> → cola esse e-mail → permissão <strong>Leitor</strong> → Concluído.
                            </li>
                            <li>
                                <strong className="text-white">Cola o conteúdo da .json aqui embaixo</strong> e clica em <strong>Salvar credenciais</strong>. A chave é cifrada (AES-256-GCM) antes de ir para o banco.
                            </li>
                        </ol>
                    )}
                </div>

                <p className="text-[10px] text-slate-500">
                    Dica: depois de gerar a chave, abra o .json no editor de texto e use Cmd+A / Ctrl+A para copiar tudo, incluindo as chaves <code className="font-mono">{'{'}</code> <code className="font-mono">{'}'}</code>.
                </p>

                <textarea
                    value={jsonText}
                    onChange={e => setJsonText(e.target.value)}
                    placeholder='{ "type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----...", "client_email": "...@....iam.gserviceaccount.com", ... }'
                    rows={14}
                    className={`${inputClass} font-mono text-[11px] resize-y`}
                    spellCheck={false}
                />

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                        {error}
                    </div>
                )}

                <p className="text-[10px] text-slate-500">
                    A credencial é criptografada (AES-256-GCM) antes de ser gravada. O JSON nunca volta para o navegador depois de salvo.
                </p>
            </div>
        </ModalShell>
    );
}
