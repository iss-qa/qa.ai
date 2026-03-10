'use client';

import { useState } from 'react';
import { useTestEditor } from '@/store/testEditor';
import { fetchApi } from '@/lib/api';
import { Loader2, Sparkles, Smartphone, Globe, Lock } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';

export function PromptInput({ projectId }: { projectId: string }) {
    const [prompt, setPrompt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [platform, setPlatform] = useState<'android' | 'web'>('android');
    const isGenerating = useTestEditor(state => state.isGenerating);
    const setIsGenerating = useTestEditor(state => state.setIsGenerating);
    const isRecording = useTestEditor(state => state.isRecording);
    const setIsRecording = useTestEditor(state => state.setIsRecording);

    const { org } = useOrganization();
    const isPro = org.plan === 'pro';

    // Notice we use the underlying Zustand store directly to add multiple steps
    const testCase = useTestEditor(state => state.testCase);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setError(null);
        try {
            const response = await fetchApi('/tests/parse-prompt', {
                method: 'POST',
                body: JSON.stringify({ prompt, platform, project_id: projectId }),
            });

            if (response && response.steps) {
                // Just demonstrating how we'd append cleanly in real life.
                // For MVP, we'll just push them all into the store
                const currentTestCase = useTestEditor.getState().testCase;
                if (currentTestCase) {
                    useTestEditor.getState().setTestCase({
                        ...currentTestCase,
                        steps: [...currentTestCase.steps, ...response.steps]
                    });
                }
                setPrompt('');
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao processar prompt');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-bgSecondary rounded-xl p-4 border border-white/5 space-y-3">
            <textarea
                className="w-full bg-bgPrimary border border-white/10 rounded-lg p-3 text-textPrimary placeholder:text-textSecondary/50 focus:outline-none focus:ring-1 focus:ring-brand min-h-[80px] resize-y"
                placeholder="Descreva o que o teste deve fazer... (ex: Abrir o app BancoX, fazer login com user@teste.com e validar o saldo)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                    }
                }}
                disabled={isGenerating || isRecording}
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 items-center">
                <div className="relative">
                    <select
                        value={platform}
                        onChange={(e) => {
                            if (e.target.value === 'web' && !isPro) {
                                alert("O teste Automático de Web requires o plano Pro.");
                                return;
                            }
                            setPlatform(e.target.value as any);
                        }}
                        className="bg-bgPrimary border border-white/10 text-white text-sm rounded-lg pl-8 pr-8 py-2 appearance-none focus:outline-none focus:border-brand"
                    >
                        <option value="android">📱 Android</option>
                        <option value="web">🌐 Web {!isPro && '(Pro)'}</option>
                    </select>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isGenerating || isRecording}
                    className="flex-1 max-w-[200px] flex items-center justify-center gap-2 bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 disabled:hover:bg-brand/10 transition-colors py-2 px-4 rounded-lg font-medium text-sm"
                >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isGenerating ? 'Gerando...' : 'Gerar com IA'}
                </button>

                {platform === 'android' && (
                    <button
                        onClick={() => setIsRecording(true)}
                        disabled={isGenerating || isRecording}
                        className="flex-1 max-w-[200px] flex items-center justify-center gap-2 bg-white/5 text-textPrimary hover:bg-white/10 disabled:opacity-50 transition-colors py-2 px-4 rounded-lg font-medium text-sm"
                    >
                        <Smartphone className="w-4 h-4" />
                        Gravar no Celular
                    </button>
                )}
            </div>
        </div>
    );
}
