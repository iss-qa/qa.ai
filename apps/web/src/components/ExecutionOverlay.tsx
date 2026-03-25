'use client';

import { useState, useEffect, useRef } from 'react';
import { Smartphone, Search, Zap, CheckCircle2, Play, Cpu, Shield } from 'lucide-react';

interface ExecutionOverlayProps {
    isVisible: boolean;
    onComplete: () => void;
}

const PHASES = [
    { icon: Search, text: 'Analisando passos do teste...', color: 'text-blue-400', duration: 3000 },
    { icon: Smartphone, text: 'Conectando ao dispositivo...', color: 'text-cyan-400', duration: 3000 },
    { icon: Cpu, text: 'Buscando aplicativo no device...', color: 'text-purple-400', duration: 4000 },
    { icon: Shield, text: 'Parando servicos conflitantes...', color: 'text-orange-400', duration: 3000 },
    { icon: Zap, text: 'Preparando engine Maestro...', color: 'text-amber-400', duration: 4000 },
    { icon: Play, text: 'Pronto! Iniciando execucao...', color: 'text-green-400', duration: 3000 },
];

const TOTAL_DURATION = PHASES.reduce((sum, p) => sum + p.duration, 0); // ~20s

export function ExecutionOverlay({ isVisible, onComplete }: ExecutionOverlayProps) {
    const [phase, setPhase] = useState(0);
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const [fadingOut, setFadingOut] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!isVisible) {
            // Trigger fade out
            if (visible && !fadingOut) {
                setFadingOut(true);
                setTimeout(() => {
                    setVisible(false);
                    setFadingOut(false);
                    setPhase(0);
                    setProgress(0);
                    if (timerRef.current) clearInterval(timerRef.current);
                }, 600);
            }
            return;
        }

        // Start animation
        setVisible(true);
        setFadingOut(false);
        setPhase(0);
        setProgress(0);
        let elapsed = 0;

        timerRef.current = setInterval(() => {
            elapsed += 60;

            // Progress goes to 95% over TOTAL_DURATION, then holds
            // (the last 5% happens on fade out)
            const pct = Math.min((elapsed / TOTAL_DURATION) * 95, 95);
            setProgress(pct);

            // Determine current phase
            let acc = 0;
            for (let i = 0; i < PHASES.length; i++) {
                acc += PHASES[i].duration;
                if (elapsed < acc) {
                    setPhase(i);
                    break;
                }
                if (i === PHASES.length - 1) {
                    setPhase(i); // Stay on last phase
                }
            }
        }, 60);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isVisible]);

    if (!visible) return null;

    const currentPhase = PHASES[Math.min(phase, PHASES.length - 1)];
    const Icon = currentPhase.icon;
    const isComplete = progress >= 95;

    return (
        <div
            className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ background: 'radial-gradient(ellipse at center, rgba(10,12,20,0.97) 0%, rgba(10,12,20,0.99) 100%)' }}
        >
            {/* Ambient glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-15 blur-[100px] transition-colors duration-1000"
                    style={{ background: isComplete ? 'radial-gradient(circle, #22c55e, transparent)' : `radial-gradient(circle, ${currentPhase.color.includes('blue') ? '#4A90D9' : currentPhase.color.includes('purple') ? '#7C3AED' : currentPhase.color.includes('amber') ? '#F59E0B' : '#4A90D9'}, transparent)` }}
                />
            </div>

            {/* Ring + Icon */}
            <div className="relative w-28 h-28 mb-8">
                {/* Spinning outer ring */}
                <div
                    className={`absolute inset-0 rounded-full border-2 border-transparent ${!isComplete ? 'animate-spin' : ''}`}
                    style={{
                        borderTopColor: isComplete ? '#22c55e' : '#4A90D9',
                        borderRightColor: 'transparent',
                        animationDuration: '1.5s',
                    }}
                />

                {/* Progress ring */}
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                    <circle
                        cx="56" cy="56" r="48" fill="none"
                        stroke="url(#exec-gradient)" strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 48}`}
                        strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress / 100)}`}
                        className="transition-all duration-500 ease-out"
                    />
                    <defs>
                        <linearGradient id="exec-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={isComplete ? '#22c55e' : '#4A90D9'} />
                            <stop offset="100%" stopColor={isComplete ? '#4ade80' : '#7C3AED'} />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                    {isComplete ? (
                        <CheckCircle2 className="w-10 h-10 text-green-400" />
                    ) : (
                        <Icon className={`w-9 h-9 ${currentPhase.color} animate-pulse`} key={phase} />
                    )}
                </div>
            </div>

            {/* Phase text */}
            <div className="text-center mb-6" key={phase}>
                <p className="text-base font-semibold text-white mb-1 animate-[fadeIn_0.3s_ease-out]">
                    {currentPhase.text}
                </p>
                <p className="text-xs text-slate-500">
                    Fase {Math.min(phase + 1, PHASES.length)} de {PHASES.length}
                </p>
            </div>

            {/* Progress bar */}
            <div className="w-64 h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4">
                <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                        width: `${progress}%`,
                        background: isComplete
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : 'linear-gradient(90deg, #4A90D9, #7C3AED)',
                    }}
                />
            </div>

            {/* Phase dots */}
            <div className="flex gap-3">
                {PHASES.map((_, i) => (
                    <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-500 ${
                            i < phase ? 'bg-brand scale-100' :
                            i === phase ? 'bg-white scale-150 shadow-[0_0_8px_rgba(255,255,255,0.5)]' :
                            'bg-white/10 scale-100'
                        }`}
                    />
                ))}
            </div>
        </div>
    );
}
