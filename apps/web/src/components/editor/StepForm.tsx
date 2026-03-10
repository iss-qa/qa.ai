'use client';

import { useTestEditor } from '@/store/testEditor';
import { TestStep, StepAction } from '@qamind/shared';
import { Settings, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';

// Maps action to fields it requires
const FIELDS_BY_ACTION: Record<string, string[]> = {
    tap: ['target'],
    type_text: ['target', 'value'],
    swipe: ['value'],
    scroll: ['target', 'value'],
    longpress: ['target', 'value'],
    wait: ['value'],
    assert_text: ['value', 'target'],
    assert_element: ['target', 'value'],
    open_app: ['value'],
    press_back: [],
    press_home: [],
    screenshot: []
};

export function StepForm() {
    const selectedStepId = useTestEditor(state => state.selectedStepId);
    const testCase = useTestEditor(state => state.testCase);
    const updateStep = useTestEditor(state => state.updateStep);
    const setSelectedStepId = useTestEditor(state => state.setSelectedStepId);

    const step = testCase?.steps.find((s: TestStep) => s.id === selectedStepId);

    // Local state for fast typing, synced to global store
    const [localStep, setLocalStep] = useState<Partial<TestStep> | null>(null);

    useEffect(() => {
        if (step) setLocalStep(step);
        else setLocalStep(null);
    }, [step]);

    const handleChange = (field: keyof TestStep, val: any) => {
        if (!localStep) return;
        setLocalStep({ ...localStep, [field]: val });
        updateStep(localStep.id!, { [field]: val }); // sync up
    };

    if (!localStep) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-textSecondary p-8 h-full">
                <Settings className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-white mb-2">Editor de Step</h3>
                <p className="text-sm text-center max-w-sm">
                    Selecione um step na lista à esquerda para ajustar seus seletores, valores ou configurar asserções.
                </p>
            </div>
        );
    }

    const activeFields = FIELDS_BY_ACTION[localStep.action as string] || [];

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
                <div>
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                        Detalhes do Step
                    </h3>
                    <p className="text-xs text-textSecondary font-mono mt-1">ID: {localStep.id}</p>
                </div>
                <button
                    onClick={() => setSelectedStepId(null)}
                    className="p-2 text-textSecondary hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Form Body */}
            <div className="p-6 space-y-6">

                {/* Action Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-textSecondary">Ação</label>
                    <select
                        value={localStep.action}
                        onChange={(e) => handleChange('action', e.target.value as StepAction)}
                        className="w-full bg-bgSecondary border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                        {Object.keys(FIELDS_BY_ACTION).map(action => (
                            <option key={action} value={action}>{action}</option>
                        ))}
                    </select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-textSecondary">Descrição (Linguagem Natural)</label>
                    <input
                        type="text"
                        value={localStep.description || ''}
                        onChange={(e) => handleChange('description', e.target.value)}
                        className="w-full bg-bgSecondary border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-brand"
                        placeholder="O que esta ação faz visualmente?"
                    />
                </div>

                {/* Dynamic Fields */}
                <div className="grid grid-cols-1 gap-6 pt-4 border-t border-white/5">
                    {activeFields.includes('target') && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-brand">Element Target (Locator)</label>
                                <button className="text-xs text-brand/70 hover:text-brand bg-brand/10 hover:bg-brand/20 px-2 py-1 rounded">
                                    Inspecionar tela
                                </button>
                            </div>
                            <input
                                type="text"
                                value={localStep.target || ''}
                                onChange={(e) => handleChange('target', e.target.value)}
                                className="w-full bg-bgSecondary border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-brand font-mono text-sm"
                                placeholder="Ex: com.app:id/btn_login, texto 'Entrar', 540,1200"
                            />
                        </div>
                    )}

                    {activeFields.includes('value') && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-brand">Action Value</label>
                            <input
                                type="text"
                                value={localStep.value || ''}
                                onChange={(e) => handleChange('value', e.target.value)}
                                className="w-full bg-bgSecondary border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-brand font-mono text-sm"
                                placeholder={localStep.action === 'wait' ? 'Ex: 2000 (ms)' : 'Ex: texto para digitar, url, up/down'}
                            />
                        </div>
                    )}
                </div>

                {/* Advanced Settings */}
                <div className="space-y-4 pt-6 border-t border-white/5">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Settings className="w-4 h-4 text-textSecondary" />
                        Configurações Avançadas
                    </h4>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-textSecondary">Timeout (ms)</label>
                        <input
                            type="number"
                            value={localStep.timeout_ms || 10000}
                            onChange={(e) => handleChange('timeout_ms', parseInt(e.target.value))}
                            className="w-full bg-bgSecondary border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:ring-1 focus:ring-brand font-mono text-sm"
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
