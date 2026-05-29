'use client';

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { useSensors } from '@dnd-kit/core';
import type { TestStep } from '../editor-types';
import { SortableStepItem } from './SortableStepItem';

function EmptyStepsState() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 opacity-50">
            <div className="text-4xl">🧪</div>
            <p className="text-sm text-zinc-400">Nenhum passo ainda.</p>
            <p className="text-xs text-zinc-500">Use o prompt abaixo para gerar com IA<br />ou ative o Gravador Manual.</p>
        </div>
    );
}

export function StepsList({
    steps,
    isGenerating,
    isExecuting,
    editingStepId,
    editingData,
    setEditingData,
    sensors,
    onDragEnd,
    onEditStep,
    onDeleteStep,
    onDuplicate,
    onCopy,
    onSaveEdit,
    onCancelEdit,
}: {
    steps: TestStep[];
    isGenerating: boolean;
    isExecuting: boolean;
    editingStepId: string | null;
    editingData: Partial<TestStep>;
    setEditingData: (data: Partial<TestStep>) => void;
    sensors: ReturnType<typeof useSensors>;
    onDragEnd: (event: DragEndEvent) => void;
    onEditStep: (step: TestStep, data: Partial<TestStep>) => void;
    onDeleteStep: (step: TestStep) => void;
    onDuplicate: (step: TestStep) => void;
    onCopy: (step: TestStep) => void;
    onSaveEdit: (step: TestStep) => void;
    onCancelEdit: () => void;
}) {
    if (steps.length === 0 && !isGenerating) {
        return <EmptyStepsState />;
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {steps.map((step, index) => (
                    <SortableStepItem
                        key={step.id}
                        step={step}
                        index={index}
                        isEditing={editingStepId === step.id}
                        isExecuting={isExecuting}
                        onEdit={(s) => onEditStep(step, s)}
                        onDelete={() => onDeleteStep(step)}
                        onDuplicate={onDuplicate}
                        onCopy={onCopy}
                        editingData={editingData}
                        setEditingData={setEditingData}
                        onSaveEdit={() => onSaveEdit(step)}
                        onCancelEdit={onCancelEdit}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}
