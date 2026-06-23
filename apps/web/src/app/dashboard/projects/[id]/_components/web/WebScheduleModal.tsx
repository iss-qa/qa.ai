'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, CalendarClock, Plus, Trash2, Power } from 'lucide-react';
import { listWebSpecs } from './web-api';
import type { RepoSpec } from './web-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { detail?: string; error?: string }).detail || (body as { error?: string }).error || res.statusText);
    return body as T;
}

interface WebSchedule {
    id: string;
    name: string;
    specs: string[];
    branch: string;
    cron: string;
    timezone: string;
    is_active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
}

const TZ_OPTIONS = ['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'];

const CRON_PRESETS = [
    { label: 'Todo dia 8h', value: '0 8 * * *' },
    { label: 'Dias úteis 8h', value: '0 8 * * 1-5' },
    { label: 'Dias úteis 18h', value: '0 18 * * 1-5' },
    { label: 'Todo dia 0h', value: '0 0 * * *' },
    { label: 'Toda hora', value: '0 * * * *' },
];

interface Props {
    projectId: string;
    onClose: () => void;
}

export function WebScheduleModal({ projectId, onClose }: Props) {
    const [schedules, setSchedules] = useState<WebSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [specs, setSpecs] = useState<RepoSpec[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: '',
        specs: [] as string[],
        branch: 'main',
        cron: '0 8 * * 1-5',
        timezone: 'America/Sao_Paulo',
    });

    useEffect(() => {
        load();
        listWebSpecs(projectId).then(({ specs }) => setSpecs(specs)).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const load = async () => {
        setLoading(true);
        try {
            const { schedules } = await call<{ schedules: WebSchedule[] }>(`/web-schedules?projectId=${encodeURIComponent(projectId)}`);
            setSchedules(schedules);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    const toggleSpec = (path: string) => {
        setForm(f => ({
            ...f,
            specs: f.specs.includes(path) ? f.specs.filter(s => s !== path) : [...f.specs, path],
        }));
    };

    const handleCreate = async () => {
        if (!form.name.trim() || !form.cron.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await call('/web-schedules', {
                method: 'POST',
                body: JSON.stringify({ projectId, ...form }),
            });
            setCreating(false);
            setForm({ name: '', specs: [], branch: 'main', cron: '0 8 * * 1-5', timezone: 'America/Sao_Paulo' });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (sched: WebSchedule) => {
        try {
            await call(`/web-schedules/${sched.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !sched.is_active }) });
            setSchedules(ss => ss.map(s => s.id === sched.id ? { ...s, is_active: !s.is_active } : s));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const deleteSchedule = async (id: string) => {
        try {
            await call(`/web-schedules/${id}`, { method: 'DELETE' });
            setSchedules(ss => ss.filter(s => s.id !== id));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors z-10">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6 border-b border-border">
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-brand" /> Agendamentos Web
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Dispara o workflow do GitHub Actions automaticamente no horário configurado.
                    </p>
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-4">
                    {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>}

                    {/* Lista de agendamentos existentes */}
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : schedules.length === 0 && !creating ? (
                        <p className="text-center text-sm text-muted-foreground py-8">Nenhum agendamento configurado.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {schedules.map(sched => (
                                <div key={sched.id} className={`border rounded-xl p-3 flex flex-col gap-2 ${sched.is_active ? 'border-border bg-foreground/[0.02]' : 'border-border/50 opacity-60'}`}>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => toggleActive(sched)} title={sched.is_active ? 'Desativar' : 'Ativar'}
                                            className={`p-1 rounded-md transition-colors ${sched.is_active ? 'text-success hover:text-success/80' : 'text-muted-foreground hover:text-foreground'}`}>
                                            <Power className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-sm font-bold text-foreground flex-1">{sched.name}</span>
                                        <button onClick={() => deleteSchedule(sched.id)} className="p-1 text-muted-foreground hover:text-danger rounded-md transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pl-6">
                                        <span className="font-mono">{sched.cron}</span>
                                        <span>{sched.timezone}</span>
                                        <span className="font-mono">{sched.branch}</span>
                                        {sched.specs.length > 0
                                            ? <span>{sched.specs.length} spec(s) selecionado(s)</span>
                                            : <span>Suite inteira</span>}
                                        {sched.last_run_at && <span>Último: {new Date(sched.last_run_at).toLocaleString('pt-BR')}</span>}
                                    </div>
                                    {sched.specs.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pl-6">
                                            {sched.specs.map(s => (
                                                <span key={s} className="font-mono text-[10px] bg-foreground/10 border border-border rounded px-1.5 py-0.5 text-foreground">{s.split('/').pop()}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Formulário de novo agendamento */}
                    {creating ? (
                        <div className="border border-brand/30 bg-brand/5 rounded-xl p-4 flex flex-col gap-3">
                            <p className="text-xs font-bold text-brand">Novo agendamento</p>

                            <Field label="Nome">
                                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Ex.: Regressão diária" className={inputClass} autoFocus />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Branch">
                                    <input type="text" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                                        placeholder="main" className={`${inputClass} font-mono`} />
                                </Field>
                                <Field label="Timezone">
                                    <select value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} className={inputClass}>
                                        {TZ_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                                    </select>
                                </Field>
                            </div>

                            <Field label="Horário (cron)">
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {CRON_PRESETS.map(p => (
                                        <button key={p.value} type="button" onClick={() => setForm(f => ({ ...f, cron: p.value }))}
                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${form.cron === p.value ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:border-brand/40'}`}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <input type="text" value={form.cron} onChange={e => setForm(f => ({ ...f, cron: e.target.value }))}
                                    placeholder="0 8 * * 1-5" className={`${inputClass} font-mono`} />
                            </Field>

                            <Field label={`Specs (${form.specs.length === 0 ? 'suite inteira' : form.specs.length + ' selecionadas'})`}>
                                {specs.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground">Nenhuma spec carregada — será usada a suite inteira.</p>
                                ) : (
                                    <div className="flex flex-col gap-1 max-h-36 overflow-y-auto custom-scrollbar border border-border rounded-lg p-2 bg-background">
                                        {specs.map(s => (
                                            <label key={s.path} className="flex items-center gap-2 cursor-pointer hover:bg-accent/40 px-1.5 py-1 rounded-md transition-colors">
                                                <input type="checkbox" checked={form.specs.includes(s.path)} onChange={() => toggleSpec(s.path)} className="accent-brand" />
                                                <span className="text-[11px] text-foreground">{s.name}</span>
                                                <span className="text-[10px] text-muted-foreground font-mono truncate">{s.path}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </Field>

                            <div className="flex gap-2 justify-end pt-1">
                                <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                                <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.cron.trim()}
                                    className="px-4 py-1.5 bg-brand text-black text-xs font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-1.5">
                                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Criar agendamento
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setCreating(true)}
                            className="w-full border border-dashed border-border rounded-xl p-3 text-xs text-muted-foreground hover:text-foreground hover:border-brand/50 transition-colors flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> Novo agendamento
                        </button>
                    )}
                </div>

                <div className="p-4 border-t border-border flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold bg-foreground/5 text-foreground rounded-lg hover:bg-foreground/10 transition-colors">Fechar</button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';
