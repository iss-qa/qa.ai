import Link from 'next/link';
import { Sparkles, Activity, ShieldCheck, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07090E] text-white selection:bg-brand/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand to-blue-400 flex items-center justify-center">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <span className="text-xl font-bold tracking-tight">QAMind</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-brand transition-colors">
              Entrar
            </Link>
            <Link href="/register" className="bg-white text-black px-4 py-2 rounded-full text-sm font-bold hover:bg-brand hover:text-white transition-all transform hover:scale-105">
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-brand mb-8 animate-fade-in">
          <Sparkles className="w-3 h-3" />
          <span>IA Generativa para Automação de QA</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
          Testes de Software <br /> na Velocidade da Luz.
        </h1>

        <p className="max-w-2xl text-lg text-textSecondary mb-10 leading-relaxed">
          Transforme prompts em scripts complexos de Playwright em segundos.
          A primeira plataforma SaaS que une Android, Web e Desktop em um único orquestrador de IA.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link href="/register" className="h-14 px-8 bg-brand text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-[0_0_20px_rgba(74,144,217,0.3)]">
            Criar Conta Admin
            <Zap className="w-4 h-4 fill-current" />
          </Link>
          <Link href="/login" className="h-14 px-8 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center hover:bg-white/10 transition-all">
            Ver Dashboard
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-left hover:border-brand/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Activity className="text-brand w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Execução Real-time</h3>
            <p className="text-sm text-textSecondary leading-relaxed">
              Acompanhe cada clique e validação em tempo real através do nosso Daemon otimizado.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-left hover:border-brand/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <ShieldCheck className="text-blue-400 w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Relatórios com Evidência</h3>
            <p className="text-sm text-textSecondary leading-relaxed">
              Geração automática de PDFs com prints de erros e logs detalhados para o time de dev.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-left hover:border-brand/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Zap className="text-purple-400 w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Engine de IA Saas</h3>
            <p className="text-sm text-textSecondary leading-relaxed">
              Lógica de testes distribuída que escala conforma a sua necessidade de QA.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-12 text-center text-sm text-textSecondary">
        <p>&copy; 2026 QAMind Platform. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
