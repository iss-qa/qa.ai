'use client';

import { useState } from 'react';
import { X, Loader2, Play } from 'lucide-react';
import type { WebConfig } from './web-types';

interface Props {
    config: WebConfig;
    initialSpec?: string;
    onClose: () => void;
    onRun: (opts: { branch?: string; spec?: string; env?: string }) => Promise<void>;
}

export function WebRunModal({ config, initialSpec, onClose, onRun }: Props) {
    const [branch, setBranch] = useState(config.default_branch);
    const [spec, setSpec] = useState(initialSpec || '');
    const [env, setEnv] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRun = async () => {
        setRunning(true);
        setError(null);
        try {
            await onRun({
                branch: branch.trim() || undefined,
                spec: spec.trim() || undefined,
                env: env.trim() || undefined,
            });
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setRunning(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Play className="w-5 h-5 text-brand" /> Rodar testes Web</h2>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{config.repo_owner}/{config.repo_name} · {config.workflow_file}</p>
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</label>
                        <input value={branch} onChange={(e) => setBranch(e.target.value)} className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Spec (opcional)</label>
                        <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Vazio = suite inteira" className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 font-mono" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Ambiente (opcional)</label>
                        <input value={env} onChange={(e) => setEnv(e.target.value)} placeholder="ex.: staging" className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50" />
                    </div>
                    {error && (
                        <div className="max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">
                            {error}
                        </div>
                    )}
                </div>
                <div className="p-6 pt-2 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                    <button onClick={handleRun} disabled={running} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2">
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Disparar
                    </button>
                </div>
            </div>
        </div>
    );
}
