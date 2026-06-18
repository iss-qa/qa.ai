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
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
            <div className={`bg-card border border-border rounded-2xl w-full ${maxWidth} shadow-2xl flex flex-col max-h-[90vh] transform-gpu`}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                    {children}
                </div>

                {footer && (
                    <div className="p-6 pt-2 flex gap-3 justify-end border-t border-border">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
