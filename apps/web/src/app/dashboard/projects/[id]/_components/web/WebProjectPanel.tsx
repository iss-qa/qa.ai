'use client';

import { useState } from 'react';
import { Loader2, Github, Play, Settings, FileCode2, ListChecks, Link2Off } from 'lucide-react';
import { useWebTesting } from './useWebTesting';
import { WebConnectRepoModal } from './WebConnectRepoModal';
import { WebRunModal } from './WebRunModal';
import { WebRunsList } from './WebRunsList';
import { WebRunDetailModal } from './WebRunDetailModal';
import { WebSpecsList } from './WebSpecsList';

type Tab = 'runs' | 'specs';

export function WebProjectPanel({ projectId }: { projectId: string }) {
    const { config, runs, loading, error, refreshConfig, trigger } = useWebTesting(projectId);
    const [tab, setTab] = useState<Tab>('runs');
    const [connectOpen, setConnectOpen] = useState(false);
    const [runOpen, setRunOpen] = useState(false);
    const [runInitialSpec, setRunInitialSpec] = useState<string | undefined>(undefined);
    const [detailRunId, setDetailRunId] = useState<string | null>(null);

    const openRunModal = (spec?: string) => { setRunInitialSpec(spec); setRunOpen(true); };

    // ---- Estado: repositório não conectado ----
    if (!loading && !config) {
        return (
            <>
                <div className="text-center py-16">
                    <Github className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-base font-bold text-foreground">Conecte o repositório de testes</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                        Projetos Web rodam testes <strong>Playwright</strong> a partir de um repositório GitHub, disparados via GitHub Actions.
                    </p>
                    <button onClick={() => setConnectOpen(true)} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold bg-brand text-black hover:bg-brand/90 transition-all inline-flex items-center gap-2">
                        <Github className="w-4 h-4" /> Conectar Repositório
                    </button>
                </div>
                {connectOpen && <WebConnectRepoModal projectId={projectId} config={config} onClose={() => setConnectOpen(false)} onSaved={refreshConfig} />}
            </>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Header: repo + ações */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <Github className="w-4 h-4 text-muted-foreground shrink-0" />
                    {config ? (
                        <span className="text-sm text-foreground font-mono truncate">{config.repo_owner}/{config.repo_name}</span>
                    ) : (
                        <span className="text-sm text-muted-foreground">Carregando…</span>
                    )}
                    {config && <span className="text-[10px] text-muted-foreground font-mono shrink-0">· {config.workflow_file}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setConnectOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all inline-flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5" /> Configurar
                    </button>
                    <button onClick={() => openRunModal()} disabled={!config} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-black hover:bg-brand/90 disabled:opacity-50 transition-all inline-flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5" /> Rodar Testes
                    </button>
                </div>
            </div>

            {config && !config.has_ingest_token && (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">
                    <Link2Off className="w-4 h-4 shrink-0" />
                    <span>Token de ingestão ausente — os resultados não retornarão do CI. Abra <strong>Configurar</strong> e gere o token.</span>
                </div>
            )}

            {/* Abas */}
            <div className="flex items-center gap-1 border-b border-border">
                <TabButton active={tab === 'runs'} onClick={() => setTab('runs')} icon={<ListChecks className="w-3.5 h-3.5" />} label="Execuções" />
                <TabButton active={tab === 'specs'} onClick={() => setTab('specs')} icon={<FileCode2 className="w-3.5 h-3.5" />} label="Specs" />
            </div>

            {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>}

            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : tab === 'runs' ? (
                <WebRunsList runs={runs} onOpen={setDetailRunId} />
            ) : (
                <WebSpecsList projectId={projectId} onRunSpec={openRunModal} />
            )}

            {connectOpen && <WebConnectRepoModal projectId={projectId} config={config} onClose={() => setConnectOpen(false)} onSaved={refreshConfig} />}
            {runOpen && config && <WebRunModal config={config} initialSpec={runInitialSpec} onClose={() => setRunOpen(false)} onRun={async (opts) => { await trigger(opts); setTab('runs'); }} />}
            {detailRunId && <WebRunDetailModal runId={detailRunId} onClose={() => setDetailRunId(null)} />}
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
            {icon} {label}
        </button>
    );
}
