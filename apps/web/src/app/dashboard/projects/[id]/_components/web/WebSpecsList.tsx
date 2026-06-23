'use client';

import { useEffect, useState } from 'react';
import { Loader2, Play, FileCode2, RefreshCw, AlertTriangle, Eye, Link2, AlertCircle } from 'lucide-react';
import { listWebSpecs } from './web-api';
import { WebSpecContentModal } from './WebSpecContentModal';
import { supabase } from '@/lib/supabase';
import type { RepoSpec, WebConfig } from './web-types';

interface Props {
    projectId: string;
    config: WebConfig | null;
    onRunSpec: (specPath: string) => void;
}

// Busca todos os playwright_spec vinculados às jornadas do projeto.
async function loadLinkedSpecs(projectId: string): Promise<Set<string>> {
    const { data: journeys } = await supabase
        .from('qa_journeys')
        .select('id')
        .eq('project_id', projectId);

    const journeyIds = (journeys || []).map((j) => j.id as string);
    if (!journeyIds.length) return new Set();

    const { data: subflows } = await supabase
        .from('qa_journey_subflows')
        .select('id')
        .in('journey_id', journeyIds);

    const subflowIds = (subflows || []).map((s) => s.id as string);
    if (!subflowIds.length) return new Set();

    const { data: cases } = await supabase
        .from('qa_journey_cases')
        .select('playwright_spec')
        .in('subflow_id', subflowIds)
        .eq('automation_engine', 'playwright')
        .not('playwright_spec', 'is', null);

    const linked = new Set<string>();
    for (const c of cases || []) {
        if (c.playwright_spec) linked.add(c.playwright_spec as string);
    }
    return linked;
}

export function WebSpecsList({ projectId, config, onRunSpec }: Props) {
    const [specs, setSpecs] = useState<RepoSpec[]>([]);
    const [linkedSpecs, setLinkedSpecs] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewSpec, setViewSpec] = useState<RepoSpec | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [{ specs }, linked] = await Promise.all([
                listWebSpecs(projectId),
                loadLinkedSpecs(projectId),
            ]);
            setSpecs(specs);
            setLinkedSpecs(linked);
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
                <button onClick={load} className="mt-3 text-xs text-brand hover:underline inline-flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
                </button>
            </div>
        );
    }

    if (specs.length === 0) {
        return <p className="text-center text-sm text-muted-foreground py-16">Nenhum arquivo <code className="font-mono">*.spec.ts</code> encontrado no caminho configurado.</p>;
    }

    const unlinkedCount = specs.filter((s) => !linkedSpecs.has(s.path)).length;

    return (
        <>
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{specs.length} specs no repositório</span>
                        {unlinkedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-0.5">
                                <AlertCircle className="w-3 h-3" />
                                {unlinkedCount} sem jornada
                            </span>
                        )}
                    </div>
                    <button onClick={load} disabled={loading}
                        className="text-xs text-muted-foreground hover:text-brand inline-flex items-center gap-1 disabled:opacity-40">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                </div>

                {specs.map((s) => {
                    const isLinked = linkedSpecs.has(s.path);
                    return (
                        <div key={s.path}
                            className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg transition-colors group ${
                                isLinked
                                    ? 'border-border bg-foreground/[0.02] hover:bg-accent/40'
                                    : 'border-warning/30 bg-warning/[0.03] hover:bg-warning/[0.06]'
                            }`}>
                            <FileCode2 className={`w-4 h-4 shrink-0 ${isLinked ? 'text-muted-foreground' : 'text-warning'}`} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-foreground">{s.name}</span>
                                    {isLinked ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 border border-success/30 rounded-md px-1.5 py-0.5">
                                            <Link2 className="w-2.5 h-2.5" /> Vinculado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 border border-warning/30 rounded-md px-1.5 py-0.5">
                                            <AlertCircle className="w-2.5 h-2.5" /> Sem jornada
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">{s.path}</div>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                    onClick={() => setViewSpec(s)}
                                    className="px-2.5 py-1 rounded-md text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-foreground/5 inline-flex items-center gap-1"
                                    title="Ver conteúdo do arquivo"
                                >
                                    <Eye className="w-3 h-3" /> Ver
                                </button>
                                <button
                                    onClick={() => onRunSpec(s.path)}
                                    className="px-2.5 py-1 rounded-md text-xs font-bold border border-brand/40 text-brand bg-brand/10 hover:bg-brand/20 inline-flex items-center gap-1"
                                    title="Rodar apenas este spec"
                                >
                                    <Play className="w-3 h-3" /> Rodar
                                </button>
                            </div>
                        </div>
                    );
                })}

                {unlinkedCount > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                        Specs sem jornada não terão seus resultados linkados a casos de teste. Vincule em <strong>Jornadas → Caso → Automatizado → selecionar spec</strong>.
                    </p>
                )}
            </div>

            {viewSpec && config && (
                <WebSpecContentModal
                    projectId={projectId}
                    spec={viewSpec}
                    repoOwner={config.repo_owner}
                    repoName={config.repo_name}
                    defaultBranch={config.default_branch}
                    onClose={() => setViewSpec(null)}
                />
            )}
        </>
    );
}
