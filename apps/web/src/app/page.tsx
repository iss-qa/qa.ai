import Link from 'next/link';
import {
    Zap, ArrowRight, CheckCircle2, Smartphone, Bot, Play, BarChart3, Users,
    MessageSquare, Layers, Target, ChevronRight, ScanSearch, Disc,
    GitBranch, Plug, Activity, Bug, FileText, MousePointerClick, Eye, Type,
    Table2, Workflow, Building2,
} from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-brand/30 overflow-x-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-15%] w-[50%] h-[50%] bg-brand/8 rounded-full blur-[150px]" />
                <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-blue-500/6 rounded-full blur-[150px]" />
                <div className="absolute top-[40%] right-[20%] w-[25%] h-[25%] bg-emerald-500/4 rounded-full blur-[100px]" />
            </div>

            {/* Navbar */}
            <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-blue-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand/20">
                            <Zap className="w-5 h-5 text-white fill-current" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">QAMind</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
                        <a href="#pilares" className="hover:text-foreground transition-colors">Plataforma</a>
                        <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
                        <a href="#how-it-works" className="hover:text-foreground transition-colors">Como Funciona</a>
                        <a href="#pricing" className="hover:text-foreground transition-colors">Planos</a>
                        <Link href="/docs" className="hover:text-foreground transition-colors">Documentação</Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                            Entrar
                        </Link>
                        <Link href="/register" className="bg-card text-foreground px-5 py-2 rounded-full text-sm font-bold hover:bg-brand hover:text-white transition-all duration-300 shadow-lg shadow-foreground/10 hover:shadow-brand/20">
                            Começar Grátis
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-24 flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-brand/10 to-emerald-500/10 border border-brand/20 text-xs font-semibold text-brand mb-8 backdrop-blur-sm">
                    <Disc className="w-3.5 h-3.5" />
                    <span>Escaneie. Grave. Reproduza. Sem escrever código.</span>
                    <ChevronRight className="w-3 h-3" />
                </div>

                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[0.95]">
                    <span className="bg-clip-text text-transparent bg-gradient-to-b from-foreground via-foreground to-foreground/40">
                        A plataforma completa
                    </span>
                    <br />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand via-blue-400 to-emerald-400">
                        para a mente do QA.
                    </span>
                </h1>

                <p className="max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed">
                    Escaneie o app e monte testes elemento por elemento, <strong className="text-foreground">grave o teste
                    executando no dispositivo real</strong> e organize tudo em <strong className="text-foreground">jornadas visuais</strong> que
                    o time inteiro entende — integrado a Google Sheets, Jira e em breve Slack.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                    <Link href="/register" className="group h-14 px-8 bg-gradient-to-r from-brand to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(74,144,217,0.4)] transition-all duration-300">
                        Comece Agora — É Grátis
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link href="/docs" className="h-14 px-8 bg-foreground/5 border border-border rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-accent transition-all">
                        <Play className="w-4 h-4 fill-current text-brand" /> Ver Documentação
                    </Link>
                </div>

                <p className="text-xs text-muted-foreground mb-16">Sem cartão de crédito • Setup em 2 minutos • Cancele quando quiser</p>

                {/* Hero Product Mockup — Scanner + Recorder */}
                <div className="w-full max-w-5xl relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-brand/20 via-blue-500/20 to-emerald-500/20 rounded-3xl blur-xl opacity-50" />
                    <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden text-left">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-foreground/[0.02]">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">QAMind — Scanner de Elementos</span>
                            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Gravando
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5">
                            {/* Device preview */}
                            <div className="md:col-span-2 p-6 border-b md:border-b-0 md:border-r border-border flex items-center justify-center bg-foreground/[0.02]">
                                <div className="w-44 rounded-2xl border border-border bg-background p-3 space-y-2 shadow-inner">
                                    <div className="h-2 w-12 mx-auto rounded-full bg-foreground/10" />
                                    <div className="h-7 rounded-lg bg-brand/15 border border-brand/30 flex items-center px-2">
                                        <span className="text-[9px] font-mono text-brand truncate">input_email</span>
                                    </div>
                                    <div className="h-7 rounded-lg bg-foreground/5 border border-border flex items-center px-2">
                                        <span className="text-[9px] font-mono text-muted-foreground truncate">input_password</span>
                                    </div>
                                    <div className="h-8 rounded-lg bg-brand flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-white">Entrar</span>
                                    </div>
                                    <div className="h-16 rounded-lg bg-foreground/5 border border-dashed border-border" />
                                </div>
                            </div>
                            {/* Elements + actions panel */}
                            <div className="md:col-span-3 p-5 sm:p-6 font-mono text-xs space-y-2.5">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans font-bold mb-3">12 elementos mapeados</p>
                                {[
                                    { id: 'input_email', icon: Type, action: 'inputText "isaias@empresa.com"', tone: 'text-brand' },
                                    { id: 'input_password', icon: Type, action: 'inputText "••••••••"', tone: 'text-brand' },
                                    { id: 'btn_entrar', icon: MousePointerClick, action: 'tapOn', tone: 'text-emerald-400' },
                                    { id: 'tela_dashboard', icon: Eye, action: 'assertVisible', tone: 'text-amber-400' },
                                ].map((el) => (
                                    <div key={el.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-foreground/[0.03] border border-border">
                                        <el.icon className={`w-3.5 h-3.5 shrink-0 ${el.tone}`} />
                                        <span className="text-foreground/90 truncate">{el.id}</span>
                                        <span className={`ml-auto shrink-0 ${el.tone}`}>{el.action}</span>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2 pt-2 text-emerald-400">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="font-sans font-bold text-xs">4 passos gravados — pronto para reproduzir</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Social Proof */}
            <section className="relative z-10 border-y border-border py-12 bg-foreground/[0.01]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <p className="text-center text-xs text-muted-foreground uppercase font-bold tracking-widest mb-8">Tecnologias que alimentam o QAMind</p>
                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-muted-foreground opacity-60">
                        <span className="text-lg font-bold tracking-tight">Maestro</span>
                        <span className="text-lg font-bold tracking-tight">ADB</span>
                        <span className="text-lg font-bold tracking-tight">scrcpy</span>
                        <span className="text-lg font-bold tracking-tight">Anthropic Claude</span>
                        <span className="text-lg font-bold tracking-tight">Supabase</span>
                        <span className="text-lg font-bold tracking-tight">Next.js</span>
                    </div>
                </div>
            </section>

            {/* Pilares — feature blocks */}
            <section id="pilares" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-24 space-y-20 sm:space-y-28">
                <div className="text-center">
                    <span className="text-xs font-bold text-brand uppercase tracking-widest">Plataforma</span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mt-4 mb-6">
                        Os 4 pilares do <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">QAMind</span>
                    </h2>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        Do dispositivo físico ao mapa de jornadas: tudo que o QA precisa, em um só lugar.
                    </p>
                </div>

                {/* Pilar 1 — Scanner */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                            <ScanSearch className="w-6 h-6 text-brand" />
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">Scanner de elementos com Maestro</h3>
                        <p className="text-muted-foreground leading-relaxed mb-6">
                            Conecte o dispositivo e escaneie o aplicativo que deseja testar. O QAMind mapeia
                            cada elemento da interface — botões, campos, listas — e você monta o teste
                            escolhendo a ação: tap, visibilidade, digitação, scroll e mais. Sem seletores na mão,
                            sem código.
                        </p>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-brand mt-0.5 shrink-0" /> Hierarquia completa da tela, inclusive dialogs e bottom sheets</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-brand mt-0.5 shrink-0" /> Ações com um clique: tapOn, assertVisible, inputText...</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-brand mt-0.5 shrink-0" /> YAML Maestro gerado e versionado automaticamente</li>
                        </ul>
                    </div>
                    <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-border">
                        <div className="font-mono text-xs space-y-2">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans font-bold mb-3">Elementos da tela — checkout.apk</p>
                            {[
                                { id: 'btn_adicionar_carrinho', type: 'Button' },
                                { id: 'campo_cupom', type: 'EditText' },
                                { id: 'lista_produtos', type: 'RecyclerView' },
                                { id: 'txt_total', type: 'TextView' },
                                { id: 'btn_finalizar_compra', type: 'Button' },
                            ].map((el) => (
                                <div key={el.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border">
                                    <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
                                    <span className="text-foreground/90 truncate">{el.id}</span>
                                    <span className="ml-auto text-muted-foreground shrink-0">{el.type}</span>
                                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Pilar 2 — Record & Replay */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div className="order-1 lg:order-2">
                        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                            <Disc className="w-6 h-6 text-red-400" />
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">Grave o teste. Reproduza quando quiser.</h3>
                        <p className="text-muted-foreground leading-relaxed mb-6">
                            Clique em <strong className="text-foreground">Gravar</strong>, execute o fluxo no dispositivo físico
                            como faria manualmente, e o QAMind captura cada passo. O teste fica salvo e pronto
                            para reproduzir em qualquer execução — regressão sem retrabalho.
                        </p>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> Captura taps, digitação, swipes e esperas no device real</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> Espelhamento da tela ao vivo durante a gravação</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> Edite os passos gravados antes de salvar como teste</li>
                        </ul>
                    </div>
                    <div className="order-2 lg:order-1 p-6 rounded-2xl bg-foreground/[0.02] border border-border">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">REC 00:42</span>
                        </div>
                        <div className="space-y-2 font-mono text-xs">
                            {[
                                { n: 1, step: 'launchApp — com.empresa.app' },
                                { n: 2, step: 'tapOn — "Login"' },
                                { n: 3, step: 'inputText — campo e-mail' },
                                { n: 4, step: 'inputText — campo senha' },
                                { n: 5, step: 'tapOn — "Entrar"' },
                                { n: 6, step: 'assertVisible — "Dashboard"' },
                            ].map((s) => (
                                <div key={s.n} className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border">
                                    <span className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center text-[10px] font-bold shrink-0">{s.n}</span>
                                    <span className="text-foreground/90 truncate">{s.step}</span>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Pilar 3 — Jornadas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
                            <GitBranch className="w-6 h-6 text-emerald-400" />
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">Jornadas: o mapa visual do seu QA</h3>
                        <p className="text-muted-foreground leading-relaxed mb-6">
                            Um mapa estilo Miro onde a organização cadastra suas jornadas de teste.
                            Jornada de Login? Lá dentro: login válido, inválido, conta PJ, conta PF — cada uma
                            com sua árvore de casos, documentos e anexos. Tech Lead, PO, dev e CEO entendem o
                            estado da qualidade num relance, e cada squad inclui seus próprios cenários.
                        </p>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Árvore de jornadas → subfluxos → casos de teste</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Status de automação e última execução por caso</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Documentos, evidências e links anexados aos subfluxos</li>
                        </ul>
                    </div>
                    <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-border">
                        <div className="flex flex-col items-center gap-3 text-xs font-semibold">
                            <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">Jornada: Login</div>
                            <div className="w-px h-4 bg-border" />
                            <div className="grid grid-cols-2 gap-3 w-full">
                                {[
                                    { label: 'Login válido', state: 'ok' },
                                    { label: 'Login inválido', state: 'ok' },
                                    { label: 'Conta PJ', state: 'warn' },
                                    { label: 'Conta PF', state: 'ok' },
                                ].map((c) => (
                                    <div key={c.label} className="px-3 py-2.5 rounded-xl bg-card border border-border flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${c.state === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                        <span className="text-foreground/90 truncate">{c.label}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="w-px h-4 bg-border" />
                            <div className="flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
                                <span className="px-2.5 py-1 rounded-full bg-foreground/5 border border-border">CT-0142 · automatizado</span>
                                <span className="px-2.5 py-1 rounded-full bg-foreground/5 border border-border">CT-0143 · manual</span>
                                <span className="px-2.5 py-1 rounded-full bg-foreground/5 border border-border">+ evidências</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pilar 4 — Integrações */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div className="order-1 lg:order-2">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6">
                            <Plug className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">Integrado às ferramentas do time</h3>
                        <p className="text-muted-foreground leading-relaxed mb-6">
                            As jornadas sincronizam com Google Sheets e Jira — planilhas de casos viram mapa
                            visual, e os cards do Jira aparecem no contexto do subfluxo. Slack chega em breve
                            para notificar execuções e bugs.
                        </p>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" /> Sincronização idempotente de planilhas de casos de teste</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" /> Issues do Jira vinculadas por subfluxo (JQL por organização)</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" /> Credenciais cifradas por organização (AES-256-GCM)</li>
                        </ul>
                    </div>
                    <div className="order-2 lg:order-1 p-6 rounded-2xl bg-foreground/[0.02] border border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs font-bold">
                            <div className="p-5 rounded-xl bg-card border border-border flex flex-col items-center gap-3">
                                <Table2 className="w-7 h-7 text-emerald-400" />
                                <span>Google Sheets</span>
                                <span className="text-[10px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10">Ativo</span>
                            </div>
                            <div className="p-5 rounded-xl bg-card border border-border flex flex-col items-center gap-3">
                                <Workflow className="w-7 h-7 text-blue-400" />
                                <span>Jira</span>
                                <span className="text-[10px] font-semibold text-blue-400 px-2 py-0.5 rounded-full bg-blue-500/10">Ativo</span>
                            </div>
                            <div className="p-5 rounded-xl bg-card border border-border flex flex-col items-center gap-3">
                                <MessageSquare className="w-7 h-7 text-amber-400" />
                                <span>Slack</span>
                                <span className="text-[10px] font-semibold text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10">Em breve</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid (recursos secundários) */}
            <section id="features" className="relative z-10 py-24 border-t border-border bg-foreground/[0.01]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-16">
                        <span className="text-xs font-bold text-brand uppercase tracking-widest">Recursos</span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mt-4 mb-6">
                            E tudo mais que o dia a dia<br className="hidden sm:block" /> do QA exige
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { icon: Bot, title: 'IA em linguagem natural', desc: 'Descreva o teste em português e a IA (powered by Claude) converte em passos estruturados prontos para executar.', tone: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                            { icon: Activity, title: 'Execução real-time', desc: 'Acompanhe cada tap, type e assert ao vivo no preview do dispositivo, com streaming via WebSocket.', tone: 'text-brand', bg: 'bg-brand/10 border-brand/20' },
                            { icon: BarChart3, title: 'Relatórios', desc: 'Taxa de sucesso, duração média, módulos em alerta e evolução histórica — exportáveis em PDF.', tone: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                            { icon: Bug, title: 'Bug Tracker', desc: 'Bugs com severidade, screenshot e evidências, criados manualmente ou direto de uma execução que falhou.', tone: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
                            { icon: FileText, title: 'Documentação e Logs', desc: 'Histórico completo de execuções, logs por passo e documentação viva dos fluxos testados.', tone: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                            { icon: Smartphone, title: 'Dispositivos reais', desc: 'Android via USB ou Wi-Fi com ADB e scrcpy. iOS e Web no roadmap da plataforma.', tone: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                        ].map((feature) => (
                            <div key={feature.title} className="group p-6 rounded-2xl bg-foreground/[0.02] border border-border transition-all duration-300 hover:bg-foreground/[0.04]">
                                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform ${feature.bg}`}>
                                    <feature.icon className={`w-5 h-5 ${feature.tone}`} />
                                </div>
                                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="relative z-10 py-24 border-t border-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-16">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Como Funciona</span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mt-4 mb-6">
                            3 passos simples
                        </h2>
                        <p className="text-muted-foreground max-w-xl mx-auto">Do dispositivo conectado ao mapa de jornadas atualizado.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { num: '01', title: 'Conecte', desc: 'Plugue o dispositivo via USB ou Wi-Fi. O QAMind espelha a tela e reconhece o app sob teste.', icon: Smartphone },
                            { num: '02', title: 'Escaneie ou grave', desc: 'Mapeie os elementos e monte o teste clicando — ou aperte Gravar e execute o fluxo no aparelho.', icon: ScanSearch },
                            { num: '03', title: 'Reproduza e acompanhe', desc: 'Execute quando quiser e acompanhe resultados nas jornadas, relatórios e bug tracker.', icon: Play },
                        ].map((step) => (
                            <div key={step.num} className="relative p-8 rounded-2xl bg-gradient-to-b from-foreground/[0.03] to-transparent border border-border">
                                <span className="text-6xl font-black text-foreground/[0.04] absolute top-4 right-6">{step.num}</span>
                                <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                                    <step.icon className="w-6 h-6 text-brand" />
                                </div>
                                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Personas Section */}
            <section className="relative z-10 py-24 border-t border-border bg-foreground/[0.01]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-16">
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Para Quem</span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mt-4 mb-6">
                            Feito para toda a organização
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Users, role: 'QA Engineers', desc: 'Escaneie, grave e reproduza testes sem depender de desenvolvedores.' },
                            { icon: Target, role: 'Tech Leads & POs', desc: 'Visão clara das jornadas: o que está coberto, automatizado e quebrando.' },
                            { icon: Layers, role: 'Squads', desc: 'Cada time cadastra seus próprios cenários no mapa compartilhado.' },
                            { icon: Building2, role: 'Empresas', desc: 'Organizações multi-time com papéis, integrações e credenciais isoladas.' },
                        ].map((persona) => (
                            <div key={persona.role} className="p-6 rounded-2xl bg-foreground/[0.02] border border-border text-center hover:border-brand/20 transition-colors">
                                <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
                                    <persona.icon className="w-7 h-7 text-brand" />
                                </div>
                                <h3 className="font-bold text-lg mb-2">{persona.role}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{persona.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="relative z-10 py-24 border-t border-border">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-16">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Planos</span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mt-4 mb-6">
                            Simples e transparente
                        </h2>
                        <p className="text-muted-foreground">Comece grátis. Escale quando a organização precisar.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { name: 'Free', price: 'Grátis', features: ['1 projeto', '50 execuções/mês', '1 dispositivo', 'Jornadas básicas'], cta: 'Começar Grátis', highlighted: false },
                            { name: 'Starter', price: 'R$ 49/mês', features: ['3 projetos', '500 execuções/mês', '2 dispositivos', 'Integração Google Sheets'], cta: 'Assinar Starter', highlighted: false },
                            { name: 'Pro', price: 'R$ 97/mês', features: ['Projetos ilimitados', 'Execuções ilimitadas', '5 dispositivos', 'Sheets + Jira', 'Relatórios avançados', 'Escolha do LLM'], cta: 'Assinar Pro', highlighted: true },
                            { name: 'Enterprise', price: 'Sob consulta', features: ['Tudo do Pro', 'Dispositivos ilimitados', 'SSO / SAML', 'SLA 99.9%', 'Onboarding dedicado'], cta: 'Falar com Vendas', highlighted: false },
                        ].map((plan) => (
                            <div key={plan.name} className={`p-8 rounded-2xl border relative ${plan.highlighted ? 'bg-gradient-to-b from-brand/10 to-transparent border-brand/30 shadow-[0_0_40px_rgba(74,144,217,0.1)]' : 'bg-foreground/[0.02] border-border'}`}>
                                {plan.highlighted && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand text-white text-[10px] font-black uppercase rounded-full tracking-wider">Popular</div>
                                )}
                                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                                <p className="text-3xl font-extrabold mb-6">{plan.price}</p>
                                <ul className="space-y-2.5 mb-8">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                            <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href="/register"
                                    className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${plan.highlighted ? 'bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20' : 'bg-foreground/5 border border-border hover:bg-accent'}`}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Final */}
            <section className="relative z-10 py-24 border-t border-border">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
                    <div className="p-10 sm:p-12 md:p-16 rounded-3xl bg-gradient-to-br from-brand/10 via-blue-500/5 to-emerald-500/10 border border-brand/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
                                Entre na mente<br />do QA moderno.
                            </h2>
                            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                                Crie sua organização, conecte um dispositivo e tenha seus primeiros testes
                                gravados e reproduzíveis ainda hoje.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link href="/register" className="group h-14 px-8 bg-card text-foreground rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-brand hover:text-white transition-all duration-300">
                                    Criar Conta Grátis
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                                <Link href="/docs" className="h-14 px-8 border border-border rounded-xl font-bold flex items-center justify-center hover:bg-accent transition-all">
                                    Ler Documentação
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-border py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-blue-400 flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-white fill-current" />
                                </div>
                                <span className="font-bold text-lg">QAMind</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                A mente do QA: scanner de elementos, gravação de testes, jornadas visuais e
                                integrações em uma única plataforma.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm mb-4 text-muted-foreground">Produto</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><a href="#pilares" className="hover:text-foreground transition-colors">Plataforma</a></li>
                                <li><a href="#features" className="hover:text-foreground transition-colors">Recursos</a></li>
                                <li><a href="#pricing" className="hover:text-foreground transition-colors">Planos</a></li>
                                <li><Link href="/docs" className="hover:text-foreground transition-colors">Documentação</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm mb-4 text-muted-foreground">Empresa</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><a href="#" className="hover:text-foreground transition-colors">Sobre</a></li>
                                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                                <li><a href="#" className="hover:text-foreground transition-colors">Contato</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm mb-4 text-muted-foreground">Legal</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li><a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a></li>
                                <li><a href="#" className="hover:text-foreground transition-colors">Privacidade</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
                        <p>&copy; 2026 QAMind Platform. Todos os direitos reservados.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
