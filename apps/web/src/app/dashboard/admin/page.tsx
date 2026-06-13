'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Building2, Plus, ShieldAlert, ShieldCheck, Power, PowerOff, X,
} from 'lucide-react';

type Org = {
    id: string;
    slug: string;
    name: string;
    plan: string;
    cnpj: string | null;
    is_active: boolean;
    created_at: string;
};

const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;

function slugify(name: string): string {
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
}

export default function AdminPage() {
    const [isMaster, setIsMaster] = useState<boolean | null>(null);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCnpj, setNewCnpj] = useState('');
    const [newPlan, setNewPlan] = useState<string>('free');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    const loadOrgs = async () => {
        const { data } = await supabase
            .from('organizations')
            .select('id, slug, name, plan, cnpj, is_active, created_at')
            .order('created_at', { ascending: false });
        setOrgs(data ?? []);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setIsMaster(false); return; }
            const { data: profile } = await supabase
                .from('profiles').select('is_master_admin').eq('id', user.id).maybeSingle();
            if (cancelled) return;
            const master = profile?.is_master_admin === true;
            setIsMaster(master);
            if (master) await loadOrgs();
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const createOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const { error: err } = await supabase.from('organizations').insert({
            name: newName,
            slug: slugify(newName),
            plan: newPlan,
            cnpj: newCnpj || null,
        });
        setSaving(false);
        if (err) { setError(err.message); return; }
        setShowCreate(false);
        setNewName(''); setNewCnpj(''); setNewPlan('free');
        await loadOrgs();
    };

    const updateOrg = async (id: string, patch: Partial<Org>) => {
        const { error: err } = await supabase.from('organizations').update(patch).eq('id', id);
        if (err) { setError(err.message); return; }
        setOrgs((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    };

    if (isMaster === null) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 space-y-4">
                <div className="h-8 w-56 rounded-lg bg-surface-muted animate-pulse" />
                <div className="h-72 rounded-2xl bg-surface-muted animate-pulse" />
            </div>
        );
    }

    if (!isMaster) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center text-center py-24 gap-4">
                <ShieldAlert className="w-12 h-12 text-warning" />
                <h1 className="text-xl font-bold text-foreground">Acesso restrito</h1>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Esta área é exclusiva do administrador master do QAMind.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-brand" /> Administração
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Organizações cadastradas na plataforma.</p>
                </div>
                <button
                    onClick={() => setShowCreate((v) => !v)}
                    className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all self-start sm:self-auto"
                >
                    {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showCreate ? 'Cancelar' : 'Nova organização'}
                </button>
            </div>

            {error && (
                <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {showCreate && (
                <form onSubmit={createOrg} className="bg-card border border-border rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="lg:col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome</label>
                        <input required value={newName} onChange={(e) => setNewName(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-brand/50" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">CNPJ</label>
                        <input value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-brand/50" />
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plano</label>
                            <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)}
                                className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-brand/50">
                                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <button type="submit" disabled={saving}
                            className="bg-brand hover:bg-brand/90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-60 self-end">
                            {saving ? '...' : 'Criar'}
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                                <th className="px-5 py-3.5 font-semibold">Organização</th>
                                <th className="px-5 py-3.5 font-semibold">Slug</th>
                                <th className="px-5 py-3.5 font-semibold">CNPJ</th>
                                <th className="px-5 py-3.5 font-semibold">Plano</th>
                                <th className="px-5 py-3.5 font-semibold">Status</th>
                                <th className="px-5 py-3.5 font-semibold text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orgs.map((org) => (
                                <tr key={org.id} className="border-b border-border last:border-0 hover:bg-foreground/[0.02] transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                                                <Building2 className="w-4 h-4 text-brand" />
                                            </div>
                                            <span className="font-medium text-foreground">{org.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{org.slug}</td>
                                    <td className="px-5 py-3.5 text-muted-foreground">{org.cnpj || '—'}</td>
                                    <td className="px-5 py-3.5">
                                        <select
                                            value={org.plan}
                                            onChange={(e) => updateOrg(org.id, { plan: e.target.value })}
                                            className="bg-background border border-border rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:border-brand/50 cursor-pointer"
                                        >
                                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${org.is_active
                                            ? 'text-success bg-success/10'
                                            : 'text-muted-foreground bg-foreground/5'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
                                            {org.is_active ? 'Ativa' : 'Inativa'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <button
                                            onClick={() => updateOrg(org.id, { is_active: !org.is_active })}
                                            title={org.is_active ? 'Desativar' : 'Ativar'}
                                            className={`p-2 rounded-lg transition-colors cursor-pointer ${org.is_active
                                                ? 'text-danger hover:bg-danger/10'
                                                : 'text-success hover:bg-success/10'}`}
                                        >
                                            {org.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {orgs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                                        Nenhuma organização cadastrada.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
