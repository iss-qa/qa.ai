import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { RecordedInteraction } from '@/components/DevicePreview';
import { sessionLogger } from '@/lib/session-logger';

export interface RecordedStep {
    id: string;
    num: number;
    action: 'tap' | 'type' | 'swipe' | 'back' | 'home' | 'open_app';
    target: string;
    value: string;
    description: string;
    x: number;
    y: number;
    endX?: number;
    endY?: number;
    duration: number;
    timestamp: number;
    screenshotUrl?: string;
    elementInfo?: {
        resource_id?: string;
        text?: string;
        content_desc?: string;
        class_name?: string;
    };
    isPassword?: boolean;
}

interface RecordingState {
    isRecording: boolean;
    recordedSteps: RecordedStep[];
    startTime: number | null;
    elapsedSeconds: number;
    deviceResolution: { width: number; height: number } | null;
    showSaveModal: boolean;
    pendingTextInput: { stepId: string; text: string } | null;

    startRecording: (resolution?: { width: number; height: number }) => void;
    stopRecording: () => void;
    addInteraction: (interaction: RecordedInteraction) => RecordedStep;
    addKeyevent: (keycode: number) => void;
    addTextInput: (text: string) => void;
    updateStepDescription: (stepId: string, description: string) => void;
    updateStepElement: (stepId: string, elementInfo: RecordedStep['elementInfo']) => void;
    setElapsedSeconds: (seconds: number) => void;
    setShowSaveModal: (show: boolean) => void;
    clearRecording: () => void;
}

function getSwipeDirection(startX: number, startY: number, endX: number, endY: number): string {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'direita' : 'esquerda';
    }
    return dy > 0 ? 'baixo' : 'cima';
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
    isRecording: false,
    recordedSteps: [],
    startTime: null,
    elapsedSeconds: 0,
    deviceResolution: null,
    showSaveModal: false,
    pendingTextInput: null,

    startRecording: (resolution) => {
        sessionLogger.logRecordingStart('active-device');
        set({
            isRecording: true,
            recordedSteps: [],
            startTime: Date.now(),
            elapsedSeconds: 0,
            deviceResolution: resolution || null,
            showSaveModal: false,
            pendingTextInput: null,
        });
    },

    stopRecording: () => {
        const stepCount = get().recordedSteps.length;
        sessionLogger.logRecordingStop(stepCount);
        set({ isRecording: false, showSaveModal: true });
    },

    addInteraction: (interaction) => {
        const state = get();
        const num = state.recordedSteps.length + 1;

        let description = '';
        let action: RecordedStep['action'] = 'tap';

        if (interaction.type === 'tap') {
            action = 'tap';
            description = `Tap em (${interaction.startX}, ${interaction.startY})`;
        } else if (interaction.type === 'swipe') {
            action = 'swipe';
            const dir = getSwipeDirection(
                interaction.startX, interaction.startY,
                interaction.endX || interaction.startX,
                interaction.endY || interaction.startY
            );
            description = `Swipe para ${dir}`;
        }

        const step: RecordedStep = {
            id: uuidv4(),
            num,
            action,
            target: action === 'swipe'
                ? `${interaction.startX},${interaction.startY},${interaction.endX},${interaction.endY}`
                : `${interaction.startX},${interaction.startY}`,
            value: action === 'swipe' ? getSwipeDirection(
                interaction.startX, interaction.startY,
                interaction.endX || interaction.startX,
                interaction.endY || interaction.startY
            ) : '',
            description,
            x: interaction.startX,
            y: interaction.startY,
            endX: interaction.endX,
            endY: interaction.endY,
            duration: interaction.duration,
            timestamp: interaction.timestamp,
        };

        set({ recordedSteps: [...state.recordedSteps, step] });
        return step;
    },

    addKeyevent: (keycode) => {
        const state = get();
        if (!state.isRecording) return;

        const num = state.recordedSteps.length + 1;
        let action: RecordedStep['action'] = 'back';
        let description = '';

        if (keycode === 4) {
            action = 'back';
            description = 'Botao Voltar';
        } else if (keycode === 3) {
            action = 'home';
            description = 'Botao Home';
        } else {
            description = `Keyevent ${keycode}`;
        }

        const step: RecordedStep = {
            id: uuidv4(),
            num,
            action,
            target: '',
            value: String(keycode),
            description,
            x: 0,
            y: 0,
            duration: 0,
            timestamp: Date.now(),
        };

        set({ recordedSteps: [...state.recordedSteps, step] });
    },

    addTextInput: (text) => {
        const state = get();
        if (!state.isRecording) return;

        const steps = [...state.recordedSteps];
        // Check if last step was a tap on an input field — merge text with it
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.action === 'tap') {
            // Add a new type step after the tap
            const num = steps.length + 1;
            const isPassword = lastStep.elementInfo?.class_name?.includes('password') ||
                lastStep.elementInfo?.resource_id?.toLowerCase().includes('password') ||
                lastStep.elementInfo?.resource_id?.toLowerCase().includes('senha');

            const step: RecordedStep = {
                id: uuidv4(),
                num,
                action: 'type',
                target: lastStep.target,
                value: text,
                description: isPassword ? `Digitou "${'*'.repeat(text.length)}"` : `Digitou "${text}"`,
                x: lastStep.x,
                y: lastStep.y,
                duration: 0,
                timestamp: Date.now(),
                isPassword,
            };
            set({ recordedSteps: [...steps, step] });
        }
    },

    updateStepDescription: (stepId, description) => {
        set(state => ({
            recordedSteps: state.recordedSteps.map(s =>
                s.id === stepId ? { ...s, description } : s
            ),
        }));
    },

    updateStepElement: (stepId, elementInfo) => {
        set(state => ({
            recordedSteps: state.recordedSteps.map(s => {
                if (s.id !== stepId) return s;
                let description = s.description;
                if (elementInfo) {
                    if (elementInfo.text) {
                        description = s.action === 'tap'
                            ? `Tap — "${elementInfo.text}" (${s.x}, ${s.y})`
                            : description;
                    } else if (elementInfo.content_desc) {
                        description = s.action === 'tap'
                            ? `Tap — ${elementInfo.content_desc} (${s.x}, ${s.y})`
                            : description;
                    } else if (elementInfo.resource_id) {
                        description = s.action === 'tap'
                            ? `Tap — ${elementInfo.resource_id.split('/').pop()} (${s.x}, ${s.y})`
                            : description;
                    }
                }
                return { ...s, elementInfo, description };
            }),
        }));
    },

    setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),
    setShowSaveModal: (show) => set({ showSaveModal: show }),

    clearRecording: () => set({
        isRecording: false,
        recordedSteps: [],
        startTime: null,
        elapsedSeconds: 0,
        showSaveModal: false,
        pendingTextInput: null,
    }),
}));
