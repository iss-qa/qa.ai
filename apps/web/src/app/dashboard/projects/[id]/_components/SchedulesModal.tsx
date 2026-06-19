'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { CalendarClock, Clock, Trash2, X, Plus, Power, Loader2, Info, Layers, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { batchOutcome } from '../project-utils';

const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

interface Schedule {
    id: string;
    name: string;
    test_ids: string[];
    cron: string;
    timezone: string;
    is_active: boolean;
    next_run_at: string | null;
    last_run_at: string | null;
}

interface BatchRun {
    id: string;
    name: string | null;
    status: string;
    triggered_by: string | null;
    schedule_id: string | null;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    started_at: string | null;
    duration_ms: number | null;
}

type Freq = 'daily' | 'weekdays' | 'weekly' | 'hourly';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Preset → expressão cron (5 campos).
function buildCron(freq: Freq, time: string, dow: number, everyN: number): string {
    const [h, m] = time.split(':').map(n => parseInt(n, 10) || 0);
    switch (freq) {
        case 'daily': return `${m} ${h} * * *`;
        case 'weekdays': return `${m} ${h} * * 1-5`;
        case 'weekly': return `${m} ${h} * * ${dow}`;
        case 'hourly': return `0 */${Math.max(1, everyN)} * * *`;
    }
}

// Texto curto a partir do cron dos presets.
function cronToText(cron: string): string {
    const p = cron.split(' ');
    if (p.length !== 5) return cron;
    const [m, h, , , dow] = p;
    const hh = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    if (h.startsWith('*/')) return `A cada ${h.slice(2)}h`;
    if (dow === '1-5') return `Dias úteis às ${hh}`;
    if (dow === '*') return `Diariamente às ${hh}`;
    const d = parseInt(dow, 10);
    return `Toda ${WEEKDAYS[(d % 7)]} às ${hh}`;
}

function fmt(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch { return iso; }
}

// Badge do DESFECHO real do lote: considera passou/falhou, não só se rodou.
function BatchStatusBadge({ batch }: { batch: BatchRun }) {
    const { label, tone } = batchOutcome(batch);
    const cls: Record<string, string> = {
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-danger/15 text-danger',
        running: 'bg-brand/15 text-brand',
        muted: 'bg-foreground/10 text-muted-foreground',
    };
    const Icon = tone === 'success' ? CheckCircle2 : tone === 'running' ? Loader2 : tone === 'muted' ? null : XCircle;
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${cls[tone]}`}>
            {Icon && <Icon className={`w-3 h-3 ${tone === 'running' ? 'animate-spin' : ''}`} />}{label}
        </span>
    );
}

// Modal de agendamentos: lista os existentes (ativar/excluir) e, quando
// aberto a partir de uma seleção, mostra o formulário de novo agendamento.
export function SchedulesModal({ projectId, deviceUdid, pendingTestIds, onClose }: {
    projectId: string;
    deviceUdid: string | null;
    pendingTestIds: string[] | null;
    onClose: () => void;
}) {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [batches, setBatches] = useState<BatchRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Após criar, esconde o formulário e mostra só a lista atualizada.
    const [createdFlag, setCreatedFlag] = useState(false);

    // Form (novo agendamento) — só quando veio de uma seleção.
    const [name, setName] = useState(pendingTestIds ? `Lote de ${pendingTestIds.length} teste(s)` : '');
    const [freq, setFreq] = useState<Freq>('weekdays');
    const [time, setTime] = useState('08:00');
    const [dow, setDow] = useState(1);
    const [everyN, setEveryN] = useState(6);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [schedRes, batchRes] = await Promise.all([
                fetch(`${DAEMON}/api/schedules?project_id=${projectId}`),
                fetch(`${DAEMON}/api/batches?project_id=${projectId}`),
            ]);
            const schedData = await schedRes.json().catch(() => []);
            if (schedRes.ok && Array.isArray(schedData)) setSchedules(schedData);
            const batchData = await batchRes.json().catch(() => []);
            if (batchRes.ok && Array.isArray(batchData)) setBatches(batchData);
        } catch { /* daemon offline */ }
        setLoading(false);
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const create = async () => {
        if (!pendingTestIds || pendingTestIds.length === 0) return;
        if (!deviceUdid) { setError('Conecte um dispositivo para agendar.'); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${DAEMON}/api/schedules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    name: name.trim() || `Lote de ${pendingTestIds.length} teste(s)`,
                    test_ids: pendingTestIds,
                    device_udid: deviceUdid,
                    cron: buildCron(freq, time, dow, everyN),
                    timezone: 'America/Sao_Paulo',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data?.detail || `Falha (${res.status})`); return; }
            await load();
            setCreatedFlag(true);   // esconde o form; lista atualizada aparece
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const showForm = !!pendingTestIds && pendingTestIds.length > 0 && !createdFlag;

    const toggle = async (s: Schedule) => {
        await fetch(`${DAEMON}/api/schedules/${s.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !s.is_active }),
        });
        load();
    };
    const remove = async (s: Schedule) => {
        await fetch(`${DAEMON}/api/schedules/${s.id}`, { method: 'DELETE' });
        load();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-brand" />
                        <h3 className="text-base font-bold text-foreground">Agendamentos</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
                    {/* Novo agendamento (a partir da seleção) */}
                    {showForm && (
                        <div className="rounded-xl border border-brand/30 bg-brand/[0.04] p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                <Plus className="w-4 h-4 text-brand" /> Novo agendamento
                                <span className="text-[11px] font-normal text-muted-foreground">({pendingTestIds!.length} teste(s) selecionado(s))</span>
                            </div>
                            <input
                                value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do agendamento"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50"
                            />
                            <div className="flex flex-wrap gap-2">
                                {([['weekdays', 'Dias úteis'], ['daily', 'Diariamente'], ['weekly', 'Semanal'], ['hourly', 'A cada N horas']] as [Freq, string][]).map(([f, label]) => (
                                    <button key={f} onClick={() => setFreq(f)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${freq === f ? 'border-brand/50 bg-brand/15 text-brand' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {freq === 'weekly' && (
                                    <select value={dow} onChange={(e) => setDow(parseInt(e.target.value, 10))}
                                        className="bg-background border border-border rounded-lg px-2 py-2 text-sm text-foreground">
                                        {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                    </select>
                                )}
                                {freq === 'hourly' ? (
                                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                        A cada
                                        <input type="number" min={1} max={24} value={everyN} onChange={(e) => setEveryN(parseInt(e.target.value, 10) || 1)}
                                            className="w-16 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground" />
                                        horas
                                    </label>
                                ) : (
                                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                                        className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground" />
                                )}
                            </div>
                            <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                                <Info className="w-4 h-4 shrink-0 text-warning mt-0.5" />
                                <div>
                                    <p className="font-bold text-foreground">Mantenha o dispositivo desbloqueado e a tela sempre ligada</p>
                                    <p className="mt-0.5">O lote roda no horário marcado mesmo sem ninguém por perto — se a tela bloquear ou apagar, a execução falha. Vale para celular físico e emulador.</p>
                                    <p className="mt-1">No Android: <span className="text-foreground">Opções do desenvolvedor → Permanecer ativo</span> (tela ligada enquanto no carregador) e aumente o <span className="text-foreground">tempo limite da tela</span> em Tela / Exibição.</p>
                                </div>
                            </div>
                            {error && <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1">{error}</p>}
                            <button onClick={create} disabled={saving}
                                className="self-start inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 disabled:opacity-60">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                                Criar agendamento
                            </button>
                        </div>
                    )}

                    {/* Lista de agendamentos */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Existentes</span>
                        {loading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                        ) : schedules.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2">Nenhum agendamento ainda.</p>
                        ) : schedules.map(s => (
                            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                                    <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
                                        <span>{cronToText(s.cron)}</span>
                                        <span>· {s.test_ids?.length || 0} teste(s)</span>
                                        {s.last_run_at && <span className="inline-flex items-center gap-0.5 text-foreground/70"><Clock className="w-2.5 h-2.5" /> últ.: {fmt(s.last_run_at)}</span>}
                                        <span className="inline-flex items-center gap-0.5">próx.: {fmt(s.next_run_at)}</span>
                                    </p>
                                </div>
                                <button onClick={() => toggle(s)} title={s.is_active ? 'Pausar' : 'Ativar'}
                                    className={`p-1.5 rounded-md transition-colors ${s.is_active ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-foreground/10'}`}>
                                    <Power className="w-4 h-4" />
                                </button>
                                <button onClick={() => remove(s)} title="Excluir agendamento"
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Histórico de execuções em lote (manuais + agendadas) */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" /> Execuções em lote
                            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">— manuais e agendadas (recentes)</span>
                        </span>
                        {loading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                        ) : batches.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2">Nenhuma execução em lote ainda.</p>
                        ) : batches.map(b => (
                            <Link key={b.id} href={`/dashboard/reports/batch/${b.id}`} onClick={onClose}
                                className="group flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 hover:border-brand/40 hover:bg-foreground/[0.05] transition-colors">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                                        {b.name || 'Lote de testes'}
                                        {b.schedule_id && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand/10 text-brand">Agendado</span>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
                                        <span>{fmt(b.started_at)}</span>
                                        <span>· {b.total_tests} teste(s)</span>
                                        {b.passed_tests > 0 && <span className="text-success">{b.passed_tests} ok</span>}
                                        {b.failed_tests > 0 && <span className="text-danger">{b.failed_tests} falhou</span>}
                                    </p>
                                </div>
                                <BatchStatusBadge batch={b} />
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
