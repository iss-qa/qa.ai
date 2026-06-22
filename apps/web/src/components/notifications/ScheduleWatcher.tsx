'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/store/notificationStore';

// Quão cedo (em minutos) avisar antes de um agendamento disparar.
const LEAD_MINUTES = 5;
const POLL_MS = 60_000;

interface ScheduleRow {
    id: string;
    name: string | null;
    next_run_at: string | null;
    is_active: boolean;
    test_ids: unknown;
}

// Observa os agendamentos ativos (test_schedules) e, quando um está a até
// LEAD_MINUTES de disparar, emite uma notificação + modal — uma única vez por
// ocorrência. Roda globalmente (montado no PageWrapper), então o aviso aparece
// em qualquer tela do dashboard, inclusive na de gravação.
export function ScheduleWatcher() {
    const notifyScheduleUpcoming = useNotificationStore((s) => s.notifyScheduleUpcoming);

    useEffect(() => {
        const supabase = createClient();
        let cancelled = false;

        const check = async () => {
            const { data, error } = await supabase
                .from('test_schedules')
                .select('id, name, next_run_at, is_active, test_ids')
                .eq('is_active', true)
                .not('next_run_at', 'is', null);

            if (cancelled || error || !Array.isArray(data)) return;

            const now = Date.now();
            for (const s of data as ScheduleRow[]) {
                if (!s.next_run_at) continue;
                const ms = new Date(s.next_run_at).getTime() - now;
                if (Number.isNaN(ms)) continue;
                if (ms <= 0 || ms > LEAD_MINUTES * 60_000) continue;

                const mins = Math.max(1, Math.round(ms / 60_000));
                const count = Array.isArray(s.test_ids) ? s.test_ids.length : 0;
                const nome = s.name || 'Agendamento';
                const plural = count === 1 ? 'teste' : 'testes';

                notifyScheduleUpcoming({
                    key: `${s.id}@${s.next_run_at}`,
                    title: 'Agendamento em breve',
                    message:
                        `O agendamento "${nome}" (${count} ${plural}) será executado em ~${mins} ` +
                        `${mins === 1 ? 'minuto' : 'minutos'}. Mantenha o dispositivo conectado e ` +
                        `SEM ações (não execute testes nem inicie gravação) até o lote terminar.`,
                });
            }
        };

        check();
        const iv = setInterval(check, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [notifyScheduleUpcoming]);

    return null;
}
