'use client';

import { useVisionStore } from '@/store/visionStore';
import { Loader2 } from 'lucide-react';

export function ExecutionToast() {
  const executionProgress = useVisionStore((s) => s.executionProgress);

  if (!executionProgress) return null;

  const { current, total, description } = executionProgress;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-[#1A1D27] border border-white/10 rounded-xl shadow-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-4 h-4 text-brand animate-spin" />
        <span className="text-sm font-semibold text-white">Executando teste</span>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Passo {current} de {total} — {description}
      </p>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 mt-1 block text-right">{percentage}%</span>
    </div>
  );
}
