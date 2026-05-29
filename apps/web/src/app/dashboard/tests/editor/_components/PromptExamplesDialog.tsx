'use client';

import { BookOpen, X, ThumbsUp, ThumbsDown } from 'lucide-react';

export function PromptExamplesDialog({
    onClose,
}: {
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-popover border border-border rounded-2xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-base font-bold text-foreground">Exemplos de Prompt</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-foreground/10 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* Bad example */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                                <ThumbsDown className="w-3 h-3 text-red-400" />
                            </div>
                            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Prompt vago (evite)</span>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <p className="text-sm text-muted-foreground italic leading-relaxed">
                                &quot;Abrir aplicativo da foxbit, realizar login, comprar e vender bitcoin&quot;
                            </p>
                        </div>
                        <p className="text-[11px] text-zinc-500">Muito genérico. A IA não sabe quais campos, botões ou textos esperar na tela.</p>
                    </div>

                    <div className="border-t border-border" />

                    {/* Good example */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                <ThumbsUp className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Prompt preciso (recomendado)</span>
                        </div>
                        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                &quot;Na área de trabalho, clique para abrir o app da Foxbit. Na tela inicial, identifique o botão <span className="text-foreground font-medium">Entrar</span> e clique nele. Quando a tela de login com campos de e-mail e senha for exibida, preencha o e-mail <span className="text-brand font-mono">{'{{EMAIL}}'}</span> e a senha <span className="text-brand font-mono">{'{{SENHA}}'}</span>. Verifique que o botão <span className="text-foreground font-medium">Entrar</span> ficou habilitado e clique nele para realizar login. Após alguns segundos, valide que o login foi bem-sucedido verificando se a tela inicial do app aparece.&quot;
                            </p>
                        </div>
                        <p className="text-[11px] text-zinc-500">Descreve cada tela, elemento e validação esperada. Use <span className="font-mono text-brand">{'{{VARIAVEL}}'}</span> para dados dinâmicos.</p>
                    </div>

                    <div className="border-t border-border" />

                    {/* Tips */}
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Dicas para bons prompts</p>
                        <ul className="space-y-1.5 text-xs text-muted-foreground">
                            <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Descreva o <span className="text-foreground">estado inicial</span> da tela antes de cada ação</li>
                            <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Nomeie os elementos exatamente como aparecem na tela (ex: &quot;botão Entrar&quot;, não &quot;botão de login&quot;)</li>
                            <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Inclua <span className="text-foreground">validações</span> após cada etapa importante</li>
                            <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Use <span className="font-mono text-brand">{'{{VARIAVEL}}'}</span> para dados que mudam entre execuções (credenciais, CPF, etc.)</li>
                            <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Mencione tempos de espera quando o app é lento (ex: &quot;aguarde o carregamento&quot;)</li>
                        </ul>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-foreground hover:border-zinc-500 transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
