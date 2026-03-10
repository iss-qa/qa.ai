'use client';

import { TestStep } from '@qamind/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Copy, Trash2, Edit2 } from 'lucide-react';

const ACTION_ICONS: Record<string, string> = {
    open_app: '📱',
    tap: '👆',
    type_text: '⌨️',
    swipe: '👋',
    scroll: '📜',
    longpress: '🖐️',
    wait: '⏳',
    assert_text: '✅',
    assert_element: '🔍',
    assert_url: '🔗',
    press_back: '⬅️',
    press_home: '🏠',
    screenshot: '📸',
};

// Default fallback icon
const getIcon = (action: string) => ACTION_ICONS[action] || '⚙️';

interface StepCardProps {
    step: TestStep;
    index: number;
    isSelected: boolean;
    status: 'idle' | 'running' | 'passed' | 'failed' | 'pending';
    onSelect: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
}

export function StepCard({ step, index, isSelected, status, onSelect, onDelete, onDuplicate }: StepCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Status visual mapping
    const statusStyles = {
        idle: 'border-white/5 bg-bgSecondary hover:border-white/10',
        running: 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse',
        passed: 'border-green-500/50 bg-green-500/10',
        failed: 'border-red-500/50 bg-red-500/10',
        pending: 'border-white/20 bg-white/5 opacity-50'
    };

    const selectedClass = isSelected ? 'border-brand/50 ring-1 ring-brand bg-bgSecondary' : statusStyles[status];

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group flex items-center p-3 rounded-xl border transition-all cursor-pointer ${selectedClass} ${isDragging ? 'opacity-50 scale-95 z-50' : ''}`}
            onClick={onSelect}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab hover:bg-white/10 p-1.5 rounded-md text-textSecondary hover:text-white transition-colors mr-2 hidden sm:flex"
                onClick={(e) => e.stopPropagation()} // Prevent selecting when just dragging
            >
                <GripVertical className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0 flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-lg">
                    {getIcon(step.action)}
                </div>

                <div className="flex-1 truncate">
                    <p className="font-medium text-sm text-white truncate break-words">
                        <span className="text-textSecondary mr-2">{index + 1}.</span>
                        {step.description || `Action: ${step.action}`}
                    </p>
                    <div className="flex text-xs text-textSecondary gap-2 truncate mt-0.5">
                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-[10px] text-white/70 uppercase tracking-wider">
                            {step.action}
                        </span>
                        {step.target && <span className="truncate max-w-[120px]">› {step.target}</span>}
                    </div>
                </div>
            </div>

            {/* Hover Actions */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 ml-2">
                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="p-1.5 text-textSecondary hover:text-white hover:bg-white/10 rounded-md transition-colors"
                    title="Duplicar"
                >
                    <Copy className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                    title="Deletar"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
