import { create } from 'zustand';
import { temporal } from 'zundo';
import { TestStep, TestCase } from '@qamind/shared';
import { v4 as uuidv4 } from 'uuid';

export interface TestEditorState {
    // Test State
    testCase: TestCase | null;
    isDirty: boolean;
    isSaving: boolean;
    lastSavedAt: Date | null;

    // Selection & UI
    selectedStepId: string | null;
    isGenerating: boolean;
    isRecording: boolean;

    // Actions
    setTestCase: (tc: TestCase) => void;
    addStep: (step: Partial<TestStep>, afterId?: string) => void;
    updateStep: (stepId: string, updates: Partial<TestStep>) => void;
    deleteStep: (stepId: string) => void;
    reorderSteps: (oldIndex: number, newIndex: number) => void;
    duplicateStep: (stepId: string) => void;

    // UI Actions
    setSelectedStepId: (id: string | null) => void;
    setIsGenerating: (isGenerating: boolean) => void;
    setIsRecording: (isRecording: boolean) => void;

    // Persistence
    setSaving: (saving: boolean) => void;
    markSaved: () => void;
}

export const useTestEditor = create<TestEditorState>()(
    temporal(
        (set, get) => ({
            testCase: null,
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,

            selectedStepId: null,
            isGenerating: false,
            isRecording: false,

            setTestCase: (tc) => set({ testCase: tc, isDirty: false }),

            addStep: (stepParams, afterId) => set((state) => {
                if (!state.testCase) return state;

                const newStep: TestStep = {
                    id: uuidv4(),
                    num: state.testCase.steps.length + 1,
                    action: stepParams.action || 'tap',
                    target: stepParams.target || '',
                    value: stepParams.value || '',
                    description: stepParams.description || 'Novo step',
                    timeout_ms: stepParams.timeout_ms || 10000,
                    ...stepParams
                };

                const currentSteps = [...state.testCase.steps];
                if (afterId) {
                    const index = currentSteps.findIndex((s: TestStep) => s.id === afterId);
                    if (index !== -1) {
                        currentSteps.splice(index + 1, 0, newStep);
                    } else {
                        currentSteps.push(newStep);
                    }
                } else {
                    currentSteps.push(newStep);
                }

                return {
                    testCase: { ...state.testCase, steps: currentSteps },
                    isDirty: true
                };
            }),

            updateStep: (stepId, updates) => set((state) => {
                if (!state.testCase) return state;

                const currentSteps = state.testCase.steps.map((step: TestStep) =>
                    step.id === stepId ? { ...step, ...updates } : step
                );

                return {
                    testCase: { ...state.testCase, steps: currentSteps },
                    isDirty: true
                };
            }),

            deleteStep: (stepId) => set((state) => {
                if (!state.testCase) return state;

                const currentSteps = state.testCase.steps.filter((s: TestStep) => s.id !== stepId);

                return {
                    testCase: { ...state.testCase, steps: currentSteps },
                    selectedStepId: state.selectedStepId === stepId ? null : state.selectedStepId,
                    isDirty: true
                };
            }),

            reorderSteps: (oldIndex, newIndex) => set((state) => {
                if (!state.testCase) return state;

                const newSteps = Array.from(state.testCase.steps);
                const [movedStep] = newSteps.splice(oldIndex, 1);
                newSteps.splice(newIndex, 0, movedStep);

                return {
                    testCase: { ...state.testCase, steps: newSteps },
                    isDirty: true
                };
            }),

            duplicateStep: (stepId) => set((state) => {
                if (!state.testCase) return state;

                const index = state.testCase.steps.findIndex((s: TestStep) => s.id === stepId);
                if (index === -1) return state;

                const stepToDuplicate = state.testCase.steps[index];
                const duplicatedStep: TestStep = {
                    ...stepToDuplicate,
                    id: uuidv4(),
                    description: `${stepToDuplicate.description} (Cópia)`
                };

                const currentSteps = [...state.testCase.steps];
                currentSteps.splice(index + 1, 0, duplicatedStep);

                return {
                    testCase: { ...state.testCase, steps: currentSteps },
                    isDirty: true
                };
            }),

            setSelectedStepId: (id) => set({ selectedStepId: id }),
            setIsGenerating: (isGenerating) => set({ isGenerating }),
            setIsRecording: (isRecording) => set({ isRecording }),

            setSaving: (saving) => set({ isSaving: saving }),
            markSaved: () => set({ isDirty: false, lastSavedAt: new Date(), isSaving: false })

        }),
        { limit: 50, partialize: (state) => ({ testCase: state.testCase }) }
    )
);
