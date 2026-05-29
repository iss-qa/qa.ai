'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    History,
    Loader2,
    RefreshCcw,
    XCircle,
} from 'lucide-react';
import { listSyncs } from '@/lib/qa-journey/sheet-api';
import { loadProjectOptions, type ProjectOption } from '@/lib/qa-journey/api';
import type { QAJourneySync } from '@/types/qa-journey-sheet';

const SYNC_SOURCE_LABEL: Record<string, string> = {
    google_sheets: 'Google Sheets',
    jira: 'Jira',
    manual: 'Manual',
};

export default function SyncHistoryPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    const [syncs, setSyncs] = useState<QAJourneySync[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        if (!projectId) { setSyncs([]); setLoading(false); return; }
        setError(null);
        setLoading(true);
        try {
            const list = await listSyncs(projectId, 100);
            setSyncs(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [projectId]);

    return (
        <div className="p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            <div className="flex flex-col gap-2">
                <Link href={`/dashboard/qa-journey/admin/sheets?project=${projectId}`} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                    <ArrowLeft className="w-3 h-3" /> Voltar para mapeamentos
                </Link>
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <History className="w-6 h-6 text-brand" />
                            Histórico de syncs
                        </h1>
                        <p className="text-textSecondary mt-1">
                            Cada execução de sync (manual ou via cron) deixa um registro aqui — útil para auditar quando um caso foi criado/atualizado.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={projectId}
                            onChange={e => setProjectId(e.target.value || null)}
                            className="bg-white border border-black/5 rounded-lg px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[200px]"
                        >
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button
                            onClick={reload}
                            className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                        >
                            <RefreshCcw className="w-3.5 h-3.5" /> Recarregar
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">
                    Falha ao carregar: {error}
                </div>
            )}

            {loading && !error && (
                <div className="bg-white rounded-2xl p-8 text-center text-textSecondary text-sm border border-black/5">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando histórico…
                </div>
            )}

            {!loading && !error && syncs.length === 0 && (
                <div className="bg-white rounded-2xl p-10 text-center text-sm text-textSecondary border border-black/5">
                    Nenhum sync registrado ainda para este projeto.
                </div>
            )}

            {!loading && !error && syncs.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-slate-50/50 text-slate-400 font-bold tracking-widest border-b border-black/[0.03]">
                            <tr>
                                <th className="px-6 py-4 w-24">Status</th>
                                <th className="px-6 py-4">Fonte</th>
                                <th className="px-6 py-4">Iniciado</th>
                                <th className="px-6 py-4">Duração</th>
                                <th className="px-6 py-4">Importados</th>
                                <th className="px-6 py-4">Atualizados</th>
                                <th className="px-6 py-4">Pulados</th>
                                <th className="px-6 py-4">Detalhe</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {syncs.map(s => {
                                const started = new Date(s.started_at);
                                const finished = s.finished_at ? new Date(s.finished_at) : null;
                                const duration = finished ? Math.round((finished.getTime() - started.getTime()) / 1000) : null;
                                return (
                                    <tr key={s.id} className="hover:bg-slate-50/30">
                                        <td className="px-6 py-3">
                                            <StatusPill status={s.status} />
                                        </td>
                                        <td className="px-6 py-3 text-xs">{SYNC_SOURCE_LABEL[s.source] || s.source}</td>
                                        <td className="px-6 py-3 text-xs">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                {started.toLocaleString('pt-BR')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-xs">{duration !== null ? `${duration}s` : '—'}</td>
                                        <td className="px-6 py-3 text-xs font-mono text-green-600">{s.rows_imported}</td>
                                        <td className="px-6 py-3 text-xs font-mono text-blue-600">{s.rows_updated}</td>
                                        <td className="px-6 py-3 text-xs font-mono text-amber-600">{s.rows_skipped}</td>
                                        <td className="px-6 py-3 text-xs max-w-[400px]">
                                            {s.status === 'error' && s.error_message ? (
                                                <span className="text-red-600 line-clamp-2" title={s.error_message}>{s.error_message}</span>
                                            ) : (
                                                <span className="text-slate-400">{s.source_ref || '—'}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: 'running' | 'success' | 'error' }) {
    if (status === 'success') return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/20 text-green-700">
            <CheckCircle2 className="w-3 h-3" /> OK
        </span>
    );
    if (status === 'error') return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-700">
            <XCircle className="w-3 h-3" /> Erro
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-700">
            <Loader2 className="w-3 h-3 animate-spin" /> Rodando
        </span>
    );
}
