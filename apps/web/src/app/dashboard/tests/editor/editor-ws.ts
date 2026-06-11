import { useVisionStore } from '@/store/visionStore';
import type { TestStep } from './editor-types';

/**
 * Handle a single WebSocket message from the legacy /ws/front-{runId}
 * execution pipeline (UIAutomator2 / vision). Mutates editor state via the
 * passed setters and updates the vision/recording zustand stores in place.
 */
export function handleRunWsEvent(
    event: MessageEvent,
    deps: {
        stepsLength: number;
        setSteps: React.Dispatch<React.SetStateAction<TestStep[]>>;
        setIsExecuting: (v: boolean) => void;
        setShowExecutionOverlay: (v: boolean) => void;
        executionTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    },
): void {
    const { stepsLength, setSteps, setIsExecuting, setShowExecutionOverlay, executionTimeoutRef } = deps;
    try {
        const data = JSON.parse(event.data);
        console.log("WS Event Received:", data.type, data.data || data);

        if (data.type === 'run_started') {
            setIsExecuting(true);
        } else if (data.type === 'step_started') {
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'running' } : s));
        } else if (data.type === 'step_completed') {
            // Dismiss overlay when first step completes (app launched)
            setShowExecutionOverlay(false);
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'success' } : s));
        } else if (data.type === 'step_failed') {
            setShowExecutionOverlay(false);
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? {
                ...s,
                status: 'error',
                error_message: data.data.error_message || data.data.message,
                strategies_log: data.data.strategies_log,
                suggestion: data.data.suggestion || data.data.debug_hint
            } : s));
        } else if (data.type === 'step_analyzing') {
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'analyzing' } : s));
            useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: stepsLength, description: 'Analisando tela...' });
        } else if (data.type === 'step_located') {
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'located' } : s));
            useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: stepsLength, description: `Elemento localizado (${Math.round((data.data.confidence || 0) * 100)}%)` });
        } else if (data.type === 'step_confirming') {
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'confirming' } : s));
            useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: stepsLength, description: 'Confirmando resultado...' });
        } else if (data.type === 'step_fallback') {
            setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'fallback' } : s));
            useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: stepsLength, description: 'Fallback XML...' });
        } else if (data.type === 'step_recorded') {
            // Intentionally a no-op. The daemon broadcasts every recorded step
            // on BOTH channels: this legacy run-WS (`STEP_RECORDED`) and the
            // dedicated recording SSE stream (/recordings/events). The SSE path
            // (handleSseStep → addStepFromDaemon) is the single source of truth
            // for recording steps. Re-adding auto `assertVisible` here used to
            // duplicate every screen-change assert (one "auto" copy from here +
            // one "auto scan" copy from SSE) AND desynced the frontend step
            // list from the daemon's index, breaking confirm-input resolution.
        } else if (data.type === 'ambiguity_detected') {
            useVisionStore.getState().setAmbiguityEvent({
                stepNum: data.data.step_num,
                screenshotBase64: data.data.screenshot,
                candidates: data.data.candidates,
                reason: data.data.reason,
            });
        } else if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_cancelled') {
            if (executionTimeoutRef.current) {
                clearTimeout(executionTimeoutRef.current);
                executionTimeoutRef.current = null;
            }
            setIsExecuting(false);
            setShowExecutionOverlay(false);
            useVisionStore.getState().setExecutionProgress(null);
        }
    } catch (error) {
        console.error('WS parse error', error);
    }
}
