'use client';

import { useMemo } from 'react';

interface ParticleBackgroundProps {
    count?: number;
    className?: string;
}

// Fundo "espacial" com pontos que pulsam suavemente.
// CSS puro (sem framer-motion) para nao competir com a animação do mapa.
// As coordenadas e delays sao deterministicos via hash do index para evitar
// flicker de SSR/CSR mismatch.
export function ParticleBackground({ count = 80, className = '' }: ParticleBackgroundProps) {
    const stars = useMemo(() => {
        const arr: { left: string; top: string; size: number; delay: number; duration: number; opacity: number }[] = [];
        for (let i = 0; i < count; i++) {
            // pseudo-random deterministico baseado em i
            const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
            const s = (Math.sin(i * 4.123) * 3000) % 1;
            arr.push({
                left:     `${(Math.abs(x) * 100).toFixed(2)}%`,
                top:      `${(Math.abs(y) * 100).toFixed(2)}%`,
                size:     1 + Math.abs(s) * 1.5,
                delay:    Math.abs(s) * 4,
                duration: 2.5 + Math.abs(x) * 3,
                opacity:  0.3 + Math.abs(y) * 0.6,
            });
        }
        return arr;
    }, [count]);

    return (
        <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
            {/* Gradient halo */}
            <div className="absolute inset-0 bg-gradient-radial from-brand/5 via-transparent to-transparent" />

            {stars.map((s, i) => (
                <span
                    key={i}
                    className="absolute rounded-full bg-white qa-star"
                    style={{
                        left: s.left,
                        top: s.top,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        opacity: s.opacity,
                        animationDelay: `${s.delay}s`,
                        animationDuration: `${s.duration}s`,
                    }}
                />
            ))}

            <style jsx>{`
                .qa-star {
                    animation-name: qa-star-twinkle;
                    animation-iteration-count: infinite;
                    animation-timing-function: ease-in-out;
                }
                @keyframes qa-star-twinkle {
                    0%, 100% { opacity: 0.25; transform: scale(0.9); }
                    50%      { opacity: 0.95; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
}
