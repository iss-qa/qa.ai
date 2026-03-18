'use client';

import { useVisionStore } from '@/store/visionStore';
import { DAEMON_URL } from '@/lib/constants';

interface AmbiguityDialogProps {
  runId: string | null;
}

export function AmbiguityDialog({ runId }: AmbiguityDialogProps) {
  const ambiguityEvent = useVisionStore((s) => s.ambiguityEvent);
  const setAmbiguityEvent = useVisionStore((s) => s.setAmbiguityEvent);

  if (!ambiguityEvent || !runId) return null;

  const handleChoice = async (candidate: { x: number; y: number; label: string }) => {
    try {
      await fetch(`${DAEMON_URL}/api/runs/${runId}/resolve-ambiguity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_num: ambiguityEvent.stepNum,
          x: candidate.x,
          y: candidate.y,
        }),
      });

      // Save choice to localStorage for reuse
      const key = `ambiguity_${ambiguityEvent.stepNum}`;
      localStorage.setItem(key, JSON.stringify({ x: candidate.x, y: candidate.y }));
    } catch (error) {
      console.error('Failed to resolve ambiguity:', error);
    }
    setAmbiguityEvent(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <h3 className="text-sm font-bold text-white mb-1">Elemento Ambiguo Detectado</h3>
        <p className="text-xs text-zinc-400 mb-4">
          {ambiguityEvent.reason || 'Foram encontrados multiplos elementos similares. Selecione o correto.'}
        </p>

        {/* Screenshot with numbered markers */}
        <div className="relative rounded-lg overflow-hidden mb-4 border border-white/10">
          <img
            src={`data:image/jpeg;base64,${ambiguityEvent.screenshotBase64}`}
            alt="Device screenshot"
            className="w-full"
          />
          {ambiguityEvent.candidates.map((c) => (
            <button
              key={c.index}
              onClick={() => handleChoice(c)}
              className="absolute w-8 h-8 rounded-full bg-brand/80 text-white text-xs font-bold flex items-center justify-center cursor-pointer hover:scale-125 hover:bg-brand transition-all shadow-lg border-2 border-white/50"
              style={{
                left: `${(c.x / 1080) * 100}%`,
                top: `${(c.y / 1920) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {c.index}
            </button>
          ))}
        </div>

        {/* Button options */}
        <div className="flex gap-2">
          {ambiguityEvent.candidates.map((c) => (
            <button
              key={c.index}
              onClick={() => handleChoice(c)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg py-2.5 text-xs text-zinc-300 hover:bg-brand/20 hover:border-brand/50 hover:text-white transition-colors font-medium"
            >
              {c.index} — {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
