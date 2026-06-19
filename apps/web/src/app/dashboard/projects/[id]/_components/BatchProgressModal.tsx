'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Layers, X, Clock } from 'lucide-react';

const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

interface BatchRow {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    duration_ms: number | null;
}

interface RunRow {
    id: string;
    test_case_id: string;
    status: 'passed' | 'failed' | 'running' | 'cancelled';
    duration_ms: number | null;
    error_message: string | null;
    test_cases: { name: string } | { name: string }[] | null;
}

function caseName(r: RunRow): string {
    const tc = Array.isArray(r.test_cases) ? r.test_cases[0] : r.test_cases;
    return tc?.name || 'teste';
}

// Modal de progresso de um lote: faz polling de test_batch_runs + test_runs
// (batch_run_id) até o lote concluir. O daemon executa em background.
export function BatchProgressModal({ batchRunId, projectId, onClose }: {
    batchRunId: string;
    projectId: string;
    onClose: () => void;
}) {
    const [batch, setBatch] = useState<BatchRow | null>(null);
    const [runs, setRuns] = useState<RunRow[]>([]);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Poll no DAEMON (lê via service key) — evita bloqueio de RLS nas tabelas
        // novas e funciona igual em PRD/localhost.
        const poll = async () => {
            try {
                const res = await fetch(`${DAEMON}/api/batches/${batchRunId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const b: BatchRow | null = data.batch || null;
                if (b) setBatch(b);
                if (Array.isArray(data.runs)) setRuns(data.runs as RunRow[]);
                // Para o polling quando o lote termina.
                if (b && (b.status === 'completed' || b.status === 'failed' || b.status === 'cancelled') && timer.current) {
                    clearInterval(timer.current);
                    timer.current = null;
                }
            } catch { /* daemon momentaneamente indisponível — segue tentando */ }
        };
        poll();
        timer.current = setInterval(poll, 2000);
        return () => { cancelled = true; if (timer.current) clearInterval(timer.current); };
    }, [batchRunId]);

    const total = batch?.total_tests ?? 0;
    const done = (batch?.passed_tests ?? 0) + (batch?.failed_tests ?? 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const finished = batch?.status === 'completed' || batch?.status === 'failed';

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        {finished ? <Layers className="w-5 h-5 text-brand" /> : <Loader2 className="w-5 h-5 text-brand animate-spin" />}
                        <h3 className="text-base font-bold text-foreground">
                            {finished ? 'Lote concluído' : 'Executando lote…'}
                        </h3>
                    </div>
                    <button onClick={onClose} title="Fechar (o lote continua rodando em segundo plano)"
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4">
                    {/* Progresso */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground tabular-nums">{done}/{total} testes</span>
                            <span className="inline-flex items-center gap-3 text-xs font-bold">
                                <span className="text-green-500">{batch?.passed_tests ?? 0} ✓</span>
                                <span className="text-red-500">{batch?.failed_tests ?? 0} ✗</span>
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
                        </div>
                    </div>

                    {/* Lista por teste */}
                    <ul className="flex flex-col gap-1 overflow-y-auto custom-scrollbar max-h-[44vh]">
                        {runs.map(r => {
                            const running = r.status === 'running' || (r.status !== 'passed' && r.status !== 'failed');
                            return (
                            <li key={r.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${running ? 'bg-brand/5 border-brand/30' : 'bg-foreground/[0.02] border-border'}`}>
                                {r.status === 'passed'
                                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                    : r.status === 'failed'
                                        ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                        : <Loader2 className="w-4 h-4 text-brand animate-spin shrink-0" />}
                                <span className={`text-xs truncate flex-1 ${running ? 'text-foreground font-semibold' : 'text-foreground'}`}>{caseName(r)}</span>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                    r.status === 'passed' ? 'bg-green-500/15 text-green-500'
                                    : r.status === 'failed' ? 'bg-red-500/15 text-red-500'
                                    : 'bg-brand/15 text-brand'}`}>
                                    {r.status === 'passed' ? 'Passou' : r.status === 'failed' ? 'Falhou' : 'Executando'}
                                </span>
                                {r.duration_ms != null && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums shrink-0">
                                        <Clock className="w-2.5 h-2.5" /> {(r.duration_ms / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </li>
                            );
                        })}
                        {runs.length === 0 && (
                            <li className="flex items-center gap-2 text-xs text-muted-foreground italic py-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                Preparando dispositivo e workspace… (o primeiro teste pode levar ~30s)
                            </li>
                        )}
                    </ul>

                    {finished && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                            <a
                                href={`/dashboard/reports/batch/${batchRunId}`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-colors"
                            >
                                <Layers className="w-3.5 h-3.5" /> Gerar relatório do lote (PDF)
                            </a>
                            <a
                                href={`/dashboard/reports?projectId=${projectId}`}
                                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                            >
                                Relatórios gerais →
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
