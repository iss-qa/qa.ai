'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import {
    ArrowLeft,
    Clock,
    ExternalLink,
    FileSpreadsheet,
    History,
    Loader2,
    Plus,
    RefreshCcw,
    Trash2,
} from 'lucide-react';

import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';
import { loadProjectOptions, type ProjectOption } from '@/lib/qa-journey/api';
import {
    deleteSheetConfig,
    listSheetConfigs,
    runSync,
} from '@/lib/qa-journey/sheet-api';
import type { QAJourneySheetConfig, SyncRunResult } from '@/types/qa-journey-sheet';

export default function SheetConfigsListPage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectId, setProjectId] = useQueryState('project', { defaultValue: '' });
    const [configs, setConfigs] = useState<QAJourneySheetConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<Record<string, SyncRunResult>>({});
    const [deletingId, setDeletingId] = useState<string | null>(null);

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

    const reloadConfigs = async () => {
        if (!projectId) { setConfigs([]); setLoading(false); return; }
        setLoadError(null);
        setLoading(true);
        try {
            const list = await listSheetConfigs(projectId);
            setConfigs(list);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reloadConfigs(); /* eslint-disable-next-line */ }, [projectId]);

    const handleSync = async (configId: string) => {
        setSyncing(configId);
        setLastResult(prev => ({ ...prev }));
        try {
            const result = await runSync(configId);
            setLastResult(prev => ({ ...prev, [configId]: result }));
            await reloadConfigs();
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            setLastResult(prev => ({ ...prev, [configId]: {
                sync_id: '', status: 'error',
                rows_imported: 0, rows_updated: 0, rows_skipped: 0,
                skipped_reasons: [],
                error_message: detail,
            }}));
        } finally {
            setSyncing(null);
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        const id = deletingId;
        setDeletingId(null);
        try {
            await deleteSheetConfig(id);
            setConfigs(prev => prev.filter(c => c.id !== id));
        } catch (e) {
            alert('Erro ao excluir: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const sortedConfigs = useMemo(
        () => [...configs].sort((a, b) => a.sheet_name.localeCompare(b.sheet_name)),
        [configs],
    );

    const deletingTarget = deletingId ? configs.find(c => c.id === deletingId) : null;

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            <div className="flex flex-col gap-2">
                <Link href="/dashboard/qa-journey/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-3 h-3" /> Voltar para Jornadas
                </Link>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <FileSpreadsheet className="w-6 h-6 text-brand" />
                            Sync de Planilhas
                        </h1>
                        <p className="text-textSecondary mt-1">
                            Configure como o QAMind lê suas planilhas do Google Sheets — cada projeto pode ter N mapeamentos.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
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
                            href={`/dashboard/qa-journey/admin/syncs?project=${projectId}`}
                            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                        >
                            <History className="w-3.5 h-3.5" /> Histórico
                        </Link>
                        <Link
                            href={`/dashboard/qa-journey/admin/sheets/new?project=${projectId}`}
                            className={`bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2 ${!projectId ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <Plus className="w-4 h-4" /> Novo mapeamento
                        </Link>
                    </div>
                </div>
            </div>

            {loadError && (
                <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 text-sm text-danger">
                    Falha ao carregar configs: {loadError}
                    <div className="text-[11px] text-muted-foreground mt-1">
                        Verifique se o backend Fastify está rodando ({process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}).
                    </div>
                </div>
            )}

            {loading && !loadError && (
                <div className="bg-card rounded-2xl p-8 text-center text-textSecondary text-sm border border-border">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
                </div>
            )}

            {!loading && !loadError && sortedConfigs.length === 0 && (
                <div className="bg-card rounded-2xl p-10 text-center border border-border flex flex-col gap-3 items-center">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-bold">Nenhum mapeamento ainda.</p>
                    <p className="text-xs text-textSecondary max-w-md">
                        Crie um mapeamento para sincronizar uma aba do Google Sheets com a Jornada deste projeto.
                        Cada mapeamento define qual coluna da planilha corresponde a cada campo do QAMind.
                    </p>
                </div>
            )}

            {!loading && !loadError && sortedConfigs.length > 0 && (
                <div className="flex flex-col gap-3">
                    {sortedConfigs.map(config => {
                        const result = lastResult[config.id];
                        return (
                            <div key={config.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                                <div className="px-6 py-4 flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-foreground">{config.sheet_name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{config.spreadsheet_id.slice(0, 12)}…</span>
                                            {!config.is_active && (
                                                <span className="text-[10px] font-bold uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inativo</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                                            <span>Header linha {config.header_row}</span>
                                            <span>Dados a partir da linha {config.data_start_row}</span>
                                            <a
                                                href={`https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-brand hover:underline inline-flex items-center gap-1"
                                            >
                                                Abrir planilha <ExternalLink className="w-3 h-3" />
                                            </a>
                                            {config.last_sync_at && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Último sync: {new Date(config.last_sync_at).toLocaleString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleSync(config.id)}
                                            disabled={syncing === config.id}
                                            className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90 disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {syncing === config.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <RefreshCcw className="w-3.5 h-3.5" />}
                                            Sincronizar agora
                                        </button>
                                        <button
                                            onClick={() => setDeletingId(config.id)}
                                            className="text-muted-foreground hover:text-danger p-1.5 rounded-lg hover:bg-danger/10"
                                            title="Excluir mapeamento"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {result && (
                                    <div className={`px-6 py-3 border-t text-xs ${result.status === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
                                        {result.status === 'success' ? (
                                            <>
                                                <strong>Sync concluído.</strong> {result.rows_imported} novos, {result.rows_updated} atualizados, {result.rows_skipped} pulados.
                                                {result.skipped_reasons.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-[11px] text-muted-foreground">Ver linhas puladas ({result.skipped_reasons.length})</summary>
                                                        <ul className="mt-1 text-[11px] text-muted-foreground list-disc pl-5">
                                                            {result.skipped_reasons.slice(0, 20).map((r, i) => (
                                                                <li key={i}>Linha {r.row}: {r.reason}</li>
                                                            ))}
                                                            {result.skipped_reasons.length > 20 && (
                                                                <li className="italic">...e mais {result.skipped_reasons.length - 20}</li>
                                                            )}
                                                        </ul>
                                                    </details>
                                                )}
                                            </>
                                        ) : (
                                            <><strong>Erro:</strong> {result.error_message || 'desconhecido'}</>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {deletingTarget && (
                <DeleteConfirmModal
                    title="Excluir mapeamento?"
                    message={`O mapeamento da aba "${deletingTarget.sheet_name}" será removido. Os dados já sincronizados continuam no QAMind.`}
                    onCancel={() => setDeletingId(null)}
                    onConfirm={handleDelete}
                    confirmLabel="Excluir"
                />
            )}
        </div>
    );
}
