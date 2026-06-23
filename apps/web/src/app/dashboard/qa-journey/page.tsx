'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { BarChart3, ChevronLeft, LayoutGrid, Loader2, Settings } from 'lucide-react';
import { useShell } from '@/components/layout/shell-context';

// JourneyMap pulls in React Flow (~300kB). Lazy-load it so the page shell +
// header paint instantly and the heavy canvas bundle only downloads when a
// project actually has a map to render. ssr:false — it's a client-only canvas.
const JourneyMap = dynamic(
    () => import('@/components/qa-journey/map/JourneyMap').then(m => m.JourneyMap),
    { ssr: false, loading: () => <LoadingState /> },
);
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';
import { ProjectHub } from '@/components/qa-journey/hub/ProjectHub';
import { JourneyColumnView } from '@/components/qa-journey/columns/JourneyColumnView';
import {
    loadJourneyMapData,
    loadProjectsHub,
    loadTestCaseOptions,
    setLastProjectId,
    setProjectJourneyViewMode,
} from '@/lib/qa-journey/api';
import type { JourneyViewMode, ProjectHubCard, TestCaseOption } from '@/lib/qa-journey/api';
import type {
    QAJourney,
    QAJourneyCase,
    QAJourneySubflow,
} from '@/types/qa-journey';

export default function QAJourneyPublicPage() {
    const [projects, setProjects] = useState<ProjectHubCard[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(true);

    // Navegação por query params (back/forward do browser funciona):
    //   project -> projeto selecionado (vazio = hub de projetos)
    //   view    -> 'all' abre o mapa completo (card GOLD "Todas as jornadas")
    //   solo    -> id de jornada: abre só aquela jornada
    //   journey -> deep-link do admin: abre o mapa com essa jornada expandida
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    const [view, setView] = useQueryState('view', { defaultValue: '' });
    const [solo, setSolo] = useQueryState('solo', { defaultValue: '' });
    const [focusJourneyId, setFocusJourneyId] = useQueryState('journey', { defaultValue: '' });

    const [journeys, setJourneys] = useState<QAJourney[]>([]);
    const [subflows, setSubflows] = useState<QAJourneySubflow[]>([]);
    const [cases, setCases] = useState<QAJourneyCase[]>([]);
    const [testCases, setTestCases] = useState<TestCaseOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [migrationMissing, setMigrationMissing] = useState(false);
    // Bump para re-buscar os dados do projeto após mutações no layout de colunas.
    const [refreshNonce, setRefreshNonce] = useState(0);
    const reload = useCallback(() => setRefreshNonce(n => n + 1), []);
    const { setHeaderSlot } = useShell();

    // Lista de projetos do hub (com modo + nº de jornadas) — carregada uma vez.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectsHub();
            if (cancelled) return;
            setProjects(list);
            setProjectsLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const selectedProject = useMemo(
        () => projects.find(p => p.id === projectId) || null,
        [projects, projectId],
    );
    const mode: JourneyViewMode = selectedProject?.journey_view_mode ?? 'single';

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
            const [data, tcs] = await Promise.all([
                loadJourneyMapData(projectId, true),  // dashboard mostra rascunhos também
                loadTestCaseOptions(projectId),
            ]);
            if (cancelled) return;
            setTestCases(tcs);
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
    }, [projectId, refreshNonce]);

    const subflowsByJourney = useMemo(() => {
        const m: Record<string, QAJourneySubflow[]> = {};
        for (const s of subflows) (m[s.journey_id] ||= []).push(s);
        return m;
    }, [subflows]);

    const casesBySubflow = useMemo(() => {
        const m: Record<string, QAJourneyCase[]> = {};
        for (const c of cases) (m[c.subflow_id] ||= []).push(c);
        return m;
    }, [cases]);


    // Deep-link do admin (?journey=) em modo cards abre aquela jornada sozinha;
    // em modo single mantém o comportamento antigo (mapa completo + expandida).
    const effectiveSolo = solo || (mode === 'cards' && focusJourneyId ? focusJourneyId : '');
    // Em modo 'cards', sem view/solo, mostramos os cards de jornada (não o mapa).
    const showingCards = Boolean(projectId) && mode === 'cards' && view !== 'all' && !effectiveSolo;
    // O mapa renderiza: modo single, ou (modo cards com view=all), ou solo.
    const soloJourneys = useMemo(
        () => (effectiveSolo ? journeys.filter(j => j.id === effectiveSolo) : journeys),
        [effectiveSolo, journeys],
    );

    // IMPORTANTE: limpar também o param `journey` (deep-link). Sem isso o
    // effectiveSolo continua valendo e a tela não muda — a seta de voltar
    // parecia "não funcionar".
    const goToHub = useCallback(() => {
        setView(null); setSolo(null); setFocusJourneyId(null); setProjectId(null);
    }, [setView, setSolo, setFocusJourneyId, setProjectId]);

    const goToCards = useCallback(() => {
        setView(null); setSolo(null); setFocusJourneyId(null);
    }, [setView, setSolo, setFocusJourneyId]);

    const handleToggleMode = useCallback(async (id: string, next: JourneyViewMode) => {
        // Otimista: reflete na UI e persiste. Se falhar, reverte.
        setProjects(prev => prev.map(p => p.id === id ? { ...p, journey_view_mode: next } : p));
        try {
            await setProjectJourneyViewMode(id, next);
        } catch {
            setProjects(prev => prev.map(p => p.id === id ? { ...p, journey_view_mode: next === 'cards' ? 'single' : 'cards' } : p));
            alert('Não foi possível alterar o modo de visualização. Verifique se a migration 014 foi aplicada.');
        }
    }, []);

    // "Separar em cards" a partir do mapa único: liga o modo e vai pros cards.
    const handleSwitchToCards = useCallback(async () => {
        if (!projectId) return;
        await handleToggleMode(projectId, 'cards');
        goToCards();
    }, [projectId, handleToggleMode, goToCards]);

    // Header global (linha do dark mode/avatar). No hub fica vazio; nas demais
    // vistas tem o "voltar" contextual + seletor de projeto + insights/admin.
    useEffect(() => {
        if (!projectId) {
            setHeaderSlot(null);
            return () => setHeaderSlot(null);
        }
        const onBack = mode === 'cards' && (view === 'all' || effectiveSolo) ? goToCards : goToHub;
        setHeaderSlot(
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
                    title="Voltar"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                    aria-label="Projeto"
                    value={projectId}
                    onChange={e => { setView(null); setSolo(null); setFocusJourneyId(null); setProjectId(e.target.value || null); }}
                    className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 max-w-[140px] sm:max-w-[200px]"
                    disabled={projects.length === 0}
                >
                    {projects.length === 0 && <option value="">Sem projetos</option>}
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {mode === 'single' && (
                    <button
                        type="button"
                        onClick={handleSwitchToCards}
                        title="Separar jornadas em cards (um mapa por jornada)"
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors shrink-0"
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Separar em cards</span>
                    </button>
                )}
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
    }, [projects, projectId, mode, view, effectiveSolo, setProjectId, setView, setSolo, setFocusJourneyId, setHeaderSlot, goToCards, goToHub, handleSwitchToCards]);

    // ── Render ────────────────────────────────────────────────────────────
    if (migrationMissing) {
        return <div className="p-2 sm:p-3 h-full"><MigrationMissingBanner /></div>;
    }

    // Hub de projetos (sem projeto selecionado).
    if (!projectId) {
        return (
            <div className="p-2 sm:p-3 h-full">
                <ProjectHub
                    projects={projects}
                    loading={projectsLoading}
                    onSelect={id => { setView(null); setSolo(null); setFocusJourneyId(null); setProjectId(id); }}
                    onToggleMode={handleToggleMode}
                    onChanged={async () => { setProjects(await loadProjectsHub()); }}
                />
            </div>
        );
    }

    // Projeto selecionado mas a lista de projetos (que carrega o modo) ainda
    // não chegou: espera, senão o `mode` cai para 'single' e o mapa React Flow
    // pisca antes de virar o layout de colunas (projeto em modo cards).
    if (projectId && !selectedProject && projectsLoading) {
        return <div className="p-2 sm:p-3 h-full"><LoadingState /></div>;
    }

    // Layout em colunas (modo cards, sem view/solo): coluna de jornadas +
    // subfluxos (árvore) + métricas + drawer de detalhe.
    if (showingCards) {
        return (
            <div className="p-2 sm:p-3 h-full">
                {loading ? (
                    <LoadingState />
                ) : journeys.length === 0 ? (
                    <EmptyState projectId={projectId} />
                ) : (
                    <JourneyColumnView
                        projectId={projectId}
                        projectName={selectedProject?.name || 'Projeto'}
                        journeys={journeys}
                        subflowsByJourney={subflowsByJourney}
                        casesBySubflow={casesBySubflow}
                        testCases={testCases}
                        onReload={reload}
                        onOpenJourneyMap={id => { setView(null); setSolo(id); }}
                        onCaseUpdated={updated =>
                            setCases(prev => prev.map(c => c.id === updated.id ? updated : c))
                        }
                    />
                )}
            </div>
        );
    }

    // Mapa (single, view=all, ou solo).
    return (
        <div className="p-2 sm:p-3 flex flex-col h-full">
            <div className="flex-1 min-h-0">
                {loading ? (
                    <LoadingState />
                ) : journeys.length === 0 ? (
                    <EmptyState projectId={projectId} />
                ) : effectiveSolo && soloJourneys.length === 0 ? (
                    <EmptyState projectId={projectId} />
                ) : (
                    <JourneyMap
                        projectId={projectId}
                        journeys={soloJourneys}
                        subflowsByJourney={subflowsByJourney}
                        casesBySubflow={casesBySubflow}
                        initialExpandedJourneyId={solo || focusJourneyId || undefined}
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
