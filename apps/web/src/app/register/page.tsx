'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                    }
                }
            });

            if (authError) throw authError;

            if (data.user) {
                setSuccess(true);
                // O Supabase por padrão envia e-mail de confirmação. 
                // Se o e-mail estiver desabilitado no console, ele loga direto.
                setTimeout(() => {
                    router.push('/login');
                }, 2000);
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao criar conta');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white p-8 rounded-lg shadow-sm border w-full max-w-sm">
                <h1 className="text-2xl font-bold text-center mb-6">Cadastro QAMind</h1>

                {success ? (
                    <div className="bg-green-50 text-green-700 p-4 rounded-md mb-4 text-sm">
                        Conta criada com sucesso! Redirecionando...
                    </div>
                ) : (
                    <form onSubmit={handleRegister} className="flex flex-col gap-4">
                        {error && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                                {error}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium mb-1">Nome Completo</label>
                            <input
                                type="text"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full border rounded-md p-2"
                                placeholder="Seu nome"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full border rounded-md p-2"
                                placeholder="seu@email.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Senha</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full border rounded-md p-2"
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#4A90D9] text-white py-2 rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Criando conta...' : 'Criar Conta'}
                        </button>

                        <p className="text-center text-sm text-slate-600 mt-2">
                            Já tem uma conta? <Link href="/login" className="text-blue-500 hover:underline">Faça login</Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
