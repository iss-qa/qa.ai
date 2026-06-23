'use client';

import { useEffect, useState } from 'react';
import { useQueryState } from 'nuqs';
import { FileBarChart, Loader2, Printer } from 'lucide-react';

import { ReportKpis } from '@/components/reports/ReportKpis';
import { RunsTrendCard } from '@/components/reports/RunsTrendCard';
import { BugsCard } from '@/components/reports/BugsCard';
import { JourneyCoverageCard } from '@/components/reports/JourneyCoverageCard';
import { FailuresTable } from '@/components/reports/FailuresTable';
import { FlowFailuresCard } from '@/components/reports/FlowFailuresCard';
import { NarrativeReportCard } from '@/components/reports/NarrativeReportCard';

import {
    errorMessage,
    getLastProjectId,
    loadProjectOptions,
    setLastProjectId,
    type ProjectOption,
} from '@/lib/qa-journey/api';
import { loadProjectReport, type ProjectReport, type ReportPeriodDays } from '@/lib/reports/api';

const PERIODS: { value: ReportPeriodDays; label: string }[] = [
    { value: 7, label: 'Últimos 7 dias' },
    { value: 15, label: 'Últimos 15 dias' },
    { value: 30, label: 'Últimos 30 dias' },
    { value: 90, label: 'Últimos 90 dias' },
];

export default function ReportsPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    const [days, setDays] = useState<ReportPeriodDays>(30);

    const [report, setReport] = useState<ProjectReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Preenchido só no cliente (pós-carga): datas no SSR divergem do browser
    // e causam erro de hidratação ("Text content does not match").
    const [generatedAt, setGeneratedAt] = useState('');

    // Boot: último projeto visitado dispara o relatório de imediato.
    useEffect(() => {
        if (!projectId) {
            const last = getLastProjectId();
            if (last) setProjectId(last);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadProjectOptions();
            if (cancelled) return;
            setProjects(list);
            setProjectId(prev => {
                if (prev && list.some(p => p.id === prev)) return prev;
                return list[0]?.id ?? null;
            });
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!projectId) {
            setReport(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        setLastProjectId(projectId);
        (async () => {
            try {
                const r = await loadProjectReport(projectId, days);
                if (!cancelled) {
                    setReport(r);
                    setGeneratedAt(new Date().toLocaleString('pt-BR'));
                }
            } catch (e) {
                if (!cancelled) setError(errorMessage(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, days]);

    const projectName = projects.find(p => p.id === projectId)?.name || '';
    const periodLabel = PERIODS.find(p => p.value === days)?.label.toLowerCase() || '';

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar print:overflow-visible print:h-auto">

            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <FileBarChart className="w-6 h-6 text-brand" />
                        Relatórios
                    </h1>
                    <p className="text-textSecondary mt-1">
                        Visão executiva do projeto: execuções, qualidade, cobertura das jornadas e pontos de atenção.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <div className="flex items-center gap-2">
                        <label htmlFor="report-project" className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                            Projeto
                        </label>
                        <select
                            id="report-project"
                            value={projectId}
                            onChange={e => setProjectId(e.target.value || null)}
                            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[160px]"
                            disabled={projects.length === 0}
                        >
                            {projects.length === 0 && <option value="">Sem projetos</option>}
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <select
                        value={days}
                        onChange={e => setDays(Number(e.target.value) as ReportPeriodDays)}
                        className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20"
                        aria-label="Período do relatório"
                    >
                        {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <button
                        onClick={() => window.print()}
                        disabled={!report}
                        className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                        title="Exportar como PDF (imprimir)"
                    >
                        <Printer className="w-4 h-4" /> Exportar PDF
                    </button>
                </div>
            </div>

            {/* Cabeçalho do documento — só na impressão */}
            <div className="hidden print:block border-b border-border pb-3">
                <p className="text-sm font-bold text-foreground">
                    Relatório de QA — {projectName} · {periodLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                    Gerado em {generatedAt} · QAMind
                </p>
            </div>

            {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 text-sm text-danger whitespace-pre-wrap">
                    {error}
                </div>
            )}

            {loading && (
                <div className="bg-card rounded-2xl p-12 text-center text-textSecondary text-sm border border-border">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Montando relatório…
                </div>
            )}

            {!loading && !error && !report && (
                <div className="bg-card rounded-2xl p-12 text-center text-textSecondary text-sm border border-border">
                    Selecione um projeto para gerar o relatório.
                </div>
            )}

            {!loading && report && (
                <>
                    <ReportKpis report={report} periodLabel={periodLabel} />

                    <NarrativeReportCard report={report} projectName={projectName} days={days} />

                    <RunsTrendCard report={report} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        <FlowFailuresCard report={report} />
                        <BugsCard report={report} />
                    </div>

                    <JourneyCoverageCard report={report} projectId={projectId} />

                    <FailuresTable report={report} />

                    <p className="text-[11px] text-muted-foreground text-center pb-4">
                        Relatório de <span className="font-bold text-foreground">{projectName}</span> · {periodLabel} ·
                        gerado em {generatedAt} pelo QAMind.
                    </p>
                </>
            )}
        </div>
    );
}
