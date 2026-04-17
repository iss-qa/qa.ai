'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Activity, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
    // Valores padrão preenchidos para facilitar os testes do usuário Isaias
    const [email, setEmail] = useState('isaias.silva@foxbit.com.br');
    const [password, setPassword] = useState('Q@mind2026!@#$');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            if (data.user) {
                // Hard navigation to avoid waiting for router refresh state loop
                window.location.href = '/dashboard';
                return; // Early return keeps loading state visible
            }
        } catch (err: any) {
            setError(err.message || 'Credenciais inválidas');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden font-sans">
            {/* Background Ambient Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-500/30 blur-[120px] rounded-full pointer-events-none opacity-50 mix-blend-screen animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[30vw] h-[30vw] bg-purple-500/20 blur-[100px] rounded-full pointer-events-none opacity-50 mix-blend-screen" />

            {/* Login Container */}
            <div className="relative w-full max-w-md z-10 px-6">

                {/* Logo Area */}
                <div className="flex flex-col items-center mb-10 transition-all">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)] mb-4">
                        <Activity className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">QAMind</h1>
                    <p className="text-slate-400 mt-2 text-sm">Plataforma Inteligente de Qualidade</p>
                </div>

                {/* Glassmorphic Card */}
                <div className="bg-slate-800/60 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl transition-all">
                    <form onSubmit={handleLogin} className="flex flex-col gap-5">
                        <div className="mb-2">
                            <h2 className="text-xl font-semibold text-white">Bem-vindo de volta</h2>
                            <p className="text-slate-400 text-sm mt-1">Faça login para continuar</p>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            {/* Email Input */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-white/10 text-white placeholder:text-slate-500 rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-medium"
                                    placeholder="seu@email.com"
                                />
                            </div>

                            {/* Password Input */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-white/10 text-white placeholder:text-slate-500 rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-medium tracking-widest"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="w-4 h-4 rounded border border-white/20 bg-slate-900/50 group-hover:border-blue-500 transition-colors flex items-center justify-center">
                                    <ShieldCheck className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Lembrar-me (Testes)</span>
                            </label>
                            <a href="#" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">Esqueceu a senha?</a>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none disabled:transform-none overflow-hidden mt-2 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)]"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Autenticando...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Entrar na Plataforma</span>
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </span>
                            {/* Hover effect highlight */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        </button>

                        <p className="text-center text-sm text-slate-400 mt-6">
                            Não tem uma conta? {' '}
                            <Link href="/register" className="text-white hover:text-blue-400 transition-colors font-medium">
                                Solicite acesso
                            </Link>
                        </p>
                    </form>
                </div>

                {/* Footer safe margin */}
                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-500">© 2026 QAMind. Todos os direitos reservados.</p>
                </div>
            </div>
        </div>
    );
}
