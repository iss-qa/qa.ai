'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebConfig, listWebRuns, triggerWebRun } from './web-api';
import { isRunActive, type WebConfig, type WebRun } from './web-types';

const POLL_MS = 4000;

// Estado central da aba Web do projeto: config + histórico de runs, com
// polling enquanto houver algum run ativo (queued/running).
export function useWebTesting(projectId: string) {
    const [config, setConfig] = useState<WebConfig | null>(null);
    const [runs, setRuns] = useState<WebRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refreshRuns = useCallback(async () => {
        try {
            const { runs } = await listWebRuns(projectId);
            setRuns(runs);
            return runs;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return [];
        }
    }, [projectId]);

    const refreshConfig = useCallback(async () => {
        try {
            const { config } = await getWebConfig(projectId);
            setConfig(config);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [projectId]);

    // Carga inicial
    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            await Promise.all([refreshConfig(), refreshRuns()]);
            if (alive) setLoading(false);
        })();
        return () => { alive = false; };
    }, [refreshConfig, refreshRuns]);

    // Polling enquanto algum run estiver ativo
    useEffect(() => {
        const hasActive = runs.some((r) => isRunActive(r.status));
        if (hasActive && !pollRef.current) {
            pollRef.current = setInterval(() => { void refreshRuns(); }, POLL_MS);
        } else if (!hasActive && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [runs, refreshRuns]);

    const trigger = useCallback(async (opts?: { branch?: string; spec?: string; env?: string }) => {
        const res = await triggerWebRun(projectId, opts);
        await refreshRuns();
        return res;
    }, [projectId, refreshRuns]);

    return { config, runs, loading, error, refreshConfig, refreshRuns, trigger };
}
