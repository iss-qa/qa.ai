'use client';

import { ArrowLeft, CheckCircle2, Clock, XCircle, ChevronRight, Video, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function RunDetailsPage() {
    const params = useParams();
    const runId = params.id as string;

    // Simulated data for the MVP
    const isMockSuccess = runId !== '1';

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-6">

            {/* Header / Breadcrumb */}
            <div className="flex flex-col gap-4">
                <Link href="/dashboard" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium w-fit transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar para Dashboard
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-white">Execução #{runId}</h1>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${isMockSuccess ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                                }`}>
                                {isMockSuccess ? 'Sucesso' : 'Falha'}
                            </span>
                        </div>
                        <p className="text-slate-400 mt-2 text-sm flex items-center gap-2">
                            <span>Teste: <strong className="text-white">Login Principal</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Hoje, 14:32</span>
                            <span>•</span>
                            <span>Duração: 42s</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2">
                            <Video className="w-4 h-4" /> Ver Gravação
                        </button>
                        <button className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Gerar Relatório
                        </button>
                    </div>
                </div>
            </div>

            {/* Steps Timeline */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 mt-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Passos da Execução</h3>

                <div className="flex flex-col gap-4 relative">
                    <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-100"></div>

                    {/* Step 1 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 border-4 border-white">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-900">Acessar tela de Login</h4>
                                <span className="text-xs text-slate-400 font-medium">1.2s</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-1">Navegação para a rota /login completada com sucesso.</p>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 border-4 border-white">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-900">Preencher credenciais</h4>
                                <span className="text-xs text-slate-400 font-medium">2.5s</span>
                            </div>
                            <p className="text-sm text-slate-500 mt-1">Email e senha preenchidos conforme dados de teste.</p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white ${isMockSuccess ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {isMockSuccess ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className={`flex-1 border rounded-xl p-4 ${isMockSuccess ? 'bg-slate-50 border-slate-100' : 'bg-red-50 border-red-100'}`}>
                            <div className="flex items-center justify-between">
                                <h4 className={`font-bold ${isMockSuccess ? 'text-slate-900' : 'text-red-900'}`}>
                                    {isMockSuccess ? 'Clicar em Entrar e Aguardar Dashboard' : 'Falha ao validar Dashboard'}
                                </h4>
                                <span className={`text-xs font-medium ${isMockSuccess ? 'text-slate-400' : 'text-red-500'}`}>
                                    {isMockSuccess ? '4.1s' : 'Demorou muito (timeout local)'}
                                </span>
                            </div>
                            <p className={`text-sm mt-1 ${isMockSuccess ? 'text-slate-500' : 'text-red-700'}`}>
                                {isMockSuccess
                                    ? 'Elemento "Bem-vindo" apareceu na tela.'
                                    : 'O elemento "#dashboard-header" não foi encontrado após 10000ms. Verifique a captura de tela.'}
                            </p>
                            {!isMockSuccess && (
                                <button className="mt-3 text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded hover:bg-red-200 transition-colors">
                                    Ver Detalhes do Erro
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}
