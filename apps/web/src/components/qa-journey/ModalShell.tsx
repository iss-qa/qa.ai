'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
    title: ReactNode;
    onClose: () => void;
    footer?: ReactNode;
    maxWidth?: string;            // tailwind class, ex: "max-w-2xl"
    children: ReactNode;
}

// Casca visual padrao dos modais da Jornada do QA.
// Reproduz o estilo de /dashboard/bugs (dark card sobre overlay blur).
export function ModalShell({ title, onClose, footer, maxWidth = 'max-w-2xl', children }: ModalShellProps) {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`bg-[#0A0C14] border border-white/10 rounded-2xl w-full ${maxWidth} shadow-2xl flex flex-col max-h-[90vh]`}>
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/5"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                    {children}
                </div>

                {footer && (
                    <div className="p-6 pt-2 flex gap-3 justify-end border-t border-white/10">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
