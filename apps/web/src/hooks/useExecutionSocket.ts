import { useEffect, useState, useRef } from 'react';

export type LogEntry = {
    id: string;
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'ai';
    message: string;
    stepNum?: number;
};

export type StepStatus = 'idle' | 'running' | 'passed' | 'failed' | 'pending';

export function useExecutionSocket(clientId: string) {
    const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
    const [currentStepNum, setCurrentStepNum] = useState<number | null>(null);
    const [stepStatuses, setStepStatuses] = useState<Record<number, StepStatus>>({});
    const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
    const [runStatus, setRunStatus] = useState<'pending' | 'running' | 'passed' | 'failed' | 'cancelled'>('pending');
    const [bugReport, setBugReport] = useState<{ pdf_url: string; title: string; severity: string } | null>(null);

    const wsRef = useRef<WebSocket | null>(null);

    const addLog = (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
        setLogEntries(prev => [...prev, {
            ...log,
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toLocaleTimeString()
        }]);
    };

    useEffect(() => {
        // We assume the daemon is running locally on port 8000 for this MVP
        const ws = new WebSocket(`ws://localhost:8000/ws/${clientId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            addLog({ type: 'info', message: 'Conectado ao Engine de Execução' });
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                switch (payload.type) {
                    case 'device_status':
                        // we could handle device connection drops here
                        break;

                    case 'run_started':
                        setRunStatus('running');
                        addLog({ type: 'info', message: `▶ Iniciando Execução (${payload.data.total_steps} steps)` });
                        break;

                    case 'step_started':
                        setCurrentStepNum(payload.data.step_num);
                        setStepStatuses(prev => ({ ...prev, [payload.data.step_num]: 'running' }));
                        addLog({ type: 'info', message: `⏳ Step ${payload.data.step_num}: executando ação nativa...` });
                        break;

                    case 'step_completed':
                        setStepStatuses(prev => ({ ...prev, [payload.data.step_num]: 'passed' }));
                        addLog({ type: 'success', message: `✅ Step ${payload.data.step_num} validado visualmente (${payload.data.duration_ms}ms)` });
                        break;

                    case 'step_retrying':
                        addLog({ type: 'ai', stepNum: payload.data.step_num, message: `🤖 Falha visual detectada. AutoCorrector iniciando tentativa ${payload.data.attempt}: ${payload.data.reason}` });
                        break;

                    case 'run_failed':
                        setRunStatus('failed');
                        setStepStatuses(prev => ({ ...prev, [payload.data.failed_step]: 'failed' }));
                        addLog({ type: 'error', message: `💥 Execução abortada. Motivo: ${payload.data.reason}` });
                        break;

                    case 'run_completed':
                        setRunStatus('passed');
                        addLog({ type: 'success', message: `🎉 Todos os steps finalizados com perfeição!` });
                        break;

                    case 'run_cancelled':
                        setRunStatus('cancelled');
                        addLog({ type: 'warning', message: `⏸ Execução cancelada pelo usuário no step ${payload.data.step_aborted}.` });
                        break;

                    case 'screenshot_updated':
                        // Usually we'd preload it, but for B64 encoded strings it displays instantly anyway.
                        if (payload.data.url.startsWith('http') || payload.data.url.startsWith('data:')) {
                            setScreenshotUrl(payload.data.url);
                        }
                        break;

                    case 'bug_report_generating':
                        addLog({ type: 'info', message: `🤖 ${payload.data.message}` });
                        break;

                    case 'bug_report_ready':
                        setBugReport({
                            pdf_url: payload.data.pdf_url,
                            title: payload.data.title,
                            severity: payload.data.severity
                        });
                        addLog({ type: 'success', message: `📄 Bug Report PDF gerado: ${payload.data.title}` });
                        break;
                }
            } catch (err) {
                console.error('Failed to parse WS message', err);
            }
        };

        ws.onclose = () => {
            addLog({ type: 'warning', message: 'Conexão com o Engine perdida' });
        };

        return () => {
            ws.close();
        };
    }, [clientId]);

    return { screenshotUrl, currentStepNum, stepStatuses, logEntries, runStatus, bugReport };
}
