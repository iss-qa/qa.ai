'use client';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { useTestEditor } from '@/store/testEditor';
import { StepCard } from './StepCard';
import { Plus } from 'lucide-react';
import { TestStep } from '@qamind/shared';

export function StepList() {
    const steps = useTestEditor(state => state.testCase?.steps || []);
    const selectedStepId = useTestEditor(state => state.selectedStepId);

    const reorderSteps = useTestEditor(state => state.reorderSteps);
    const setSelectedStepId = useTestEditor(state => state.setSelectedStepId);
    const deleteStep = useTestEditor(state => state.deleteStep);
    const duplicateStep = useTestEditor(state => state.duplicateStep);
    const addStep = useTestEditor(state => state.addStep);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = steps.findIndex((step: TestStep) => step.id === active.id);
            const newIndex = steps.findIndex((step: TestStep) => step.id === over.id);
            reorderSteps(oldIndex, newIndex);
        }
    }

    if (steps.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-xl my-4 text-textSecondary">
                <p className="mb-2">Nenhum step adicionado ainda.</p>
                <p className="text-sm">Use a IA acima ou grave no celular para começar.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto space-y-2 pb-24 pr-2 custom-scrollbar">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={steps.map((s: TestStep) => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {steps.map((step: TestStep, index: number) => (
                        <StepCard
                            key={step.id}
                            step={step}
                            index={index}
                            isSelected={selectedStepId === step.id}
                            status="idle" // Will wire up real status later
                            onSelect={() => setSelectedStepId(step.id)}
                            onDelete={() => deleteStep(step.id)}
                            onDuplicate={() => duplicateStep(step.id)}
                        />
                    ))}
                </SortableContext>
            </DndContext>

            <button
                onClick={() => addStep({})}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 border border-dashed border-white/20 hover:border-brand/50 hover:bg-brand/5 text-textSecondary hover:text-white rounded-xl transition-all"
            >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Novo Step Vazio</span>
            </button>
        </div>
    );
}
