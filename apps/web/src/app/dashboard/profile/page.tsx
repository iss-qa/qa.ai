'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    User, Briefcase, Users, Phone, Building2, Globe, MapPin, Hash,
    Mail, Save, ShieldCheck, BadgeCheck,
} from 'lucide-react';
import { initialsOf } from '@/components/layout/UserMenu';

type Profile = {
    id: string;
    email: string;
    full_name: string;
    funcao: string | null;
    squad: string | null;
    phone: string | null;
    avatar_url: string | null;
    is_master_admin: boolean;
};

type Organization = {
    id: string;
    slug: string;
    name: string;
    plan: string;
    cnpj: string | null;
    address: string | null;
    website: string | null;
    contact_email: string | null;
    description: string | null;
    is_active: boolean;
};

type MembershipRole = 'owner' | 'admin' | 'member' | 'viewer';

const inputClass =
    'w-full bg-background border border-border text-foreground placeholder:text-muted-foreground rounded-xl py-2.5 pl-10 pr-3 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all text-sm';

function Field({
    icon: Icon, label, ...props
}: { icon: React.ElementType; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <input className={inputClass} {...props} />
            </div>
        </div>
    );
}

const ROLE_LABEL: Record<MembershipRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Membro',
    viewer: 'Visualizador',
};

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [org, setOrg] = useState<Organization | null>(null);
    const [role, setRole] = useState<MembershipRole | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingOrg, setSavingOrg] = useState(false);
    const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

    const supabase = createClient();
    const canEditOrg = role === 'owner' || role === 'admin' || profile?.is_master_admin;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const [{ data: prof }, { data: membership }] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
                supabase.from('org_memberships').select('org_id, role').eq('user_id', user.id).maybeSingle(),
            ]);
            if (cancelled) return;

            setProfile(prof ?? null);
            if (membership) {
                setRole(membership.role as MembershipRole);
                const { data: organization } = await supabase
                    .from('organizations').select('*').eq('id', membership.org_id).maybeSingle();
                if (!cancelled) setOrg(organization ?? null);
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flash = (type: 'ok' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        setSavingProfile(true);
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: profile.full_name,
                funcao: profile.funcao,
                squad: profile.squad,
                phone: profile.phone,
            })
            .eq('id', profile.id);
        setSavingProfile(false);
        flash(error ? 'error' : 'ok', error ? `Erro ao salvar: ${error.message}` : 'Perfil atualizado com sucesso.');
    };

    const saveOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!org) return;
        setSavingOrg(true);
        const { error } = await supabase
            .from('organizations')
            .update({
                name: org.name,
                cnpj: org.cnpj,
                address: org.address,
                website: org.website,
                contact_email: org.contact_email,
                description: org.description,
            })
            .eq('id', org.id);
        setSavingOrg(false);
        flash(error ? 'error' : 'ok', error ? `Erro ao salvar: ${error.message}` : 'Organização atualizada com sucesso.');
    };

    if (loading) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-4">
                <div className="h-8 w-48 rounded-lg bg-surface-muted animate-pulse" />
                <div className="h-64 rounded-2xl bg-surface-muted animate-pulse" />
                <div className="h-64 rounded-2xl bg-surface-muted animate-pulse" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <p className="text-muted-foreground text-sm">
                    Perfil não encontrado. Verifique se a migration 011 foi aplicada no Supabase.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
                    <p className="text-sm text-muted-foreground mt-1">Seus dados pessoais e sua organização.</p>
                </div>
                {message && (
                    <div className={`px-4 py-2 rounded-xl text-sm border ${message.type === 'ok'
                        ? 'bg-success/10 border-success/20 text-success'
                        : 'bg-danger/10 border-danger/20 text-danger'}`}>
                        {message.text}
                    </div>
                )}
            </div>

            {/* Dados pessoais */}
            <form onSubmit={saveProfile} className="bg-card border border-border rounded-2xl p-5 sm:p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-lg font-bold text-brand shrink-0">
                        {initialsOf(profile.full_name, profile.email)}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-foreground truncate">{profile.full_name || 'Sem nome'}</p>
                            {profile.is_master_admin && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                                    <ShieldCheck className="w-3 h-3" /> Admin Master
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field icon={User} label="Nome completo" type="text" required value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
                    <Field icon={Mail} label="E-mail" type="email" value={profile.email} disabled
                        className={`${inputClass} opacity-60 cursor-not-allowed`} />
                    <Field icon={Briefcase} label="Função" type="text" value={profile.funcao ?? ''}
                        placeholder="QA Engineer, QA Lead, PO..."
                        onChange={(e) => setProfile({ ...profile, funcao: e.target.value })} />
                    <Field icon={Users} label="Squad / Time" type="text" value={profile.squad ?? ''}
                        placeholder="Squad Pagamentos..."
                        onChange={(e) => setProfile({ ...profile, squad: e.target.value })} />
                    <Field icon={Phone} label="Telefone" type="tel" value={profile.phone ?? ''}
                        placeholder="(11) 99999-9999"
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </div>

                <div className="flex justify-end mt-6">
                    <button type="submit" disabled={savingProfile}
                        className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                        <Save className="w-4 h-4" />
                        {savingProfile ? 'Salvando...' : 'Salvar perfil'}
                    </button>
                </div>
            </form>

            {/* Organização */}
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-brand" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-foreground">Organização</h2>
                            <p className="text-xs text-muted-foreground">
                                {org ? `Você é ${role ? ROLE_LABEL[role] : 'membro'} desta organização` : 'Você ainda não pertence a uma organização'}
                            </p>
                        </div>
                    </div>
                    {org && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 border border-success/20 px-3 py-1 rounded-full uppercase tracking-wider">
                            <BadgeCheck className="w-3.5 h-3.5" /> Plano {org.plan}
                        </span>
                    )}
                </div>

                {!org ? (
                    <p className="text-sm text-muted-foreground">
                        Peça a um administrador para vinculá-lo a uma organização, ou crie uma nova conta escolhendo &quot;Criar organização&quot;.
                    </p>
                ) : canEditOrg ? (
                    <form onSubmit={saveOrg}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field icon={Building2} label="Nome" type="text" required value={org.name}
                                onChange={(e) => setOrg({ ...org, name: e.target.value })} />
                            <Field icon={Hash} label="CNPJ" type="text" value={org.cnpj ?? ''}
                                onChange={(e) => setOrg({ ...org, cnpj: e.target.value })} />
                            <Field icon={Globe} label="Site" type="text" value={org.website ?? ''}
                                onChange={(e) => setOrg({ ...org, website: e.target.value })} />
                            <Field icon={Mail} label="E-mail de contato" type="email" value={org.contact_email ?? ''}
                                onChange={(e) => setOrg({ ...org, contact_email: e.target.value })} />
                            <div className="sm:col-span-2">
                                <Field icon={MapPin} label="Endereço" type="text" value={org.address ?? ''}
                                    onChange={(e) => setOrg({ ...org, address: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex justify-end mt-6">
                            <button type="submit" disabled={savingOrg}
                                className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                                <Save className="w-4 h-4" />
                                {savingOrg ? 'Salvando...' : 'Salvar organização'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        {[
                            ['Nome', org.name],
                            ['Slug', org.slug],
                            ['CNPJ', org.cnpj],
                            ['Endereço', org.address],
                            ['Site', org.website],
                            ['E-mail de contato', org.contact_email],
                        ].map(([label, value]) => (
                            <div key={label as string}>
                                <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
                                <dd className="text-foreground">{value || '—'}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>
        </div>
    );
}
