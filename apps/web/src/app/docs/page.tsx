'use client';

import Link from 'next/link';
import { useState } from 'react';
import { 
  Zap, ArrowLeft, BookOpen, Smartphone, Globe, Bot, Play, 
  Terminal, Settings, Folder, FlaskConical, BarChart3, ChevronDown, ChevronRight,
  Monitor, Wifi, CheckCircle2, ArrowRight
} from 'lucide-react';

const sections = [
  { id: 'getting-started', label: 'Início Rápido', icon: Zap },
  { id: 'projects', label: 'Projetos', icon: Folder },
  { id: 'tests', label: 'Criar Testes com IA', icon: Bot },
  { id: 'devices', label: 'Dispositivos', icon: Smartphone },
  { id: 'execution', label: 'Execução', icon: Play },
  { id: 'llm', label: 'Modelos de IA', icon: Settings },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'api', label: 'API Reference', icon: Terminal },
];

function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      <h2 className="text-2xl font-extrabold text-white mb-6 flex items-center gap-3">
        <div className="w-1 h-6 bg-brand rounded-full" />
        {title}
      </h2>
      <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  );
}

function CodeBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="bg-[#0D1117] border border-white/10 rounded-lg overflow-hidden my-4">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        <span className="text-[10px] text-slate-500 ml-2 font-mono">{lang}</span>
      </div>
      <pre className="p-4 text-sm font-mono text-slate-300 overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function StepItem({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/30 flex items-center justify-center shrink-0 text-brand font-bold text-sm">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-white mb-1">{title}</h4>
        <div className="text-sm text-slate-400 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started');

  return (
    <div className="min-h-screen bg-[#07090E] text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#07090E]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-blue-400 flex items-center justify-center">
                <Zap className="w-4 h-4 text-black fill-current" />
              </div>
              <span className="font-bold">QAMind</span>
            </Link>
            <span className="text-slate-500">/</span>
            <span className="text-sm text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Documentação
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/register" className="bg-brand text-black px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-brand/90 transition-colors">
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden lg:block sticky top-24 self-start">
          <nav className="flex flex-col gap-0.5">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === s.id
                      ? 'bg-brand/10 text-brand font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {s.label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-extrabold mb-4">
              Documentação do <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">QAMind</span>
            </h1>
            <p className="text-lg text-slate-400">
              Guia completo para automatizar seus testes com linguagem natural.
            </p>
          </div>

          <DocSection id="getting-started" title="Início Rápido">
            <p>Configure o QAMind em poucos minutos e comece a criar testes automatizados.</p>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Pré-requisitos</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong className="text-white">Node.js 18+</strong> e <strong className="text-white">pnpm</strong> instalados</li>
              <li><strong className="text-white">Python 3.10+</strong> para o daemon de execução</li>
              <li><strong className="text-white">ADB</strong> (Android Debug Bridge) para testes mobile</li>
              <li>Conta no <strong className="text-white">Supabase</strong> para persistência de dados</li>
              <li>API Key da <strong className="text-white">Anthropic</strong> para a IA generativa</li>
            </ul>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Instalação</h3>
            <StepItem num={1} title="Clone o repositório">
              <CodeBlock>{'git clone https://github.com/qamind/qamind.git\ncd qamind'}</CodeBlock>
            </StepItem>
            <StepItem num={2} title="Configure as variáveis de ambiente">
              <p>Copie os arquivos <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs">.env.example</code> e preencha suas credenciais:</p>
              <CodeBlock>{`# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
NEXT_PUBLIC_DAEMON_URL=http://localhost:8001
ANTHROPIC_API_KEY=sua_api_key

# apps/daemon/.env
SUPABASE_URL=sua_url
SUPABASE_KEY=sua_key
DAEMON_PORT=8001
ANTHROPIC_API_KEY=sua_api_key`}</CodeBlock>
            </StepItem>
            <StepItem num={3} title="Execute o startup">
              <p>O script <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs">start.sh</code> cuida de tudo: cria o venv Python, instala dependências e inicia todos os serviços.</p>
              <CodeBlock>{'chmod +x start.sh\n./start.sh'}</CodeBlock>
              <p className="mt-2">Serviços iniciados:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 mt-1">
                <li><strong className="text-white">Web Dashboard:</strong> http://localhost:3000</li>
                <li><strong className="text-white">API (Fastify):</strong> http://localhost:8000</li>
                <li><strong className="text-white">Daemon (Python):</strong> http://localhost:8001</li>
              </ul>
            </StepItem>
          </DocSection>

          <DocSection id="projects" title="Projetos">
            <p>Projetos são a forma de organizar seus testes por contexto de negócio, aplicação ou equipe.</p>
            
            <h3 className="text-lg font-bold text-white mt-8 mb-4">Criar um Projeto</h3>
            <StepItem num={1} title="Acesse a página de Projetos">
              <p>No menu lateral, clique em <strong className="text-white">Projetos</strong>.</p>
            </StepItem>
            <StepItem num={2} title="Clique em Novo Projeto">
              <p>Preencha o nome, descrição, plataforma (Android, iOS, Web ou Multi) e status.</p>
            </StepItem>
            <StepItem num={3} title="Gerencie seus projetos">
              <p>Use os botões de <strong className="text-white">Editar</strong> e <strong className="text-white">Excluir</strong> que aparecem ao passar o mouse sobre o card. Clique em <strong className="text-white">Gerenciar →</strong> para ver os testes vinculados.</p>
            </StepItem>
          </DocSection>

          <DocSection id="tests" title="Criar Testes com IA">
            <p>O diferencial do QAMind é a criação de testes em linguagem natural. Descreva o que quer testar e a IA gera os passos automaticamente.</p>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Passo a Passo</h3>
            <StepItem num={1} title="Abra o Editor de Testes">
              <p>Clique em <strong className="text-white">Testes → Novo Teste</strong> no dashboard.</p>
            </StepItem>
            <StepItem num={2} title="Conecte um dispositivo">
              <p>Clique no indicador de dispositivo na parte inferior para conectar via ADB.</p>
            </StepItem>
            <StepItem num={3} title="Escolha o modelo de IA">
              <p>No combobox ao lado do botão de geração, selecione o modelo LLM desejado:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 mt-2">
                <li><strong className="text-white">Sonnet 4.6</strong> — Recomendado. Melhor equilíbrio entre qualidade e velocidade</li>
                <li><strong className="text-white">Sonnet 4</strong> — Alta capacidade de raciocínio</li>
                <li><strong className="text-white">Sonnet 3.5</strong> — Rápido e eficiente para testes simples</li>
                <li><strong className="text-white">Haiku 3</strong> — Ultra-rápido para prompts curtos</li>
              </ul>
            </StepItem>
            <StepItem num={4} title="Escreva seu prompt">
              <p>Descreva em português o cenário de teste. Seja específico:</p>
              <CodeBlock lang="text">{`"Abra o app WasteZero, na tela de login informe
isaias@gmail.com no campo de email e senha123 no
campo de senha, clique em Entrar e verifique se
aparece a tela de Dashboard com o texto Portfólio"`}</CodeBlock>
            </StepItem>
            <StepItem num={5} title="Clique em Gerar Tests">
              <p>A IA processará o prompt e gerará passos estruturados com ações (TAP, TYPE, ASSERT, etc.) e estratégias de localização (resource-id, text, xpath).</p>
            </StepItem>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Dicas de Prompt</h3>
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 space-y-2">
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> <span>Mencione o <strong className="text-white">nome exato</strong> de botões e campos</span></p>
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> <span>Inclua <strong className="text-white">valores específicos</strong> para dados de entrada</span></p>
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> <span>Descreva a <strong className="text-white">validação esperada</strong> (texto que deve aparecer)</span></p>
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> <span>Use <strong className="text-white">um fluxo por prompt</strong> (login, checkout, cadastro)</span></p>
            </div>
          </DocSection>

          <DocSection id="devices" title="Dispositivos">
            <p>O QAMind conecta a dispositivos Android reais via ADB para execução de testes mobile.</p>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Configuração Android</h3>
            <StepItem num={1} title="Ative o Modo Desenvolvedor">
              <p>No aparelho Android, vá em <strong className="text-white">Configurações → Sobre o telefone</strong> e toque 7 vezes em &quot;Número da versão&quot;.</p>
            </StepItem>
            <StepItem num={2} title="Ative a Depuração USB">
              <p>Em <strong className="text-white">Configurações → Opções do desenvolvedor</strong>, ative &quot;Depuração USB&quot;.</p>
            </StepItem>
            <StepItem num={3} title="Conecte via cabo USB">
              <p>Conecte o dispositivo ao computador e autorize a conexão RSA na tela do celular.</p>
            </StepItem>
            <StepItem num={4} title="Verifique a conexão">
              <CodeBlock>{'adb devices\n# Deve mostrar algo como:\n# dcc71c7d    device'}</CodeBlock>
            </StepItem>
            <StepItem num={5} title="Escaneie no QAMind">
              <p>Na página <strong className="text-white">Dispositivos</strong>, clique em &quot;Conectar Dispositivo&quot; → &quot;Escanear Novamente&quot;.</p>
            </StepItem>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Conexão Wi-Fi (opcional)</h3>
            <CodeBlock>{`# Conecte via USB primeiro, depois:
adb tcpip 5555
adb connect <IP_DO_DISPOSITIVO>:5555
# Agora pode desconectar o cabo USB`}</CodeBlock>
          </DocSection>

          <DocSection id="execution" title="Execução de Testes">
            <p>Após gerar os passos com IA, execute o teste no dispositivo conectado.</p>

            <StepItem num={1} title="Revise os passos gerados">
              <p>Edite, reordene (drag & drop), duplique ou remova passos conforme necessário.</p>
            </StepItem>
            <StepItem num={2} title="Clique em Executar Teste">
              <p>O daemon enviará cada ação ao dispositivo via UIAutomator2 em tempo real.</p>
            </StepItem>
            <StepItem num={3} title="Acompanhe em real-time">
              <p>O device preview mostra a tela do aparelho via WebSocket streaming. Cada passo fica verde (sucesso) ou vermelho (erro).</p>
            </StepItem>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Quando um passo falha</h3>
            <div className="bg-brand/5 border border-brand/10 rounded-xl p-4">
              <p className="text-sm text-slate-300">A IA analisa o erro e mostra:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 mt-2">
                <li><strong className="text-white">Mensagem de erro</strong> detalhada</li>
                <li><strong className="text-white">Estratégias tentadas</strong> (resource-id, text, xpath...)</li>
                <li><strong className="text-white">Sugestão de correção</strong> gerada pela IA</li>
              </ul>
            </div>
          </DocSection>

          <DocSection id="llm" title="Modelos de IA">
            <p>O QAMind usa a API da Anthropic para gerar testes. Você pode escolher o modelo conforme sua necessidade:</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {[
                { name: 'Sonnet 4.6', desc: 'Modelo padrão. Melhor equilíbrio entre qualidade, velocidade e custo.', badge: 'Recomendado' },
                { name: 'Sonnet 4', desc: 'Alta capacidade de raciocínio para testes complexos com muitas validações.', badge: 'Premium' },
                { name: 'Sonnet 3.5', desc: 'Rápido e eficiente. Ideal para fluxos simples como login e cadastro.', badge: 'Rápido' },
                { name: 'Haiku 3', desc: 'Ultra-rápido e barato. Bom para prompts curtos e testes triviais.', badge: 'Econômico' },
              ].map((m, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-white">{m.name}</h4>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand/10 text-brand">{m.badge}</span>
                  </div>
                  <p className="text-sm text-slate-400">{m.desc}</p>
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="reports" title="Relatórios">
            <p>Cada execução de teste gera um relatório completo acessível via dashboard.</p>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">O que está incluído</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong className="text-white">Status de cada passo</strong> — sucesso, falha ou ignorado</li>
              <li><strong className="text-white">Screenshots de erro</strong> — capturados automaticamente no momento da falha</li>
              <li><strong className="text-white">Estratégias de localização</strong> — quais seletores foram tentados e seu resultado</li>
              <li><strong className="text-white">Sugestões de IA</strong> — correções automáticas propostas pela IA</li>
              <li><strong className="text-white">Duração</strong> — tempo total de execução e por passo</li>
            </ul>
          </DocSection>

          <DocSection id="api" title="API Reference">
            <p>O daemon expõe endpoints REST para integração com CI/CD e ferramentas externas.</p>

            <h3 className="text-lg font-bold text-white mt-8 mb-4">Endpoints Principais</h3>
            
            <div className="space-y-4">
              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded">GET</span>
                  <code className="text-sm text-white font-mono">/health</code>
                </div>
                <p className="text-xs text-slate-400">Verifica se o daemon está ativo e quantos dispositivos estão conectados.</p>
              </div>
              
              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded">GET</span>
                  <code className="text-sm text-white font-mono">/devices</code>
                </div>
                <p className="text-xs text-slate-400">Lista todos os dispositivos online detectados via ADB.</p>
              </div>

              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded">GET</span>
                  <code className="text-sm text-white font-mono">/devices/scan</code>
                </div>
                <p className="text-xs text-slate-400">Força um scan imediato de dispositivos ADB.</p>
              </div>

              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded">POST</span>
                  <code className="text-sm text-white font-mono">/api/tests/parse-prompt-stream</code>
                </div>
                <p className="text-xs text-slate-400 mb-2">Gera passos de teste a partir de prompt em linguagem natural (SSE stream).</p>
                <CodeBlock lang="json">{`{
  "prompt": "Abra o app e faça login",
  "platform": "android",
  "model": "claude-sonnet-4-6"
}`}</CodeBlock>
              </div>

              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded">POST</span>
                  <code className="text-sm text-white font-mono">/api/runs</code>
                </div>
                <p className="text-xs text-slate-400">Inicia a execução de um teste no dispositivo conectado.</p>
              </div>

              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded">WS</span>
                  <code className="text-sm text-white font-mono">/ws/{'{client_id}'}</code>
                </div>
                <p className="text-xs text-slate-400">WebSocket para receber eventos de execução em tempo real (step_started, step_completed, step_failed, etc).</p>
              </div>

              <div className="bg-[#0D1117] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded">WS</span>
                  <code className="text-sm text-white font-mono">/stream/{'{udid}'}</code>
                </div>
                <p className="text-xs text-slate-400">WebSocket de streaming de tela do dispositivo (JPEG frames via arraybuffer).</p>
              </div>
            </div>
          </DocSection>

          {/* Next Steps CTA */}
          <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-brand/10 to-emerald-500/5 border border-brand/20 text-center">
            <h3 className="text-xl font-bold mb-3">Pronto para começar?</h3>
            <p className="text-sm text-slate-400 mb-6">Crie sua conta e automatize seus testes em minutos.</p>
            <div className="flex gap-4 justify-center">
              <Link href="/register" className="bg-brand text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-brand/90 transition-colors flex items-center gap-2">
                Criar Conta Grátis <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/dashboard" className="px-6 py-2.5 border border-white/10 rounded-lg font-bold text-sm hover:bg-white/5 transition-colors">
                Ir ao Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
