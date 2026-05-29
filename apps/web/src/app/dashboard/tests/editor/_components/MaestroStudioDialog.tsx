'use client';

import { Clapperboard, Loader2 } from 'lucide-react';

export function MaestroStudioDialog({
    maestroStudioLaunching,
    onCancel,
    onOpen,
}: {
    maestroStudioLaunching: boolean;
    onCancel: () => void;
    onOpen: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-popover border border-orange-500/20 rounded-2xl p-6 w-[440px] shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <Clapperboard className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-foreground">Maestro Studio</h3>
                        <p className="text-xs text-zinc-500">Ferramenta visual de mapeamento de elementos</p>
                    </div>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-4 space-y-1.5">
                    <p className="text-xs font-semibold text-orange-300">Atenção — conflito de instância ADB</p>
                    <p className="text-xs text-muted-foreground">
                        O Maestro Studio usa a mesma conexão ADB do editor. Ao iniciar, o servidor ADB será reiniciado automaticamente, encerrando o espelhamento de tela.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Após fechar o Maestro Studio, reconecte o dispositivo pelo botão <span className="text-foreground font-medium">Conectar</span> para retomar o espelhamento.
                    </p>
                </div>

                <p className="text-xs text-zinc-500 mb-5">
                    Use o Maestro Studio para inspecionar elementos da interface e copiar seletores para usar nos seus prompts.
                </p>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-foreground hover:border-zinc-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        disabled={maestroStudioLaunching}
                        onClick={onOpen}
                        className="flex-1 px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {maestroStudioLaunching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                        {maestroStudioLaunching ? 'Iniciando...' : 'Abrir Maestro Studio'}
                    </button>
                </div>
            </div>
        </div>
    );
}
