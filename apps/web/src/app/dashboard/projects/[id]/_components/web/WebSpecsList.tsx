'use client';

import { useEffect, useState } from 'react';
import { Loader2, Play, FileCode2, RefreshCw, AlertTriangle } from 'lucide-react';
import { listWebSpecs } from './web-api';
import type { RepoSpec } from './web-types';

interface Props {
    projectId: string;
    onRunSpec: (specPath: string) => void;
}

export function WebSpecsList({ projectId, onRunSpec }: Props) {
    const [specs, setSpecs] = useState<RepoSpec[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const { specs } = await listWebSpecs(projectId);
            setSpecs(specs);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load(); }, [projectId]);

    if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;

    if (error) {
        return (
            <div className="text-center py-12">
                <AlertTriangle className="w-6 h-6 text-warning mx-auto mb-2" />
                <p className="text-sm text-danger">{error}</p>
                <button onClick={load} className="mt-3 text-xs text-brand hover:underline inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Tentar de novo</button>
            </div>
        );
    }

    if (specs.length === 0) {
        return <p className="text-center text-sm text-muted-foreground py-16">Nenhum arquivo <code className="font-mono">*.spec.ts</code> encontrado no caminho configurado.</p>;
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{specs.length} specs no repositório</span>
                <button onClick={load} className="text-xs text-muted-foreground hover:text-brand inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Atualizar</button>
            </div>
            {specs.map((s) => (
                <div key={s.path} className="flex items-center gap-3 px-3 py-2 border border-border rounded-lg bg-foreground/[0.02] hover:bg-accent/40 transition-colors group">
                    <FileCode2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{s.path}</div>
                    </div>
                    <button
                        onClick={() => onRunSpec(s.path)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-md text-xs font-bold border border-brand/40 text-brand bg-brand/10 hover:bg-brand/20 inline-flex items-center gap-1 shrink-0"
                        title="Rodar apenas este spec"
                    >
                        <Play className="w-3 h-3" /> Rodar
                    </button>
                </div>
            ))}
        </div>
    );
}
