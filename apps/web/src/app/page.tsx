import Link from 'next/link';
import { 
  Zap, Activity, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, 
  Smartphone, Globe, Bot, Play, BarChart3, Users, Star,
  MessageSquare, Layers, Target, ChevronRight, Monitor
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07090E] text-white selection:bg-brand/30 overflow-x-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-15%] w-[50%] h-[50%] bg-brand/8 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-blue-500/6 rounded-full blur-[150px]" />
        <div className="absolute top-[40%] right-[20%] w-[25%] h-[25%] bg-emerald-500/4 rounded-full blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#07090E]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-blue-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand/20">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <span className="text-xl font-bold tracking-tight">QAMind</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Recursos</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Como Funciona</a>
            <a href="#pricing" className="hover:text-white transition-colors">Planos</a>
            <Link href="/docs" className="hover:text-white transition-colors">Documentação</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-2">
              Entrar
            </Link>
            <Link href="/register" className="bg-white text-black px-5 py-2 rounded-full text-sm font-bold hover:bg-brand hover:text-white transition-all duration-300 shadow-lg shadow-white/10 hover:shadow-brand/20">
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-brand/10 to-emerald-500/10 border border-brand/20 text-xs font-semibold text-brand mb-8 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>A primeira plataforma de testes em linguagem natural</span>
          <ChevronRight className="w-3 h-3" />
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 leading-[0.9]">
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40">
            Automatize Testes 
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand via-blue-400 to-emerald-400">
             com IA,
          </span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand via-blue-400 to-emerald-400">
           em Linguagem Natural.
          </span>
        </h1>

        <p className="max-w-2xl text-lg md:text-xl text-slate-400 mb-10 leading-relaxed">
          Descreva o que testar em linguagem natural. A IA do QAMind gera, executa e valida 
          testes em <strong className="text-white">Android</strong>, <strong className="text-white">iOS</strong> e <strong className="text-white">Web</strong> — sem escrever uma linha de código.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Link href="/register" className="group h-14 px-8 bg-gradient-to-r from-brand to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(74,144,217,0.4)] transition-all duration-300">
            Comece Agora — É Grátis
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/docs" className="h-14 px-8 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
            <Play className="w-4 h-4 fill-current text-brand" /> Ver Documentação
          </Link>
        </div>

        <p className="text-xs text-slate-500 mb-16">Sem cartão de crédito • Setup em 2 minutos • Cancele quando quiser</p>

        {/* Hero Terminal Mockup */}
        <div className="w-full max-w-4xl relative">
          <div className="absolute inset-0 bg-gradient-to-r from-brand/20 via-blue-500/20 to-emerald-500/20 rounded-3xl blur-xl opacity-50" />
          <div className="relative bg-[#0D1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-slate-500 ml-2 font-mono">QAMind — Test Editor</span>
            </div>
            <div className="p-6 md:p-8 font-mono text-sm space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 shrink-0">{">"}</span>
                <span className="text-slate-300">
                  <span className="text-brand">Prompt:</span> &quot;Abra o app WasteZero, faça login com isaias@gmail.com e senha123, 
                  verifique se aparece a tela de Dashboard&quot;
                </span>
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex items-start gap-3 text-emerald-400">
                <Bot className="w-4 h-4 shrink-0 mt-0.5" />
                <span>IA gerando 8 passos de teste...</span>
              </div>
              <div className="space-y-1.5 pl-7 text-xs">
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 1: OPEN_APP → WasteZero</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 2: WAIT → 2000ms</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 3: TAP → campo de email</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 4: TYPE → isaias@gmail.com</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 5: TAP → campo de senha</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 6: TYPE → senha123</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 7: TAP → Entrar</p>
                <p className="text-slate-400"><span className="text-green-400">✓</span> Step 8: ASSERT_TEXT → Dashboard</p>
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex items-center gap-2 text-brand text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-bold">Teste gerado com sucesso! Pronto para executar.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="relative z-10 border-y border-white/5 py-12 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs text-slate-500 uppercase font-bold tracking-widest mb-8">Tecnologias que alimentam o QAMind</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-slate-500 opacity-60">
            <span className="text-lg font-bold tracking-tight">Anthropic Claude</span>
            <span className="text-lg font-bold tracking-tight">ADB</span>
            <span className="text-lg font-bold tracking-tight">UIAutomator2</span>
            <span className="text-lg font-bold tracking-tight">Selenium</span>
            <span className="text-lg font-bold tracking-tight">Supabase</span>
            <span className="text-lg font-bold tracking-tight">Next.js</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-brand uppercase tracking-widest">Recursos</span>
          <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">
            Tudo que você precisa<br />para <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">automatizar QA</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Do prompt à execução em dispositivos reais. Sem código, sem configuração complexa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: MessageSquare, title: 'Linguagem Natural', desc: 'Descreva seu teste em português. A IA converte em passos estruturados automaticamente.', color: 'brand' },
            { icon: Smartphone, title: 'Android & iOS', desc: 'Conecte dispositivos via USB ou Wi-Fi. Execução real em aparelhos físicos com ADB e UIAutomator2.', color: 'emerald' },
            { icon: Globe, title: 'Testes Web', desc: 'Automação web com Selenium integrado. Teste aplicações em Chrome, Firefox e Edge.', color: 'blue' },
            { icon: Bot, title: 'IA Generativa', desc: 'Powered by Claude. Escolha o modelo LLM ideal para cada cenário de teste.', color: 'amber' },
            { icon: Activity, title: 'Execução Real-time', desc: 'Acompanhe cada tap, type e assert ao vivo no device preview com WebSocket streaming.', color: 'pink' },
            { icon: ShieldCheck, title: 'Auto-correção', desc: 'Quando um passo falha, a IA analisa o erro e sugere correções automaticamente.', color: 'cyan' },
            { icon: Layers, title: 'Projetos & Organização', desc: 'Organize testes por projeto, plataforma e contexto de negócio.', color: 'orange' },
            { icon: BarChart3, title: 'Relatórios Detalhados', desc: 'Screenshots de erro, logs de estratégias e métricas de execução em cada run.', color: 'indigo' },
            { icon: Target, title: 'Multi-estratégia', desc: 'resource-id, text, content-desc, xpath — multiple fallbacks para encontrar cada elemento.', color: 'rose' },
          ].map((feature, i) => (
            <div key={i} className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all duration-300 hover:bg-white/[0.04]">
              <div className={`w-11 h-11 rounded-xl bg-${feature.color}-500/10 border border-${feature.color}-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-5 h-5 text-${feature.color}-400`} />
              </div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Como Funciona</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">
              3 passos simples
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">De zero a testes automatizados executando em dispositivos reais.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'Descreva', desc: 'Escreva em português o que quer testar. "Abra o app, faça login, vá até o carrinho e finalize a compra."', icon: MessageSquare },
              { num: '02', title: 'Gere com IA', desc: 'O QAMind usa IA generativa para converter seu prompt em passos de teste estruturados com estratégias de localização.', icon: Bot },
              { num: '03', title: 'Execute & Valide', desc: 'Conecte um device real ou navegador. Execute, veja em tempo real e receba relatórios com evidências.', icon: Play },
            ].map((step, i) => (
              <div key={i} className="relative p-8 rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5">
                <span className="text-6xl font-black text-white/[0.04] absolute top-4 right-6">{step.num}</span>
                <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                  <step.icon className="w-6 h-6 text-brand" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison / Differentiator */}
      <section className="relative z-10 py-24 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-xs font-bold text-brand uppercase tracking-widest">Por que QAMind?</span>
          <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-12">
            O diferencial que<br /><span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">nenhuma ferramenta tem</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/10">
              <h3 className="text-lg font-bold text-red-400 mb-4">❌ Ferramentas Tradicionais</h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">×</span> Exigem código (Selenium, Appium, Cypress)</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">×</span> Setup complexo para cada plataforma</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">×</span> Manutenção constante dos seletores</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">×</span> Curva de aprendizado alta para QAs não-dev</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">×</span> Sem inteligência para auto-correção</li>
              </ul>
            </div>
            <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
              <h3 className="text-lg font-bold text-emerald-400 mb-4">✅ QAMind</h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Testes em linguagem natural — zero código</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Android, iOS e Web em uma única plataforma</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> Multi-estratégia de localização com fallbacks</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> QAs, POs e líderes técnicos criam testes</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> IA sugere correções quando passos falham</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Personas Section */}
      <section className="relative z-10 py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Para Quem</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">
              Feito para todo o time
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: Users, role: 'QA Engineers', desc: 'Automatize mais testes em menos tempo, sem depender de desenvolvedores.' },
              { icon: Target, role: 'Product Owners', desc: 'Crie cenários de teste para validar suas user stories diretamente.' },
              { icon: Monitor, role: 'Tech Leads', desc: 'Garanta qualidade com relatórios detalhados e execução contínua.' },
              { icon: Layers, role: 'Empresas', desc: 'Reduza custos de QA e acelere ciclos de release com IA.' },
            ].map((persona, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center hover:border-brand/20 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
                  <persona.icon className="w-7 h-7 text-brand" />
                </div>
                <h3 className="font-bold text-lg mb-2">{persona.role}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{persona.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-24 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Planos</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">
              Simples e transparente
            </h2>
            <p className="text-slate-400">Comece grátis. Escale quando precisar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Starter', price: 'Grátis', features: ['3 projetos', '50 execuções/mês', '1 dispositivo', 'Suporte comunidade'], cta: 'Começar Grátis', highlighted: false },
              { name: 'Pro', price: 'R$ 97/mês', features: ['Projetos ilimitados', 'Execuções ilimitadas', '5 dispositivos', 'Suporte prioritário', 'Relatórios avançados', 'Escolha do LLM'], cta: 'Assinar Pro', highlighted: true },
              { name: 'Enterprise', price: 'Sob consulta', features: ['Tudo do Pro', 'Dispositivos ilimitados', 'API dedicada', 'SSO / SAML', 'SLA 99.9%', 'Onboarding dedicado'], cta: 'Falar com Vendas', highlighted: false },
            ].map((plan, i) => (
              <div key={i} className={`p-8 rounded-2xl border relative ${plan.highlighted ? 'bg-gradient-to-b from-brand/10 to-transparent border-brand/30 shadow-[0_0_40px_rgba(74,144,217,0.1)]' : 'bg-white/[0.02] border-white/5'}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand text-black text-[10px] font-black uppercase rounded-full tracking-wider">Popular</div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-3xl font-extrabold mb-6">{plan.price}</p>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${plan.highlighted ? 'bg-brand text-black hover:bg-brand/90 shadow-lg shadow-brand/20' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="p-12 md:p-16 rounded-3xl bg-gradient-to-br from-brand/10 via-blue-500/5 to-emerald-500/10 border border-brand/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9zdmc+')] opacity-50" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
                Pronto para revolucionar<br />seu QA?
              </h2>
              <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto">
                Junte-se a times que estão automatizando testes em linguagem natural
                com a plataforma mais inteligente do mercado.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/register" className="group h-14 px-8 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-brand hover:text-white transition-all duration-300">
                  Criar Conta Grátis
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/docs" className="h-14 px-8 border border-white/20 rounded-xl font-bold flex items-center justify-center hover:bg-white/5 transition-all">
                  Ler Documentação
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-blue-400 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-black fill-current" />
                </div>
                <span className="font-bold text-lg">QAMind</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                A primeira plataforma de automação de testes em linguagem natural para Web e Mobile.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm mb-4 text-slate-300">Produto</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#features" className="hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Planos</a></li>
                <li><Link href="/docs" className="hover:text-white transition-colors">Documentação</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm mb-4 text-slate-300">Empresa</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-white transition-colors">Sobre</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm mb-4 text-slate-300">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-white transition-colors">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacidade</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 text-center text-sm text-slate-500">
            <p>&copy; 2026 QAMind Platform. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
