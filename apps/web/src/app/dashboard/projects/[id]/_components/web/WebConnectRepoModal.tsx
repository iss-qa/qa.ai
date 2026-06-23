'use client';

import { useState } from 'react';
import { X, Loader2, Github, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { saveWebConfig, PUBLIC_API_FALLBACK, isLocalApiBase, publicIngestBase } from './web-api';
import type { WebConfig } from './web-types';

interface Props {
    projectId: string;
    config: WebConfig | null;
    onClose: () => void;
    onSaved: () => void;
}

export function WebConnectRepoModal({ projectId, config, onClose, onSaved }: Props) {
    const [form, setForm] = useState({
        repo_owner: config?.repo_owner || '',
        repo_name: config?.repo_name || '',
        default_branch: config?.default_branch || 'main',
        workflow_file: config?.workflow_file || 'playwright.yml',
        specs_path: config?.specs_path || 'tests',
    });
    const [rotate, setRotate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [ingestUrl, setIngestUrl] = useState<string>('');
    const [isPublic, setIsPublic] = useState<boolean>(true);
    const [copied, setCopied] = useState<string | null>(null);

    const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const copy = async (key: string, value: string) => {
        try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await saveWebConfig({
                projectId,
                repo_owner: form.repo_owner.trim(),
                repo_name: form.repo_name.trim(),
                default_branch: form.default_branch.trim() || 'main',
                workflow_file: form.workflow_file.trim(),
                specs_path: form.specs_path.trim() || 'tests',
                rotateToken: rotate || !config?.has_ingest_token,
            });
            if (res.ingest_token) {
                setToken(res.ingest_token);
                setIngestUrl(res.ingest_url);
                setIsPublic(res.is_public);
            } else {
                onSaved();
                onClose();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, key: keyof typeof form, placeholder: string, mono = false) => (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
            <input
                type="text"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className={`bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 ${mono ? 'font-mono' : ''}`}
            />
        </div>
    );

    // Tela de token gerado (mostrado uma única vez)
    if (token) {
        const secretRow = (label: string, value: string, key: string) => (
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
                <div className="flex gap-2">
                    <code className="flex-1 min-w-0 truncate bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground font-mono">{value}</code>
                    <button onClick={() => copy(key, value)} className="px-3 bg-foreground/5 border border-border rounded-lg text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors">
                        {copied === key ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        );
        // A API local devolve localhost (não alcançável pelo runner). Nesse caso
        // usamos a URL pública configurada como valor do secret.
        const displayIngestUrl = publicIngestBase(ingestUrl);
        const apiReturnedLocalUrl = !isPublic || isLocalApiBase(ingestUrl);
        const displayIngestExample = `${displayIngestUrl}/web-runs/\${{ inputs.qamind_run_id }}/ingest`;
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <div className="p-6 border-b border-border">
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Check className="w-5 h-5 text-success" /> Repositório conectado</h2>
                        <p className="text-xs text-muted-foreground mt-1">Cadastre os 2 secrets abaixo no repositório <span className="font-mono">{form.repo_owner}/{form.repo_name}</span> (Settings → Secrets and variables → Actions).</p>
                    </div>
                    <div className="p-6 flex flex-col gap-4">
                        <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Copie o <strong>token</strong> agora — ele não será exibido novamente. Use <strong>exatamente</strong> estes nomes de secret; não inverta os valores.</span>
                        </div>

                        {secretRow('QAMIND_INGEST_TOKEN', token, 'token')}
                        {secretRow('QAMIND_INGEST_URL', displayIngestUrl, 'url')}

                        <div className="text-[11px] text-muted-foreground bg-foreground/5 border border-border rounded-lg p-3 flex flex-col gap-1.5">
                            <p><strong className="text-foreground">QAMIND_INGEST_URL é só a base</strong> — sem <code className="font-mono">/web-runs/.../ingest</code>. O workflow monta o caminho completo a cada execução usando o id do run:</p>
                            <code className="font-mono text-foreground break-all block bg-background border border-border rounded px-2 py-1">{displayIngestExample}</code>
                            <p>Ou seja: <span className="font-mono">{'<runId>'}</span> é dinâmico (um por Play) — você <strong>não</strong> cola um runId fixo no secret.</p>
                        </div>

                        {apiReturnedLocalUrl && (
                            <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>A API retornou uma URL local (<span className="font-mono">{ingestUrl}</span>), que o runner do GitHub não alcança. Preenchemos <strong>QAMIND_INGEST_URL</strong> com a URL pública <span className="font-mono">{PUBLIC_API_FALLBACK}</span>. Se a sua URL pública for outra (ex.: túnel ngrok), ajuste o secret.</span>
                            </div>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                            No passo final do workflow, o CI faz <code className="font-mono">POST</code> do report do Playwright com o header
                            <code className="font-mono"> x-ingest-token: {'${{ secrets.QAMIND_INGEST_TOKEN }}'}</code>. O modelo completo do workflow está em <code className="font-mono">docs/web-testing-playwright.md</code>.
                        </p>
                    </div>
                    <div className="p-6 pt-2 flex justify-end">
                        <button onClick={() => { onSaved(); onClose(); }} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 transition-all">Concluir</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Github className="w-5 h-5" /> {config ? 'Editar repositório' : 'Conectar repositório'}</h2>
                    <p className="text-xs text-muted-foreground mt-1">Repositório GitHub com os testes Playwright e o workflow de CI.</p>
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        {field('Owner / Org', 'repo_owner', 'foxbit-group')}
                        {field('Repositório', 'repo_name', 'playwright-poc')}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {field('Branch padrão', 'default_branch', 'main')}
                        {field('Workflow file', 'workflow_file', 'playwright.yml', true)}
                    </div>
                    {field('Pasta dos specs', 'specs_path', 'tests', true)}

                    {config?.has_ingest_token && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="accent-brand" />
                            <RefreshCw className="w-3.5 h-3.5" /> Gerar novo token de ingestão (invalida o atual)
                        </label>
                    )}

                    {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>}
                </div>
                <div className="p-6 pt-2 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving || !form.repo_owner.trim() || !form.repo_name.trim() || !form.workflow_file.trim()} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {config ? 'Salvar' : 'Conectar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
