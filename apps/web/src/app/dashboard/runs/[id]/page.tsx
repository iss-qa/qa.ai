'use client';

import { ArrowLeft, CheckCircle2, Clock, XCircle, Video, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function RunDetailsPage() {
    const params = useParams();
    const runId = params.id as string;

    // Simulated data for the MVP
    const isMockSuccess = runId !== '1';

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-6">

            {/* Header / Breadcrumb */}
            <div className="flex flex-col gap-4">
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium w-fit transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar para Dashboard
                </Link>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-foreground">Execução #{runId}</h1>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${isMockSuccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                                }`}>
                                {isMockSuccess ? 'Sucesso' : 'Falha'}
                            </span>
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm flex flex-wrap items-center gap-2">
                            <span>Teste: <strong className="text-foreground">Login Principal</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Hoje, 14:32</span>
                            <span>•</span>
                            <span>Duração: 42s</span>
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button className="bg-foreground/5 border border-border hover:bg-accent text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2">
                            <Video className="w-4 h-4" /> Ver Gravação
                        </button>
                        <button className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Gerar Relatório
                        </button>
                    </div>
                </div>
            </div>

            {/* Steps Timeline */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mt-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-6">Passos da Execução</h3>

                <div className="flex flex-col gap-4 relative">
                    <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border"></div>

                    {/* Step 1 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0 border-4 border-card">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 bg-surface-muted border border-border rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-foreground">Acessar tela de Login</h4>
                                <span className="text-xs text-muted-foreground font-medium">1.2s</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Navegação para a rota /login completada com sucesso.</p>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0 border-4 border-card">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 bg-surface-muted border border-border rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-foreground">Preencher credenciais</h4>
                                <span className="text-xs text-muted-foreground font-medium">2.5s</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Email e senha preenchidos conforme dados de teste.</p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex items-start gap-4 relative z-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-4 border-card ${isMockSuccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                            {isMockSuccess ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className={`flex-1 border rounded-xl p-4 ${isMockSuccess ? 'bg-surface-muted border-border' : 'bg-danger/10 border-danger/20'}`}>
                            <div className="flex items-center justify-between">
                                <h4 className={`font-bold ${isMockSuccess ? 'text-foreground' : 'text-danger'}`}>
                                    {isMockSuccess ? 'Clicar em Entrar e Aguardar Dashboard' : 'Falha ao validar Dashboard'}
                                </h4>
                                <span className={`text-xs font-medium ${isMockSuccess ? 'text-muted-foreground' : 'text-danger'}`}>
                                    {isMockSuccess ? '4.1s' : 'Demorou muito (timeout local)'}
                                </span>
                            </div>
                            <p className={`text-sm mt-1 ${isMockSuccess ? 'text-muted-foreground' : 'text-danger'}`}>
                                {isMockSuccess
                                    ? 'Elemento "Bem-vindo" apareceu na tela.'
                                    : 'O elemento "#dashboard-header" não foi encontrado após 10000ms. Verifique a captura de tela.'}
                            </p>
                            {!isMockSuccess && (
                                <button className="mt-3 text-xs font-bold text-danger bg-danger/10 px-3 py-1.5 rounded hover:bg-danger/20 transition-colors">
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
