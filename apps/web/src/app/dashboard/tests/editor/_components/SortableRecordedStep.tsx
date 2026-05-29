'use client';

import { type ReactNode } from 'react';
import { type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Sortable wrapper for a recorded step row. We use dnd-kit (already on the
 * page for the regular step editor) so the same drag-handle/animation pattern
 * carries over. Children are rendered as a function so the row layout stays
 * inline in the page — this keeps the diff small and the visual identical
 * across drag/no-drag states.
 */
export function SortableRecordedStep({
    id,
    children,
}: {
    id: string;
    children: (args: { dragHandleProps: DraggableAttributes & DraggableSyntheticListeners; isDragging: boolean }) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        opacity: isDragging ? 0.8 : 1,
    };
    return (
        <div ref={setNodeRef} style={style}>
            {children({
                dragHandleProps: { ...attributes, ...listeners } as DraggableAttributes & DraggableSyntheticListeners,
                isDragging,
            })}
        </div>
    );
}
