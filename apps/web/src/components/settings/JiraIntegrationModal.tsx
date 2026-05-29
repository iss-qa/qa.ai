'use client';

import { useState } from 'react';
import { Loader2, Workflow } from 'lucide-react';
import { ModalShell } from '@/components/qa-journey/ModalShell';
import { saveJiraCredentials } from '@/lib/integrations/api';
import type { IntegrationRecord, JiraCredentialsInput } from '@/types/integrations';

interface Props {
    initial?: { host?: string; email?: string };
    onClose: () => void;
    onSaved: (rec: IntegrationRecord) => void;
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50';

export function JiraIntegrationModal({ initial, onClose, onSaved }: Props) {
    const [host, setHost] = useState(initial?.host ?? '');
    const [email, setEmail] = useState(initial?.email ?? '');
    const [token, setToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        setError(null);
        const h = host.trim();
        const e = email.trim();
        const t = token.trim();
        if (!h) { setError('Host obrigatorio (ex: foxbit.atlassian.net)'); return; }
        if (!e) { setError('E-mail obrigatorio'); return; }
        if (!t) { setError('API token obrigatorio'); return; }
        setSaving(true);
        try {
            const creds: JiraCredentialsInput = { host: h, email: e, api_token: t };
            const saved = await saveJiraCredentials(creds);
            onSaved(saved);
        } catch (e2) {
            setError(e2 instanceof Error ? e2.message : String(e2));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={<><Workflow className="w-5 h-5 text-brand" /> Configurar Jira</>}
            onClose={onClose}
            maxWidth="max-w-xl"
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
            <div className="flex flex-col gap-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                    Gere um API token em{' '}
                    <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        id.atlassian.com/manage-profile/security/api-tokens
                    </a>. O QAMind usa apenas leitura (issues e meta).
                </p>

                <Field label="Host (Atlassian Cloud)">
                    <input
                        type="text"
                        value={host}
                        onChange={e => setHost(e.target.value)}
                        placeholder="foxbit.atlassian.net"
                        className={`${inputClass} font-mono`}
                    />
                </Field>

                <Field label="E-mail da conta">
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="seu.nome@foxbit.com.br"
                        className={inputClass}
                    />
                </Field>

                <Field label="API Token">
                    <input
                        type="password"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        placeholder="ATATT3xFfGF0..."
                        className={`${inputClass} font-mono`}
                    />
                </Field>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                        {error}
                    </div>
                )}

                <p className="text-[10px] text-slate-500">
                    O token é criptografado (AES-256-GCM) antes de ser gravado. Nunca aparece em logs ou no navegador depois de salvo.
                </p>
            </div>
        </ModalShell>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
