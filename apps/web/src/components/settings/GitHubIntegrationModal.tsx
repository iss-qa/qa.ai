'use client';

import { useState } from 'react';
import { Loader2, Github } from 'lucide-react';
import { ModalShell } from '@/components/qa-journey/ModalShell';
import { saveGitHubCredentials } from '@/lib/integrations/api';
import type { IntegrationRecord, GitHubCredentialsInput } from '@/types/integrations';

interface Props {
    initialName?: string;   // pré-preenche o rótulo quando editando conta existente
    onClose: () => void;
    onSaved: (rec: IntegrationRecord) => void;
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

export function GitHubIntegrationModal({ initialName, onClose, onSaved }: Props) {
    const [name, setName] = useState(initialName ?? '');
    const [token, setToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const isEditing = initialName !== undefined;

    const handleSubmit = async () => {
        setError(null);
        const t = token.trim();
        if (!t) { setError('Informe o token do GitHub.'); return; }
        setSaving(true);
        try {
            const creds: GitHubCredentialsInput = { token: t, name: name.trim() || undefined };
            const saved = await saveGitHubCredentials(creds);
            onSaved(saved);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={<><Github className="w-5 h-5 text-brand" /> {isEditing ? 'Atualizar token' : 'Adicionar conta GitHub'}</>}
            onClose={onClose}
            maxWidth="max-w-xl"
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Salvar token
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Gere um <strong>Personal Access Token</strong> (clássico ou fine-grained) com acesso ao repositório
                    de testes Web. Escopos necessários: <code className="font-mono">actions:write</code> (disparar o
                    workflow) e <code className="font-mono">contents:read</code> (listar os specs).
                </p>

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Rótulo da conta <span className="font-normal normal-case">(opcional)</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder='ex: "Pessoal", "Foxbit"'
                        className={inputClass}
                        disabled={isEditing}
                        title={isEditing ? 'Para renomear, remova e adicione a conta novamente.' : undefined}
                    />
                    {!isEditing && (
                        <p className="text-[10px] text-muted-foreground">
                            Identifica a conta na lista. Use um rótulo diferente para cada conta GitHub conectada.
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Token</label>
                    <input
                        type="password"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        placeholder="ghp_… ou github_pat_…"
                        className={`${inputClass} font-mono`}
                        autoFocus
                    />
                </div>

                {error && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">
                        {error}
                    </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                    O token é validado no GitHub no momento de salvar, criptografado (AES-256-GCM) antes de ser gravado
                    e nunca volta para o navegador.
                </p>
            </div>
        </ModalShell>
    );
}
