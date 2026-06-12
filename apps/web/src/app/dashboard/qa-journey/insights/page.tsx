'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { ArrowLeft, BarChart3, Loader2, Map as MapIcon } from 'lucide-react';

import { KPICards } from '@/components/qa-journey/insights/KPICards';
import { JourneyTreemap } from '@/components/qa-journey/insights/JourneyTreemap';
import { CoverageTimeline } from '@/components/qa-journey/insights/CoverageTimeline';
import { GapsTable } from '@/components/qa-journey/insights/GapsTable';
import { ManualRunsCard } from '@/components/qa-journey/insights/ManualRunsCard';
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';

import { errorMessage, loadProjectOptions, type ProjectOption } from '@/lib/qa-journey/api';
import {
    loadProjectInsights,
    loadSnapshots,
    triggerSnapshot,
    type InsightsBundle,
} from '@/lib/qa-journey/insights-api';
import type { QAJourneySnapshot } from '@/types/qa-journey-insights';

export default function QAJourneyInsightsPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });

    const [bundle, setBundle] = useState<InsightsBundle | null>(null);
    const [snapshots, setSnapshots] = useState<QAJourneySnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [snapshotting, setSnapshotting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Projects
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            if (!projectId && list.length > 0) setProjectId(list[0].id);
        })();
        return () => { cancelled = true; };
    }, [projectId, setProjectId]);

    const reload = async () => {
        if (!projectId) { setBundle(null); setSnapshots([]); setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const [b, s] = await Promise.all([
                loadProjectInsights(projectId),
                loadSnapshots(projectId, 90),
            ]);
            setBundle(b);
            setSnapshots(s);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [projectId]);

    const handleSnapshotNow = async () => {
        if (!projectId) return;
        setSnapshotting(true);
        setError(null);
        try {
            await triggerSnapshot(projectId);
            // Recarrega snapshots após capturar
            const s = await loadSnapshots(projectId, 90);
            setSnapshots(s);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSnapshotting(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            <div className="flex flex-col gap-2">
                <Link href={`/dashboard/qa-journey?project=${projectId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-3 h-3" /> Voltar para o mapa
                </Link>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <BarChart3 className="w-6 h-6 text-brand" />
                            Insights da Jornada
                        </h1>
                        <p className="text-textSecondary mt-1">
                            KPIs executivos, evolução semanal e gaps de cobertura — apresentável para liderança.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={projectId}
                            onChange={e => setProjectId(e.target.value || null)}
                            className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[200px]"
                            disabled={projects.length === 0}
                        >
                            {projects.length === 0 && <option value="">Sem projetos</option>}
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Link
                            href={`/dashboard/qa-journey?project=${projectId}`}
                            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                        >
                            <MapIcon className="w-3.5 h-3.5" /> Mapa visual
                        </Link>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 text-sm text-danger">
                    {error}
                </div>
            )}

            {loading && (
                <div className="bg-card rounded-2xl p-12 text-center text-textSecondary text-sm border border-border">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando insights…
                </div>
            )}

            {!loading && bundle?.migrationMissing && <MigrationMissingBanner />}

            {!loading && bundle && !bundle.migrationMissing && (
                <>
                    <KPICards aggregate={bundle.aggregate} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <JourneyTreemap data={bundle.treemap} />
                        <CoverageTimeline
                            snapshots={snapshots}
                            onSnapshotNow={handleSnapshotNow}
                            snapshotting={snapshotting}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-4 items-start">
                        <ManualRunsCard aggregate={bundle.aggregate} />
                        <GapsTable gaps={bundle.gaps} projectId={projectId} />
                    </div>
                </>
            )}
        </div>
    );
}
