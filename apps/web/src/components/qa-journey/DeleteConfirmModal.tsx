'use client';

import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
    title: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
    confirmLabel?: string;
}

export function DeleteConfirmModal({
    title,
    message,
    onCancel,
    onConfirm,
    confirmLabel = 'Excluir',
}: DeleteConfirmModalProps) {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    {title}
                </h3>
                <p className="text-sm text-slate-400 mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
