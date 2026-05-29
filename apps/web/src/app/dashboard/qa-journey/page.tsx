'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { BarChart3, Loader2, Map as MapIcon, Settings } from 'lucide-react';

// JourneyMap pulls in React Flow (~300kB). Lazy-load it so the page shell +
// header paint instantly and the heavy canvas bundle only downloads when a
// project actually has a map to render. ssr:false — it's a client-only canvas.
const JourneyMap = dynamic(
    () => import('@/components/qa-journey/map/JourneyMap').then(m => m.JourneyMap),
    { ssr: false, loading: () => <LoadingState /> },
);
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';
import {
    loadJourneys,
    loadProjectOptions,
} from '@/lib/qa-journey/api';
import type { ProjectOption } from '@/lib/qa-journey/api';
import { supabase } from '@/lib/supabase';
import {
    QA_JOURNEY_MIGRATION_MISSING_CODE,
    type QAJourney,
    type QAJourneyCase,
    type QAJourneySubflow,
} from '@/types/qa-journey';

export default function QAJourneyPublicPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });

    const [journeys, setJourneys] = useState<QAJourney[]>([]);
    const [subflows, setSubflows] = useState<QAJourneySubflow[]>([]);
    const [cases, setCases] = useState<QAJourneyCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);

    // Projetos uma vez
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            if (!projectId && list.length > 0) {
                setProjectId(list[0].id);
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, setProjectId]);

    // Carrega tudo do projeto sempre que muda
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
        (async () => {
            // 1. Jornadas publicadas do projeto
            const { journeys: js, migrationMissing: mm } = await loadJourneys(projectId);
            if (cancelled) return;
            if (mm) {
                setMigrationMissing(true);
                setLoading(false);
                return;
            }
            const published = js.filter(j => j.is_published);
            setJourneys(published);

            if (published.length === 0) {
                setSubflows([]);
                setCases([]);
                setLoading(false);
                return;
            }

            // 2. Subflows das jornadas publicadas
            const journeyIds = published.map(j => j.id);
            const subRes = await supabase
                .from('qa_journey_subflows')
                .select('*')
                .in('journey_id', journeyIds)
                .order('sequence', { ascending: true })
                .order('created_at', { ascending: true });
            if (cancelled) return;
            if (subRes.error) {
                if ((subRes.error as { code?: string }).code === QA_JOURNEY_MIGRATION_MISSING_CODE) {
                    setMigrationMissing(true);
                    setLoading(false);
                    return;
                }
                console.error('subflows load failed:', subRes.error);
            }
            const subs = (subRes.data || []) as QAJourneySubflow[];
            setSubflows(subs);

            // 3. Casos
            if (subs.length === 0) {
                setCases([]);
                setLoading(false);
                return;
            }
            const subflowIds = subs.map(s => s.id);
            const caseRes = await supabase
                .from('qa_journey_cases')
                .select('*')
                .in('subflow_id', subflowIds)
                .is('archived_at', null)
                .order('created_at', { ascending: true });
            if (cancelled) return;
            if (caseRes.error) console.error('cases load failed:', caseRes.error);
            setCases((caseRes.data || []) as QAJourneyCase[]);
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

    return (
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto flex flex-col gap-4 h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3">
                    <MapIcon className="w-6 h-6 text-brand" />
                    <h1 className="text-2xl font-bold text-foreground">Jornada do QA</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <select
                        value={projectId}
                        onChange={e => setProjectId(e.target.value || null)}
                        className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[160px] sm:min-w-[200px]"
                        disabled={projects.length === 0}
                    >
                        {projects.length === 0 && <option value="">Sem projetos cadastrados</option>}
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <Link
                        href={`/dashboard/qa-journey/insights?project=${projectId}`}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                    >
                        <BarChart3 className="w-3.5 h-3.5" /> Insights
                    </Link>
                    <Link
                        href={`/dashboard/qa-journey/admin?project=${projectId}`}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
                    >
                        <Settings className="w-3.5 h-3.5" /> Admin
                    </Link>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-[600px]">
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
                    />
                )}
            </div>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="bg-card border border-border rounded-2xl h-full flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Carregando jornadas…
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
