'use client';

import { AlertTriangle } from 'lucide-react';

// Banner mostrado quando as tabelas qa_journey_* nao existem no Supabase.
// Detectado via Postgres error code 42P01 nas queries.
export function MigrationMissingBanner() {
    return (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
                <AlertTriangle className="w-5 h-5" />
                Migration ausente
            </div>
            <p className="text-sm text-slate-300">
                A tabela <code className="font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">qa_journeys</code> (e demais tabelas da Jornada) ainda não existe no Supabase.
                Aplique a migration <code className="font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">supabase/migrations/006_qa_journey.sql</code> no SQL Editor do projeto e recarregue esta página.
            </p>
            <p className="text-xs text-slate-500">
                Arquivo em <code className="font-mono">supabase/migrations/</code> no repositório.
            </p>
        </div>
    );
}
