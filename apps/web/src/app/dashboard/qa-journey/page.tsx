'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { BarChart3, Loader2, Settings } from 'lucide-react';
import { useShell } from '@/components/layout/shell-context';

// JourneyMap pulls in React Flow (~300kB). Lazy-load it so the page shell +
// header paint instantly and the heavy canvas bundle only downloads when a
// project actually has a map to render. ssr:false — it's a client-only canvas.
const JourneyMap = dynamic(
    () => import('@/components/qa-journey/map/JourneyMap').then(m => m.JourneyMap),
    { ssr: false, loading: () => <LoadingState /> },
);
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';
import {
    getLastProjectId,
    loadJourneyMapData,
    loadProjectOptions,
    setLastProjectId,
} from '@/lib/qa-journey/api';
import type { ProjectOption } from '@/lib/qa-journey/api';
import type {
    QAJourney,
    QAJourneyCase,
    QAJourneySubflow,
} from '@/types/qa-journey';

export default function QAJourneyPublicPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    // Deep-link vindo do admin: ?journey=<id> abre o mapa com essa jornada expandida.
    const [focusJourneyId] = useQueryState('journey', { defaultValue: '' });

    const [journeys, setJourneys] = useState<QAJourney[]>([]);
    const [subflows, setSubflows] = useState<QAJourneySubflow[]>([]);
    const [cases, setCases] = useState<QAJourneyCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);
    const { setHeaderSlot } = useShell();

    // Boot: se não veio ?project na URL, usa o último projeto visitado
    // (localStorage) — assim as jornadas começam a carregar de imediato,
    // em paralelo com a lista de projetos do combobox.
    useEffect(() => {
        if (!projectId) {
            const last = getLastProjectId();
            if (last) setProjectId(last);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lista de projetos do combobox — carregada uma única vez.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            setProjectId(prev => {
                // Valida o projeto atual (URL/localStorage pode apontar para
                // um projeto excluído) e cai para o primeiro da lista.
                if (prev && list.some(p => p.id === prev)) return prev;
                return list[0]?.id ?? null;
            });
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Carrega o mapa do projeto selecionado (apenas UM projeto por vez).
    useEffect(() => {
        if (!projectId) {
            setJourneys([]);
            setSubflows([]);
            setCases([]);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setLastProjectId(projectId);
        (async () => {
            const data = await loadJourneyMapData(projectId);
            if (cancelled) return;
            if (data.migrationMissing) {
                setMigrationMissing(true);
                setLoading(false);
                return;
            }
            setJourneys(data.journeys);
            setSubflows(data.subflows);
            setCases(data.cases);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [projectId]);

    const subflowsByJourney = useMemo(() => {
        const m: Record<string, QAJourneySubflow[]> = {};
        for (const s of subflows) {
            (m[s.journey_id] ||= []).push(s);
        }
        return m;
    }, [subflows]);

    const casesBySubflow = useMemo(() => {
        const m: Record<string, QAJourneyCase[]> = {};
        for (const c of cases) {
            (m[c.subflow_id] ||= []).push(c);
        }
        return m;
    }, [cases]);

    // Controles da página vivem no Header global (linha do dark mode/avatar) —
    // libera toda a altura útil para o mapa.
    useEffect(() => {
        setHeaderSlot(
            <div className="flex items-center gap-2">
                <label
                    htmlFor="qa-journey-project"
                    className="hidden md:block text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0"
                >
                    Projeto
                </label>
                <select
                    id="qa-journey-project"
                    value={projectId}
                    onChange={e => setProjectId(e.target.value || null)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 max-w-[140px] sm:max-w-[200px]"
                    disabled={projects.length === 0}
                >
                    {projects.length === 0 && <option value="">Sem projetos</option>}
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Link
                    href={`/dashboard/qa-journey/insights?project=${projectId}`}
                    className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors shrink-0"
                    title="Insights"
                >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Insights</span>
                </Link>
                <Link
                    href={`/dashboard/qa-journey/admin?project=${projectId}`}
                    className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors shrink-0"
                    title="Admin"
                >
                    <Settings className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Admin</span>
                </Link>
            </div>,
        );
        return () => setHeaderSlot(null);
    }, [projects, projectId, setProjectId, setHeaderSlot]);

    return (
        <div className="p-2 sm:p-3 flex flex-col h-full">
            {/* Body — mapa ocupa toda a área útil */}
            <div className="flex-1 min-h-0">
                {migrationMissing ? (
                    <MigrationMissingBanner />
                ) : loading ? (
                    <LoadingState />
                ) : journeys.length === 0 ? (
                    <EmptyState projectId={projectId} />
                ) : (
                    <JourneyMap
                        projectId={projectId}
                        journeys={journeys}
                        subflowsByJourney={subflowsByJourney}
                        casesBySubflow={casesBySubflow}
                        initialExpandedJourneyId={focusJourneyId || undefined}
                        onCaseUpdated={updated =>
                            setCases(prev => prev.map(c => c.id === updated.id ? updated : c))
                        }
                    />
                )}
            </div>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="bg-card border border-border rounded-2xl h-full flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-foreground font-medium">Carregando jornadas…</span>
                <span className="text-xs">Aguarde, montando o mapa do projeto.</span>
            </div>
        </div>
    );
}

function EmptyState({ projectId }: { projectId: string | null }) {
    return (
        <div className="bg-card border border-border rounded-2xl h-full flex flex-col items-center justify-center text-center gap-3 p-10">
            <p className="text-foreground text-sm">
                Nenhuma jornada publicada para este projeto ainda.
            </p>
            <p className="text-muted-foreground text-xs max-w-md">
                Cadastre Jornadas no admin e marque &quot;Publicar no mapa público&quot; para que apareçam aqui.
            </p>
            <Link
                href={`/dashboard/qa-journey/admin?project=${projectId || ''}`}
                className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all"
            >
                Ir para o admin
            </Link>
        </div>
    );
}
