'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/store/notificationStore';

// Observa casos/sub-fluxos com "alerta de automação" configurado e dispara uma
// notificação no sino quando o prazo (created_at + N dias) é atingido E o item
// ainda está manual (sem teste automatizado vinculado). Idempotente por
// `autocase:<id>:<dias>` / `autosub:<id>:<dias>`. Roda globalmente (PageWrapper).

const DAY_MS = 86_400_000;
const POLL_MS = 30 * 60_000; // 30 min — o limiar é diário, não precisa ser fino.

// Embeds podem voltar como objeto (to-one) ou array, dependendo da versão.
function one<T>(v: T | T[] | null | undefined): T | null {
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
}

interface CaseRow {
    id: string;
    title: string;
    created_at: string;
    automation_alert_days: number | null;
    test_case_id: string | null;
    automation_engine: string | null;
    playwright_path: string | null;
    playwright_repo: string | null;
    subflow?: unknown;   // embed PostgREST (objeto ou array)
}

interface SubflowRow {
    id: string;
    title: string;
    created_at: string;
    automation_alert_days: number | null;
    test_case_id: string | null;
    journey?: unknown;   // embed PostgREST (objeto ou array)
}

const isDue = (createdAt: string, days: number) => {
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() >= t + days * DAY_MS;
};

const journeyHref = (projectId?: string, journeyId?: string) =>
    projectId && journeyId
        ? `/dashboard/qa-journey?project=${encodeURIComponent(projectId)}&solo=${encodeURIComponent(journeyId)}`
        : undefined;

export function AutomationAlertWatcher() {
    const notifyAutomationDue = useNotificationStore((s) => s.notifyAutomationDue);

    useEffect(() => {
        const supabase = createClient();
        let cancelled = false;

        const check = async () => {
            // ── Casos ────────────────────────────────────────────────
            try {
                const { data, error } = await supabase
                    .from('qa_journey_cases')
                    .select('id, title, created_at, automation_alert_days, test_case_id, automation_engine, playwright_path, playwright_repo, subflow:qa_journey_subflows(journey:qa_journeys(id, project_id, title))')
                    .not('automation_alert_days', 'is', null)
                    .is('archived_at', null);

                if (!cancelled && !error && Array.isArray(data)) {
                    for (const c of data as unknown as CaseRow[]) {
                        const days = c.automation_alert_days;
                        if (!days || !isDue(c.created_at, days)) continue;
                        // Já automatizado (Maestro ou Playwright) → não alerta.
                        const automated = Boolean(c.test_case_id)
                            || (c.automation_engine === 'playwright' && Boolean(c.playwright_path || c.playwright_repo));
                        if (automated) continue;

                        const subflow = one(c.subflow as never) as { journey?: unknown } | null;
                        const journey = one(subflow?.journey as never) as { id: string; project_id: string } | null;
                        notifyAutomationDue({
                            key: `autocase:${c.id}:${days}`,
                            title: c.title,
                            message: `Prazo de ${days} dias atingido — deve ser automatizado. Inclua na sprint.`,
                            href: journeyHref(journey?.project_id, journey?.id),
                        });
                    }
                }
            } catch { /* schema antigo / offline — ignora silenciosamente */ }

            // ── Sub-fluxos ───────────────────────────────────────────
            try {
                const { data, error } = await supabase
                    .from('qa_journey_subflows')
                    .select('id, title, created_at, automation_alert_days, test_case_id, journey:qa_journeys(id, project_id)')
                    .not('automation_alert_days', 'is', null);

                if (!cancelled && !error && Array.isArray(data)) {
                    for (const s of data as unknown as SubflowRow[]) {
                        const days = s.automation_alert_days;
                        if (!days || !isDue(s.created_at, days)) continue;
                        if (s.test_case_id) continue; // já vinculado a um teste
                        const journey = one(s.journey as never) as { id: string; project_id: string } | null;
                        notifyAutomationDue({
                            key: `autosub:${s.id}:${days}`,
                            title: s.title,
                            message: `Prazo de ${days} dias atingido — sub-fluxo deve ser automatizado. Inclua na sprint.`,
                            href: journeyHref(journey?.project_id, journey?.id),
                        });
                    }
                }
            } catch { /* ignora */ }
        };

        check();
        const iv = setInterval(check, POLL_MS);
        return () => { cancelled = true; clearInterval(iv); };
    }, [notifyAutomationDue]);

    return null;
}
