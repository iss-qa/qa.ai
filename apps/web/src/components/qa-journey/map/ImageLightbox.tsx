'use client';

// Lightbox simples para ampliar uma tela do storyboard (imagem + legenda).

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { VideoStep } from '@/types/qa-journey';

interface ImageLightboxProps {
    step: VideoStep;
    index?: number;
    onClose: () => void;
}

export function ImageLightbox({ step, index, onClose }: ImageLightboxProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="relative flex flex-col items-center gap-3 max-w-[92vw] max-h-[88vh]"
            >
                <button
                    onClick={onClose}
                    className="absolute -top-2 -right-2 sm:top-2 sm:right-2 z-10 p-1.5 rounded-full bg-popover border border-border text-muted-foreground hover:text-foreground shadow"
                    aria-label="Fechar"
                >
                    <X className="w-4 h-4" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={step.image_url}
                    alt={step.caption || `Tela ${index ?? ''}`}
                    className="max-w-full max-h-[78vh] object-contain rounded-xl border border-border bg-card shadow-2xl"
                />
                {step.caption && (
                    <div className="max-w-2xl bg-popover/90 border border-border rounded-lg px-4 py-2 text-sm text-foreground text-center">
                        {index != null && <span className="font-bold text-brand mr-1.5">{index}.</span>}
                        {step.caption}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
