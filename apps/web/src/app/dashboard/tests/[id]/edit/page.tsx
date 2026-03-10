'use client';

import { useEffect } from 'react';
import { PromptInput } from '@/components/editor/PromptInput';
import { StepList } from '@/components/editor/StepList';
import { StepForm } from '@/components/editor/StepForm';
import { useTestEditor } from '@/store/testEditor';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Play, Save, Clock, HelpCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function TestEditorPage({ params }: { params: { id: string } }) {
    const testId = params.id;
    useAutoSave(testId);

    const testCase = useTestEditor(state => state.testCase);
    const setTestCase = useTestEditor(state => state.setTestCase);
    const isSaving = useTestEditor(state => state.isSaving);
    const lastSavedAt = useTestEditor(state => state.lastSavedAt);
    const isDirty = useTestEditor(state => state.isDirty);

    // Initial Mock Load
    useEffect(() => {
        // In a real app, we'd fetch the test case from the DB here using testId
        setTestCase({
            id: testId,
            name: 'Login BancoX',
            description: 'Testa o fluxo de login com sucesso',
            project_id: 'default_project',
            tags: [],
            is_active: true,
            version: 1,
            steps: []
        });
    }, [testId, setTestCase]);

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

            {/* Editor Header */}
            <div className="flex-none bg-bgSecondary border-b border-white/5 p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                    <Link href="/tests" className="p-2 -ml-2 text-textSecondary hover:text-white rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-white">{testCase?.name || 'Carregando...'}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-textSecondary flex items-center gap-1">
                                {isSaving ? (
                                    <><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Salvando...</>
                                ) : isDirty ? (
                                    <><span className="w-2 h-2 rounded-full bg-yellow-400" /> Alterações não salvas</>
                                ) : (
                                    <><span className="w-2 h-2 rounded-full bg-green-400" />
                                        Salvo {lastSavedAt ? `às ${lastSavedAt.toLocaleTimeString()}` : 'agora'}
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 text-textSecondary hover:text-white font-medium text-sm px-4 py-2 rounded-lg transition-colors border border-white/10 hover:bg-white/5">
                        <Clock className="w-4 h-4" />
                        Histórico
                    </button>
                    <Link
                        href={`/tests/${testId}/run`}
                        className="flex items-center gap-2 bg-brand text-white font-medium text-sm px-5 py-2 rounded-lg hover:bg-brandDark transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Executar Teste
                    </Link>
                </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Panel: Step List */}
                <div className="w-[420px] flex-none border-r border-white/5 flex flex-col bg-bgPrimary p-4">
                    {(!testCase?.steps || testCase.steps.length === 0) ? (
                        <div className="flex-1 flex flex-col">
                            <div className="mb-6">
                                <h2 className="text-sm font-medium text-white mb-1">Como você quer começar?</h2>
                                <p className="text-xs text-textSecondary mb-4">
                                    Descreva o que o teste deve fazer ou grave os passos diretamente no dispositivo.
                                </p>
                                <PromptInput projectId={testCase?.project_id || 'default'} />
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-medium text-textSecondary">
                                    {testCase.steps.length} Steps
                                </h2>
                                <button className="text-xs text-brand hover:underline">
                                    + Gerar com IA
                                </button>
                            </div>
                            <StepList />
                        </div>
                    )}
                </div>

                {/* Right Panel: Step Configuration */}
                <div className="flex-1 bg-bgPrimary flex flex-col">
                    <StepForm />
                </div>

            </div>
        </div>
    );
}
