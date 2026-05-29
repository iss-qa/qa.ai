'use client';

import { useState, useEffect, useRef } from 'react';
import { Smartphone, Search, Zap, CheckCircle2, Cpu, Shield } from 'lucide-react';

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
];

// After the timed phases above end, the overlay enters a holding loop that
// rotates these messages every 3.5s. We stop guessing how long it'll take
// (which used to say "Pronto!" while the user still waited 10s for the JVM
// cold-start to finish) and instead keep them informed that work is still
// happening. The parent component hides the overlay when the first
// `commandStatuses` event arrives via SSE — that's the only reliable signal
// that the actual test execution has begun.
const HOLDING_MESSAGES = [
    'Inicializando JVM do Maestro...',
    'Aguardando driver Android responder...',
    'Sincronizando hierarquia da tela...',
    'Pronto para executar — começando em instantes...',
];

const TOTAL_DURATION = PHASES.reduce((sum, p) => sum + p.duration, 0); // ~17s
const HOLDING_TICK = 3500;

export function ExecutionOverlay({ isVisible, onComplete }: ExecutionOverlayProps) {
    const [phase, setPhase] = useState(0);
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const [fadingOut, setFadingOut] = useState(false);
    // When the timed phases are done we enter "holding" mode: spinner stays
    // alive, progress eases toward 90% asymptotically (never hits 100% on
    // its own — that's reserved for the fade-out), and the text cycles
    // through HOLDING_MESSAGES so the user knows we're still working.
    // Caller hides the overlay (isVisible=false) when the first real step
    // event arrives via SSE.
    const [holdingIdx, setHoldingIdx] = useState<number>(-1);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const holdingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
                    setHoldingIdx(-1);
                    if (timerRef.current) clearInterval(timerRef.current);
                    if (holdingTimerRef.current) clearInterval(holdingTimerRef.current);
                }, 600);
            }
            return;
        }

        // Start animation
        setVisible(true);
        setFadingOut(false);
        setPhase(0);
        setProgress(0);
        setHoldingIdx(-1);
        let elapsed = 0;

        timerRef.current = setInterval(() => {
            elapsed += 60;

            const inTimedPhases = elapsed < TOTAL_DURATION;
            if (inTimedPhases) {
                // Linear progress up to 80% during the timed phases.
                setProgress(Math.min((elapsed / TOTAL_DURATION) * 80, 80));

                // Determine current phase
                let acc = 0;
                for (let i = 0; i < PHASES.length; i++) {
                    acc += PHASES[i].duration;
                    if (elapsed < acc) {
                        setPhase(i);
                        break;
                    }
                }
            } else {
                // After timed phases: pin to last phase, start cycling
                // holding messages, and ease progress 80% → ~90% so the bar
                // doesn't look frozen but also never claims completion that
                // hasn't happened yet.
                setPhase(PHASES.length - 1);
                if (holdingIdx === -1) {
                    setHoldingIdx(0);
                }
                // Asymptote toward 92% — slower the closer it gets.
                setProgress(p => Math.min(p + (92 - p) * 0.008, 92));
            }
        }, 60);

        holdingTimerRef.current = setInterval(() => {
            // Advance the holding message only after we've left the timed phases.
            if (Date.now()) {
                setHoldingIdx(prev => {
                    if (prev < 0) return prev;
                    return (prev + 1) % HOLDING_MESSAGES.length;
                });
            }
        }, HOLDING_TICK);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (holdingTimerRef.current) clearInterval(holdingTimerRef.current);
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

            {/* Phase text — uses HOLDING_MESSAGES once we've left the timed phases.
                The `key` rotates the fade-in animation so the user sees the
                message refreshing instead of feeling stuck on a single line. */}
            {(() => {
                const isHolding = holdingIdx >= 0;
                const text = isHolding ? HOLDING_MESSAGES[holdingIdx] : currentPhase.text;
                const subtitle = isHolding
                    ? 'Aguarde — primeiro start é mais lento'
                    : `Fase ${Math.min(phase + 1, PHASES.length)} de ${PHASES.length}`;
                const animKey = isHolding ? `hold-${holdingIdx}` : `phase-${phase}`;
                return (
                    <div className="text-center mb-6" key={animKey}>
                        <p className="text-base font-semibold text-white mb-1 animate-[fadeIn_0.3s_ease-out]">
                            {text}
                        </p>
                        <p className="text-xs text-slate-500">{subtitle}</p>
                    </div>
                );
            })()}

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

            {/* Phase dots — in holding mode all dots are lit and the last one
                pulses to communicate "waiting for the actual start". */}
            <div className="flex gap-3">
                {PHASES.map((_, i) => {
                    const isHolding = holdingIdx >= 0;
                    const cls = isHolding
                        ? (i === PHASES.length - 1
                            ? 'bg-white scale-150 shadow-[0_0_8px_rgba(255,255,255,0.5)] animate-pulse'
                            : 'bg-brand scale-100')
                        : (i < phase ? 'bg-brand scale-100' :
                           i === phase ? 'bg-white scale-150 shadow-[0_0_8px_rgba(255,255,255,0.5)]' :
                           'bg-white/10 scale-100');
                    return <div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${cls}`} />;
                })}
            </div>
        </div>
    );
}
