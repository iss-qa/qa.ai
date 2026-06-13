'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Activity, ArrowRight, Building2, Lock, Mail, User, Users,
    Briefcase, MapPin, Globe, Hash, CheckCircle2,
} from 'lucide-react';

type OrgOption = { id: string; name: string; slug: string };
type OrgMode = 'create' | 'join';

const inputClass =
    'w-full bg-background/50 border border-border text-foreground placeholder:text-muted-foreground rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all text-sm';

function Field({
    icon: Icon, ...props
}: { icon: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Icon className="h-4 w-4 text-muted-foreground group-focus-within:text-brand transition-colors" />
            </div>
            <input className={inputClass} {...props} />
        </div>
    );
}

export default function RegisterPage() {
    // Dados do QA
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [funcao, setFuncao] = useState('');
    const [squad, setSquad] = useState('');
    const [password, setPassword] = useState('');

    // Organização
    const [orgMode, setOrgMode] = useState<OrgMode>('create');
    const [orgName, setOrgName] = useState('');
    const [orgCnpj, setOrgCnpj] = useState('');
    const [orgAddress, setOrgAddress] = useState('');
    const [orgWebsite, setOrgWebsite] = useState('');
    const [orgs, setOrgs] = useState<OrgOption[]>([]);
    const [joinOrgId, setJoinOrgId] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        supabase
            .from('organizations')
            .select('id, name, slug')
            .eq('is_active', true)
            .order('name')
            .then(({ data }) => setOrgs(data ?? []));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('A senha deve ter pelo menos 8 caracteres.');
            return;
        }
        if (orgMode === 'create' && !orgName.trim()) {
            setError('Informe o nome da organização.');
            return;
        }
        if (orgMode === 'join' && !joinOrgId) {
            setError('Selecione a organização que deseja entrar.');
            return;
        }

        setLoading(true);
        try {
            // O trigger handle_new_user (migration 011) materializa profile,
            // organização e membership a partir deste metadata.
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        funcao,
                        squad,
                        org_mode: orgMode,
                        ...(orgMode === 'create'
                            ? {
                                org_name: orgName,
                                org_cnpj: orgCnpj,
                                org_address: orgAddress,
                                org_website: orgWebsite,
                            }
                            : { org_id: joinOrgId }),
                    },
                },
            });

            if (authError) throw authError;

            if (data.user) {
                setSuccess(true);
                setTimeout(() => router.push('/login'), 2500);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar conta');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden py-10 px-4">
            {/* Background Ambient Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-brand/20 blur-[120px] rounded-full pointer-events-none opacity-50" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[30vw] h-[30vw] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none opacity-50" />

            <div className="relative w-full max-w-lg z-10">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <Link href="/" className="w-14 h-14 bg-gradient-to-br from-brand to-blue-400 rounded-2xl flex items-center justify-center shadow-lg shadow-brand/30 mb-4">
                        <Activity className="w-7 h-7 text-white" />
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Criar conta no QAMind</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Seu QA pertence a uma organização</p>
                </div>

                <div className="bg-card/60 backdrop-blur-2xl border border-border rounded-3xl p-6 sm:p-8 shadow-2xl">
                    {success ? (
                        <div className="flex flex-col items-center text-center gap-3 py-8">
                            <CheckCircle2 className="w-12 h-12 text-success" />
                            <h2 className="text-lg font-semibold text-foreground">Conta criada com sucesso!</h2>
                            <p className="text-sm text-muted-foreground">
                                Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.
                                Redirecionando para o login...
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleRegister} className="flex flex-col gap-5">
                            {error && (
                                <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Seção 1 — Dados do QA */}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Seus dados</p>
                                <div className="flex flex-col gap-3">
                                    <Field icon={User} type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" />
                                    <Field icon={Mail} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field icon={Briefcase} type="text" value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Função (QA Engineer...)" />
                                        <Field icon={Users} type="text" value={squad} onChange={(e) => setSquad(e.target.value)} placeholder="Squad / Time" />
                                    </div>
                                    <Field icon={Lock} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha (mín. 8 caracteres)" />
                                </div>
                            </div>

                            {/* Seção 2 — Organização */}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Organização</p>
                                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-muted border border-border mb-3">
                                    {([
                                        ['create', 'Criar organização'],
                                        ['join', 'Entrar em existente'],
                                    ] as [OrgMode, string][]).map(([mode, label]) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setOrgMode(mode)}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all ${orgMode === mode
                                                ? 'bg-brand text-white shadow'
                                                : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {orgMode === 'create' ? (
                                    <div className="flex flex-col gap-3">
                                        <Field icon={Building2} type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Nome da organização" />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Field icon={Hash} type="text" value={orgCnpj} onChange={(e) => setOrgCnpj(e.target.value)} placeholder="CNPJ (opcional)" />
                                            <Field icon={Globe} type="text" value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="Site (opcional)" />
                                        </div>
                                        <Field icon={MapPin} type="text" value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} placeholder="Endereço (opcional)" />
                                        <p className="text-[11px] text-muted-foreground">
                                            Você será o <strong className="text-foreground">owner</strong> da organização e poderá convidar o time.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <select
                                                required
                                                value={joinOrgId}
                                                onChange={(e) => setJoinOrgId(e.target.value)}
                                                className={`${inputClass} appearance-none cursor-pointer`}
                                            >
                                                <option value="">Selecione a organização...</option>
                                                {orgs.map((org) => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Você entrará como <strong className="text-foreground">member</strong>. Um admin da organização pode ajustar seu papel depois.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="group w-full bg-brand hover:bg-brand/90 text-white font-semibold py-3.5 rounded-xl transition-all duration-300 disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Criando conta...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Criar Conta</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>

                            <p className="text-center text-sm text-muted-foreground">
                                Já tem uma conta?{' '}
                                <Link href="/login" className="text-foreground hover:text-brand transition-colors font-medium">
                                    Faça login
                                </Link>
                            </p>
                        </form>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-muted-foreground">© 2026 QAMind. Todos os direitos reservados.</p>
                </div>
            </div>
        </div>
    );
}
