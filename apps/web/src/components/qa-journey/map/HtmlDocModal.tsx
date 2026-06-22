'use client';

// Visualizador genérico de "documento HTML" (jornada ou sub-fluxo) em iframe
// isolado. sandbox: scripts rodam para abas/filtros do documento funcionarem,
// mas sem acesso à origem do dashboard. Imagens funcionam quando o HTML é
// self-contained (data URIs embutidos no import de .zip — ver html-bundle.ts).

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileCode2, Maximize2, Minimize2, X } from 'lucide-react';

interface HtmlDocModalProps {
    title: string;
    subtitle?: string;
    html: string;
    accentColor?: string;   // cor do ícone/cabeçalho (ex.: cor da jornada)
    onClose: () => void;
}

export function HtmlDocModal({ title, subtitle, html, accentColor, onClose }: HtmlDocModalProps) {
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={`relative bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full ${
                    expanded ? 'h-[94vh] max-w-[96vw]' : 'h-[70vh] max-w-4xl'
                }`}
            >
                <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
                    <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-border"
                        style={{ background: `${accentColor || '#7c3aed'}22` }}
                    >
                        <FileCode2 className="w-3.5 h-3.5 text-brand" />
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                        {subtitle && (
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                                {subtitle}
                            </span>
                        )}
                        <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
                    </div>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0"
                        title={expanded ? 'Reduzir' : 'Expandir'}
                        aria-label={expanded ? 'Reduzir visualização' : 'Expandir visualização'}
                    >
                        {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <iframe
                    srcDoc={html}
                    sandbox="allow-scripts"
                    className="flex-1 w-full bg-white"
                    title={`Documento HTML — ${title}`}
                />
            </motion.div>
        </div>
    );
}
