'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSearchParams } from 'next/navigation';
import { DAEMON_URL } from '@/lib/constants';
import { useDeviceStore } from '@/store/deviceStore';
import { useVisionStore } from '@/store/visionStore';
import { useRecordingStore, type DaemonStep } from '@/store/recordingStore';
import { ConnectDeviceModal } from '@/components/ConnectDeviceModal';
import { type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import { ExecutionToast } from '@/components/ExecutionToast';
import { AmbiguityDialog } from '@/components/AmbiguityDialog';
import { SaveRecordingModal } from '@/components/SaveRecordingModal';
import { ExecutionOverlay } from '@/components/ExecutionOverlay';
import { supabase } from '@/lib/supabase';
import { testYamlFileName, writeYamlToWorkspace } from '@/lib/workspace';
import type { TestStep, ConfidenceReport, RecorderConfigState, ExecutionErrorState } from './editor-types';
import { MOCK_MAESTRO_STEPS, MOCK_MAESTRO_YAML, MOCK_U2_STEPS, recordedStepsToMaestroYaml, normalizeMaestroCommand } from './editor-utils';
import { persistRunResult, saveTestCase } from './editor-persistence';
import { handleRunWsEvent } from './editor-ws';
import { RecordingStepsList } from './_components/RecordingStepsList';
import { ExecutionErrorBanner } from './_components/ExecutionErrorBanner';
import { RecorderConfigModal } from './_components/RecorderConfigModal';
import { PendingInputModal } from './_components/PendingInputModal';
import { EnvVarsModal } from './_components/EnvVarsModal';
import { StepTemplatesModal } from './_components/StepTemplatesModal';
import { MaestroStudioDialog } from './_components/MaestroStudioDialog';
import { PromptExamplesDialog } from './_components/PromptExamplesDialog';
import { SaveTestDialog } from './_components/SaveTestDialog';
import { DevicePreviewPanel } from './_components/DevicePreviewPanel';
import { PromptInputPanel } from './_components/PromptInputPanel';
import { AddStepButtons, ConfidenceReportCard } from './_components/StepsPanelExtras';
import { AiFeedbackPanel } from './_components/AiFeedbackPanel';
import { StepsList } from './_components/StepsList';
import { EditorHeader } from './_components/EditorHeader';
import { ExportResultModal } from './_components/ExportResultModal';

export default function TestEditorPage() {
    const searchParams = useSearchParams();
    const currentProjectId = searchParams.get('projectId');
    const testIdParam = searchParams.get('testId');
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editingData, setEditingData] = useState<Partial<TestStep>>({});
    const [aiFeedbackText, setAiFeedbackText] = useState('');
    const { connectedDevice, setConnectedDevice } = useDeviceStore();
    const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
    const [selectedEngine, setSelectedEngine] = useState<'uiautomator2' | 'maestro'>('uiautomator2');
    const [maestroYaml, setMaestroYaml] = useState<string>('');
    const [maestroYamlPath, setMaestroYamlPath] = useState<string>('');
    // appId of the app under test, loaded from test_cases.app_id. Used when
    // building the YAML for Executar Teste so the correct app launches. Was
    // hardcoded to 'br.com.foxbit.foxbitandroid' which made every test open
    // the Foxbit app regardless of project.
    const [testAppId, setTestAppId] = useState<string | null>(null);
    const [envVarsNeeded, setEnvVarsNeeded] = useState<string[]>([]);
    const [confidenceReport, setConfidenceReport] = useState<ConfidenceReport | null>(null);
    const [envVarsValues, setEnvVarsValues] = useState<Record<string, string>>({});
    const [showEnvVarsModal, setShowEnvVarsModal] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [showMaestroStudioDialog, setShowMaestroStudioDialog] = useState(false);
    const [showPromptExamples, setShowPromptExamples] = useState(false);
    const [showStepTemplates, setShowStepTemplates] = useState(false);
    const [maestroStudioLaunching, setMaestroStudioLaunching] = useState(false);
    const [showExecutionOverlay, setShowExecutionOverlay] = useState(false);
    const [testName, setTestName] = useState('');
    const [showExportModal, setShowExportModal] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Confirmação não-bloqueante do save direto (teste já nomeado → sem modal).
    const [saveToast, setSaveToast] = useState<string | null>(null);
    const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flashSaveToast = (msg: string) => {
        setSaveToast(msg);
        if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
        saveToastTimer.current = setTimeout(() => setSaveToast(null), 2500);
    };
    const devicePreviewRef = useRef<DevicePreviewHandle>(null);
    const executionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Persistent error banner for Executar Teste failures. Without this the
    // SSE-reported error went only to console.error — user would just see
    // the steps stay grey and have no idea why.
    const [executionError, setExecutionError] = useState<ExecutionErrorState | null>(null);

    // Fetch project name when projectId is available
    useEffect(() => {
        if (!currentProjectId) return;
        supabase.from('projects').select('name').eq('id', currentProjectId).single()
            .then(({ data }) => { if (data) setProjectName(data.name); });
    }, [currentProjectId]);

    // Auto-connect device if one is available and none connected
    useEffect(() => {
        if (connectedDevice) return;
        fetch(`${DAEMON_URL}/devices`)
            .then(r => r.json())
            .then(data => {
                const devices = data.devices || [];
                if (devices.length > 0 && !connectedDevice) {
                    const d = devices[0];
                    setConnectedDevice({
                        udid: d.udid,
                        model: d.model || d.udid,
                        os_version: d.os_version || '',
                        status: 'online',
                    });
                }
            })
            .catch(() => {});
    }, []);

    // Load existing test when testId is in URL
    useEffect(() => {
        if (!testIdParam) return;
        // Always reset state when switching tests so a stale appId from the
        // previous test doesn't leak into the next Executar Teste.
        setTestAppId(null);
        supabase.from('test_cases').select('*').eq('id', testIdParam).single()
            .then(({ data, error }) => {
                if (error || !data) return;
                setTestName(data.name || '');
                setTestAppId(data.app_id || null);
                const loadedSteps = ((data.steps || []) as Partial<TestStep>[]).map((s, idx) => ({
                    id: s.id || String(idx + 1),
                    action: s.action || '',
                    target: s.target || '',
                    value: s.value || '',
                    status: 'idle',
                    engine: s.engine as 'uiautomator2' | 'maestro' | undefined,
                    maestro_command: s.maestro_command || '',
                }));
                setSteps(loadedSteps);
                // Set engine from first step
                if (loadedSteps[0]?.engine) {
                    setSelectedEngine(loadedSteps[0].engine);
                }
                // Generate run ID for WebSocket
                setRunId(`run-${Date.now()}`);
            });
    }, [testIdParam]);

    // Recording state
    const {
        isRecording: isRecordingActive,
        recordedSteps,
        startTime: recordingStartTime,
        elapsedSeconds,
        showSaveModal,
        startRecording: startRecordingStore,
        stopRecording: stopRecordingStore,
        addStepFromDaemon,
        resolvePendingInput,
        retractLastHideKeyboard,
        addLaunchAppStep,
        reorderSteps,
        removeStep: removeRecordedStep,
        setElapsedSeconds,
        setShowSaveModal,
        clearRecording,
    } = useRecordingStore();

    const handleRecordingDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const fromIdx = recordedSteps.findIndex(s => s.id === active.id);
        const toIdx = recordedSteps.findIndex(s => s.id === over.id);
        if (fromIdx < 0 || toIdx < 0) return;
        reorderSteps(fromIdx, toIdx);
    };

    // Pre-recording config modal: replaces the old "start immediately" flow
    // so each recording carries its own appId (instead of hardcoded foxbit)
    // and gets a launchApp step prepended automatically. Layout mirrors the
    // Maestro Studio "Choose a template" pattern (tabs, name with .yaml
    // suffix, App ID combobox, tags).
    const [recorderConfig, setRecorderConfig] = useState<RecorderConfigState>({ open: false, testName: '', appId: '', clearState: true, tags: '', showAppIdMenu: false });
    // appId persisted across the recording lifecycle (start→stop→save).
    const [recordingAppId, setRecordingAppId] = useState<string>('');
    // tags applied to test_cases when this recording is saved (in addition
    // to the defaults ['recorded', 'maestro']). Captured here when the modal
    // confirms so the save flow can read them at the end.
    const [recordingTags, setRecordingTags] = useState<string[]>([]);
    // App ID suggestions sourced from this project's existing tests so the
    // user can pick instead of typing the package name from memory.
    const [appIdSuggestions, setAppIdSuggestions] = useState<string[]>([]);

    // Refresh App ID suggestions whenever the project context changes — keeps
    // the dropdown scoped to this project's apps (not a global recently-used).
    useEffect(() => {
        if (!currentProjectId) { setAppIdSuggestions([]); return; }
        supabase
            .from('test_cases')
            .select('app_id')
            .eq('project_id', currentProjectId)
            .not('app_id', 'is', null)
            .then(({ data }) => {
                const unique = Array.from(new Set(
                    (data || [])
                        .map((r: { app_id: string | null }) => (r.app_id || '').trim())
                        .filter(Boolean)
                ));
                setAppIdSuggestions(unique);
            });
    }, [currentProjectId]);

    // SSE state for recording
    const recordingEsRef = useRef<EventSource | null>(null);
    const recordingUdidRef = useRef<string>('');

    // Pending inputText modal state
    const [pendingInputModal, setPendingInputModal] = useState<{
        visible: boolean;
        stepIndex: number;
        stepId?: string;
    }>({ visible: false, stepIndex: -1 });
    const [pendingInputText, setPendingInputText] = useState('');

    // Recording timer
    useEffect(() => {
        if (!isRecordingActive || !recordingStartTime) return;
        const interval = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - recordingStartTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [isRecordingActive, recordingStartTime, setElapsedSeconds]);

    // Cleanup SSE on unmount
    useEffect(() => {
        return () => {
            if (recordingEsRef.current) {
                recordingEsRef.current.close();
                recordingEsRef.current = null;
            }
        };
    }, []);

    // SSE step handler
    const handleSseStep = useCallback((data: DaemonStep) => {
        if (data.removed) {
            // Daemon retraiu o hideKeyboard provisório — a sequência de
            // inputs continua (o usuário tocou em outro campo de texto).
            retractLastHideKeyboard();
            return;
        }
        if (data.updated) {
            // The daemon echoes a confirmed inputText back as an `updated` event
            // keyed by ITS array index. We can't trust that index on the
            // frontend (the list has a leading launchApp step the daemon doesn't
            // track, plus possible reordering), so resolution is applied locally
            // by step id in handleConfirmInput instead. Ignore the echo.
            return;
        }
        const step = addStepFromDaemon(data);
        if (step && data.is_pending) {
            setPendingInputModal({ visible: true, stepIndex: data.step_index ?? 0, stepId: step.id });
            setPendingInputText('');
        }
    }, [addStepFromDaemon, retractLastHideKeyboard]);

    // DevicePreview interaction — scrcpy sends touch to device, we also notify daemon
    // so it can do u2 dump at those coords and broadcast the step via SSE.
    const handleRecordingInteraction = useCallback(async (interaction: RecordedInteraction) => {
        if (!isRecordingActive || !connectedDevice) return;
        if (interaction.type === 'swipe') {
            // Swipes detected from getevent OR handled by daemon when stream notified
            // For now add swipe step locally (daemon SSE would duplicate if from getevent)
            addStepFromDaemon({
                action: 'swipe',
                direction: (() => {
                    const dx = (interaction.endX || interaction.startX) - interaction.startX;
                    const dy = (interaction.endY || interaction.startY) - interaction.startY;
                    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
                    return dy > 0 ? 'DOWN' : 'UP';
                })(),
                maestro_command: undefined,
            });
            return;
        }
        // For taps: notify daemon with stream coordinates (daemon scales and identifies)
        try {
            const dims = devicePreviewRef.current?.getDeviceDimensions?.() || { width: 1080, height: 2400 };
            await fetch(`${DAEMON_URL}/recordings/enrich-and-record`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    udid: connectedDevice.udid,
                    x: interaction.startX,
                    y: interaction.startY,
                    action: interaction.type,
                    stream_width: dims.width,
                    stream_height: dims.height,
                    project_id: currentProjectId || undefined,
                }),
            });
            // Step will arrive via SSE — no need to add locally
        } catch (e) {
            console.error('enrich-and-record failed:', e);
        }
    }, [isRecordingActive, connectedDevice, addStepFromDaemon]);

    const handleRecordingTextInput = useCallback(() => {
        // no-op: text captured via confirm-input modal after EditText tap
    }, []);

    // Open the "New Recording" config modal. The actual daemon start happens
    // in confirmStartRecording (only after the user fills in appId + name).
    const handleStartRecording = () => {
        if (!connectedDevice) {
            alert('Conecte um dispositivo primeiro!');
            return;
        }
        // Pre-fill: appId from the test loaded into the editor (testAppId) or
        // empty so the user explicitly provides one for a fresh recording.
        // If we have suggestions and no testAppId, pre-pick the first one.
        const defaultAppId = testAppId || (appIdSuggestions[0] || '');
        setRecorderConfig({
            open: true,
            testName: testName || 'Novo Teste',
            appId: defaultAppId,
            clearState: true,
            tags: '',
            showAppIdMenu: false,
        });
    };

    const confirmStartRecording = async () => {
        if (!connectedDevice) return;
        const cfg = recorderConfig;
        const appId = cfg.appId.trim();
        if (!appId) {
            alert('Informe o App ID (ex: com.miui.calculator).');
            return;
        }

        // Persist appId + tags for later YAML serialization (stop + save).
        setRecordingAppId(appId);
        setRecordingTags(
            cfg.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)
        );
        setTestName(cfg.testName.trim() || 'Novo Teste');
        setRecorderConfig(prev => ({ ...prev, open: false }));

        // Initialize the store fresh and seed it with the launchApp step
        // BEFORE the daemon SSE starts streaming user interactions.
        startRecordingStore(undefined, testIdParam || undefined);
        addLaunchAppStep(appId, cfg.clearState);

        setSelectedEngine('maestro');
        setRunId(`rec-${Date.now()}`);
        recordingUdidRef.current = connectedDevice.udid;

        try {
            const res = await fetch(`${DAEMON_URL}/recordings/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    udid: connectedDevice.udid,
                    project_id: currentProjectId || undefined,
                    // Tell the daemon to launch the app before getevent
                    // starts so the first captured taps are on the app's
                    // initial screen — not on whatever was open when the
                    // user clicked Gravar.
                    app_id: appId,
                    clear_state: cfg.clearState,
                }),
            });
            if (!res.ok) throw new Error(`status ${res.status}`);

            // Open SSE stream for real-time step updates
            const es = new EventSource(
                `${DAEMON_URL}/recordings/events?udid=${encodeURIComponent(connectedDevice.udid)}`
            );
            es.addEventListener('step', (e) => {
                try {
                    handleSseStep(JSON.parse((e as MessageEvent).data));
                } catch { /* ignore parse errors */ }
            });
            es.addEventListener('done', () => {
                es.close();
                recordingEsRef.current = null;
            });
            es.onerror = () => {
                // SSE will reconnect automatically; log silently
            };
            recordingEsRef.current = es;
        } catch (e) {
            console.error('Failed to start recording on daemon:', e);
        }
    };

    const handleStopRecording = async () => {
        stopRecordingStore();

        // Close SSE
        if (recordingEsRef.current) {
            recordingEsRef.current.close();
            recordingEsRef.current = null;
        }

        if (connectedDevice) {
            try {
                await fetch(`${DAEMON_URL}/recordings/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ udid: connectedDevice.udid }),
                });
            } catch (e) {
                console.error('Failed to stop recording on daemon:', e);
            }
        }

        if (recordedSteps.length > 0) {
            // Use the appId chosen at the start of this recording; fall back
            // to the appId loaded with the editing test, then to empty (still
            // generates valid YAML even with no appId so the user can fix it
            // manually before saving).
            const appId = recordingAppId || testAppId || '';
            const yaml = recordedStepsToMaestroYaml(appId, recordedSteps);
            setMaestroYaml(yaml);
        }
    };

    const handleConfirmInput = async () => {
        const { stepIndex, stepId } = pendingInputModal;
        const text = pendingInputText.trim();
        setPendingInputModal({ visible: false, stepIndex: -1 });
        setPendingInputText('');
        if (!text || !connectedDevice) return;
        // Resolve the step locally by its stable id (robust against index drift
        // between the daemon's step array and the frontend's). The POST below
        // still sends the daemon's index so it can type the text on the device.
        if (stepId) resolvePendingInput(stepId, text);
        try {
            await fetch(`${DAEMON_URL}/recordings/confirm-input`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    udid: connectedDevice.udid,
                    step_index: stepIndex,
                    text,
                }),
            });
        } catch (e) {
            console.error('Failed to confirm input:', e);
        }
    };

    const handleSaveRecording = async (testName: string, projectId: string, yamlContent?: string, workspacePath?: string | null) => {
        // Generate Maestro YAML from recorded steps — appId from the config
        // modal (recordingAppId) takes precedence over the editor's loaded
        // appId (testAppId). Hardcoded foxbit removed.
        const appId = recordingAppId || testAppId || '';
        const generatedYaml = yamlContent || recordedStepsToMaestroYaml(appId, recordedSteps);

        // Save YAML to backend. Falha aqui ABORTA o save (lança para o modal
        // alertar e manter aberto) — antes era só console.error e o usuário
        // ficava sem saber por que "não respondeu".
        let saveRes: Response;
        try {
            saveRes = await fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yaml_content: generatedYaml,
                    project_id: projectId || 'default',
                    test_name: testName,
                }),
            });
        } catch {
            throw new Error(`Daemon offline em ${DAEMON_URL} — não foi possível salvar o YAML.`);
        }
        const saveData = await saveRes.json().catch(() => ({} as { detail?: string; path?: string }));
        if (!saveRes.ok) {
            throw new Error(saveData.detail || `YAML rejeitado pelo daemon (HTTP ${saveRes.status}).`);
        }
        if (saveData.path) {
            setMaestroYamlPath(saveData.path);
            setMaestroYaml(generatedYaml);
        }

        // Convert recorded steps to TestStep format for editor
        const newSteps: TestStep[] = recordedSteps.map((rs) => ({
            id: rs.id,
            action: rs.action,
            target: rs.elementId || rs.description,
            value: rs.value || '',
            status: 'idle',
            engine: 'maestro' as const,
            maestro_command: rs.maestro_command || '',
        }));

        // Persist to backend
        const stepsForDb = recordedSteps.map((rs, idx) => ({
            id: rs.id,
            num: idx + 1,
            action: rs.action,
            elementId: rs.elementId || '',
            target: rs.elementId || rs.description || '',
            value: rs.value || '',
            description: rs.description || '',
            engine: 'maestro',
            maestro_command: rs.maestro_command || '',
        }));

        try {
            // Merge tags from the config modal with the always-on tags.
            // Dedup so the user typing "recorded" doesn't double-add.
            const mergedTags = Array.from(new Set([
                'recorded',
                'maestro',
                ...recordingTags,
            ]));
            const savePayload: Record<string, unknown> = {
                name: testName,
                description: `Teste gravado com ${recordedSteps.length} passos (Maestro)`,
                steps: stepsForDb,
                tags: mergedTags,
                app_id: appId || null,           // forwarded if the daemon supports it
                raw_yaml: generatedYaml || null, // preserves the exact YAML for Studio reopen
            };
            if (projectId && projectId !== 'default') {
                savePayload.project_id = projectId;
            }

            const res = await fetch(`${DAEMON_URL}/api/tests/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(savePayload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(errData.detail || res.statusText);
            }

            // Defensive Supabase sync: the daemon save endpoint may ignore
            // unknown columns. We re-write app_id + raw_yaml directly so the
            // editor reopen and the Studio reopen both pick up the right
            // values regardless of the daemon's payload schema.
            if (appId && projectId && projectId !== 'default') {
                try {
                    const { data: rows } = await supabase
                        .from('test_cases')
                        .select('id')
                        .eq('project_id', projectId)
                        .eq('name', testName)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    const row = (rows || [])[0];
                    if (row) {
                        await supabase.from('test_cases').update({
                            app_id: appId,
                            raw_yaml: generatedYaml || null,
                        }).eq('id', row.id);
                    }
                } catch (e) {
                    console.warn('Supabase app_id/raw_yaml backfill failed:', e);
                }
            }
        } catch (e) {
            // Propaga para o modal (alerta + mantém aberto para retry).
            throw e instanceof Error ? e : new Error('Erro ao salvar teste. Verifique se o daemon está rodando.');
        }

        // Grava o YAML no workspace do projeto (mesma pasta que o Maestro
        // Studio usa) e persiste o workspace escolhido no projeto, para que
        // o botão "Studio" da lista de testes abra direto sem erro.
        if (workspacePath && generatedYaml) {
            const writeRes = await writeYamlToWorkspace(workspacePath, testYamlFileName(testName), generatedYaml);
            if (!writeRes.success) {
                console.error('Failed to write YAML to workspace:', writeRes);
                alert(`O teste foi salvo, mas não foi possível gravar o YAML no workspace (${workspacePath}): ${writeRes.error || 'erro desconhecido'}`);
            }
            if (projectId && projectId !== 'default') {
                try {
                    await supabase.from('projects')
                        .update({ workspace_path: workspacePath })
                        .eq('id', projectId);
                } catch (e) {
                    console.warn('workspace_path persist failed:', e);
                }
            }
        }

        setSteps(newSteps);
        // Propagate the appId from the recording session so the Executar
        // Teste flow (which reads testAppId, not recordingAppId) finds it
        // immediately after a save without requiring a page reload.
        if (appId) setTestAppId(appId);
        const newRunId = `run-rec-${Date.now()}`;
        setRunId(newRunId);
        setShowSaveModal(false);
        clearRecording();
    };

    const handleSaveTest = async (name: string) => {
        const trimmed = name.trim();
        if (!trimmed || steps.length === 0) return;
        setIsSaving(true);
        try {
            await saveTestCase({
                trimmedName: trimmed,
                steps,
                selectedEngine,
                currentProjectId,
                testAppId,
                testIdParam,
            });
            setTestName(trimmed);
            setShowSaveDialog(false);
            flashSaveToast(`Teste "${trimmed}" salvo ✓`);
        } catch (e: unknown) {
            console.error('Save failed:', e);
            const message = e instanceof Error ? e.message : String(e);
            alert('Erro ao salvar teste: ' + message);
        } finally {
            setIsSaving(false);
        }
    };

    const [steps, setSteps] = useState<TestStep[]>([]);
    
    // Setup Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setSteps((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleDuplicate = (step: TestStep) => {
        const idx = steps.findIndex(s => s.id === step.id);
        const newStep: TestStep = { ...step, id: `step-${Date.now()}`, status: 'idle', strategies_log: undefined, error_message: undefined, suggestion: undefined };
        const newSteps = [...steps];
        newSteps.splice(idx + 1, 0, newStep);
        setSteps(newSteps);
    };

    const handleCopy = (step: TestStep) => {
        const stepJSON = JSON.stringify(step, null, 2);
        navigator.clipboard.writeText(stepJSON);
        // Optional: show a quick toast
    };
    const [runId, setRunId] = useState<string | null>(null);

    useEffect(() => {
        if (!runId) return;
        const ws = new WebSocket(`${DAEMON_URL.replace('http', 'ws')}/ws/front-${runId}`);
        ws.onopen = () => {
            console.log('WS Connected for run', runId, 'URL:', `ws://localhost:8000/ws/front-${runId}`);
        };
        ws.onerror = (error) => {
            console.error('WS Error for run:', runId, error);
            setIsExecuting(false);
        };
        ws.onclose = (event) => {
            console.log('WS Closed for run', runId, 'Code:', event.code, 'Reason:', event.reason);
        };

        ws.onmessage = (event) => {
            handleRunWsEvent(event, {
                stepsLength: steps.length,
                setSteps,
                setIsExecuting,
                setShowExecutionOverlay,
                executionTimeoutRef,
            });
        };
        return () => ws.close();
    }, [runId]);

    const handleGenerate = async () => {
        if (!prompt.trim() || !connectedDevice) {
            if (!connectedDevice) alert('Por favor, conecte um dispositivo primeiro!');
            return;
        }

        setIsGenerating(true);
        setSteps([]);
        setAiFeedbackText('');
        try {
            // Convert reference images to base64 for vision analysis
            const { referenceImages: refImgs } = useVisionStore.getState();
            let imagesPayload: { data: string; media_type: string; label: string }[] | undefined;

            if (refImgs.length > 0) {
                setAiFeedbackText('Analisando imagens de referencia...\n');
                const imagePromises = refImgs.map(async (img) => {
                    const blob = img.jpegBlob || img.file;
                    const arrayBuffer = await blob.arrayBuffer();
                    const base64 = btoa(
                        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    return {
                        data: base64,
                        media_type: 'image/jpeg',
                        label: img.file.name.replace(/\.[^.]+$/, ''),
                    };
                });
                imagesPayload = await Promise.all(imagePromises);
                setAiFeedbackText(`${refImgs.length} imagem(ns) carregada(s). Gerando passos com analise visual...\n`);
            }

            const response = await fetch(`${DAEMON_URL}/api/tests/parse-prompt-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    platform: 'android',
                    project_id: currentProjectId || 'default',
                    model: selectedModel,
                    engine: selectedEngine,
                    device_udid: connectedDevice?.udid || undefined,
                    images: imagesPayload,
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("API Error Response:", errText);
                throw new Error(`Parse error: HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                let buffer = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let boundary = buffer.indexOf('\n\n');
                    while (boundary !== -1) {
                        const chunkStr = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);

                        if (chunkStr.startsWith('data: ')) {
                            try {
                                const dataStr = chunkStr.substring(6);
                                if (!dataStr.trim()) continue;
                                const data = JSON.parse(dataStr);

                                if (data.type === 'chunk') {
                                    setAiFeedbackText(prev => prev + data.text);
                                } else if (data.type === 'result') {
                                    console.log("AI Parsed Data:", data);

                                    if (data.engine === 'maestro') {
                                        // Maestro: steps come with description + maestro_command + confidence
                                        const newSteps = (data.steps as Array<{
                                            action?: string;
                                            maestro_command?: string;
                                            description?: string;
                                            confidence?: 'high' | 'low' | 'unresolved';
                                            confidence_comment?: string;
                                        }>).map((s, idx: number) => ({
                                            id: String(idx + 1),
                                            action: s.action || s.maestro_command || '',
                                            target: s.description || '',
                                            value: '',
                                            status: 'idle',
                                            engine: 'maestro' as const,
                                            maestro_command: s.maestro_command || '',
                                            confidence: s.confidence || 'high',
                                            confidence_comment: s.confidence_comment || '',
                                        }));
                                        setSteps(newSteps);
                                        setMaestroYaml(data.yaml_flow || '');
                                        setEnvVarsNeeded(data.env_vars_needed || []);
                                        setConfidenceReport(data.confidence_report || null);

                                        // Save YAML to backend
                                        if (data.yaml_flow) {
                                            fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    yaml_content: data.yaml_flow,
                                                    project_id: currentProjectId || 'default',
                                                    test_name: data.test_name || 'maestro_test',
                                                }),
                                            })
                                                .then(r => r.json())
                                                .then(res => {
                                                    if (res.path) setMaestroYamlPath(res.path);
                                                })
                                                .catch(e => console.error('Failed to save YAML:', e));
                                        }
                                    } else {
                                        const newSteps = (data.steps as Array<{
                                            action: string;
                                            target?: string;
                                            value?: string;
                                        }>).map((s, idx: number) => ({
                                            id: String(idx + 1),
                                            action: s.action,
                                            target: s.target || '',
                                            value: s.value || '',
                                            status: 'idle',
                                            engine: selectedEngine,
                                        }));
                                        setSteps(newSteps);
                                    }

                                    setPrompt('');
                                    const newRunId = `run-${Date.now()}`;
                                    setRunId(newRunId);
                                } else if (data.type === 'error') {
                                    console.error("AI returned error:", data.message);
                                    alert('Erro retornado pela IA: ' + data.message);
                                }
                            } catch (e) {
                                console.error("Failed to parse SSE chunk", e);
                            }
                        }
                        boundary = buffer.indexOf('\n\n');
                    }
                }
            }

        } catch (error) {
            console.error("handleGenerate failed:", error);
            alert('Falha ao gerar o teste com IA.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMockGenerate = () => {
        if (selectedEngine === 'maestro') {
            setSteps(MOCK_MAESTRO_STEPS);

            const yamlContent = MOCK_MAESTRO_YAML;
            setMaestroYaml(yamlContent);
            fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yaml_content: yamlContent,
                    project_id: currentProjectId || 'default',
                    test_name: 'mock_login_foxbit',
                }),
            })
                .then(r => r.json())
                .then(res => { if (res.path) setMaestroYamlPath(res.path); })
                .catch(e => console.error('Failed to save mock YAML:', e));
        } else {
            setSteps(MOCK_U2_STEPS);
        }

        const newRunId = `run-mock-${Date.now()}`;
        setRunId(newRunId);
    };

    // Execute a saved Maestro YAML via the Maestro Studio Server pipeline —
    // the same SSE-driven flow the MSS embed uses for its Run Test button.
    // Avoids the /api/runs WebSocket race condition that was leaving the
    // EXECUTAR TESTE button stuck in EXECUTANDO state.
    //
    // Step status updates arrive via SSE `commandStatuses`, mapped by index
    // (each step's `maestro_command` corresponds 1:1 to a YAML command).
    const executeViaMaestroStudio = useCallback(async (yamlPath: string, env: Record<string, string>) => {
        if (!yamlPath) {
            setIsExecuting(false);
            alert('YAML não foi salvo antes da execução.');
            return;
        }
        if (!connectedDevice) return;

        const mapStatus = (s: string): TestStep['status'] => {
            switch (s) {
                case 'RUNNING':   return 'running';
                case 'COMPLETED': return 'success';
                case 'FAILED':    return 'error';
                case 'WARNED':    return 'success';
                case 'SKIPPED':   return 'idle';
                default:          return 'idle';
            }
        };

        const flowId = `flow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const sseUrl = `${DAEMON_URL}/mss/api/devices/flowStatus/sse`
            + `?flowId=${encodeURIComponent(flowId)}`
            + `&filepath=${encodeURIComponent(yamlPath)}`;

        let finished = false;
        const runStartedAt = new Date();

        const finish = (passed: boolean) => {
            if (finished) return;
            finished = true;
            if (executionTimeoutRef.current) {
                clearTimeout(executionTimeoutRef.current);
                executionTimeoutRef.current = null;
            }
            // Step labeling on flow end:
            // - COMPLETED: all idle/running steps actually ran (Maestro sometimes
            //   doesn't emit a COMPLETED line for the last step). Mark them success.
            // - FAILED: keep idle steps as idle (gray, "skipped"). Convert any
            //   leftover 'running' step to 'error' — that's the one Maestro
            //   aborted on. Earlier 'success' entries stay green.
            let finalSteps: TestStep[] = [];
            setSteps(prev => {
                const next = prev.map(s => {
                    if (passed) {
                        if (s.status === 'idle' || s.status === 'running') {
                            return { ...s, status: 'success' };
                        }
                        return s;
                    } else {
                        if (s.status === 'running') {
                            return { ...s, status: 'error', error_message: s.error_message || 'Passo abortado' };
                        }
                        return s;  // leave idle/success/error untouched
                    }
                });
                finalSteps = next;
                return next;
            });
            setIsExecuting(false);
            setShowExecutionOverlay(false);
            try { es.close(); } catch {}
            // Fire-and-forget Supabase update — don't block the UI. Defer one
            // tick so the setSteps closure has actually run and finalSteps is
            // populated with the corrected statuses.
            setTimeout(() => persistRunResult({
                passed,
                finalSteps,
                testIdParam,
                currentProjectId,
                testName,
                deviceUdid: connectedDevice?.udid || null,
                runStartedAt,
            }), 0);
        };

        // Auto-scroll the editor's step list to follow the running step.
        // `block: 'center'` keeps the active row in the middle of the viewport
        // so the user simultaneously sees a couple of completed steps above
        // and the upcoming ones below. `nearest` would only scroll when the
        // step went off-screen — that's why the panel stayed pinned at the
        // top while steps 6+ executed out of view.
        const scrollToStep = (idx: number) => {
            if (idx < 0) return;
            const el = document.querySelector('[data-step-idx="' + idx + '"]') as HTMLElement | null;
            if (el) {
                try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch {}
            }
        };
        let lastScrolledIdx = -1;

        const es = new EventSource(sseUrl);

        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                const cs: Array<{ status: string }> = data.commandStatuses || [];

                if (cs.length > 0) {
                    setShowExecutionOverlay(false);
                    setSteps(prev => prev.map((s, i) => {
                        if (i >= cs.length) return s;
                        const next = mapStatus(cs[i].status);
                        return next === s.status ? s : { ...s, status: next };
                    }));
                    // Locate the active (last RUNNING, or first FAILED) step and scroll.
                    let activeIdx = -1;
                    for (let i = 0; i < cs.length; i++) {
                        if (cs[i].status === 'FAILED') { activeIdx = i; break; }
                    }
                    if (activeIdx === -1) {
                        for (let i = cs.length - 1; i >= 0; i--) {
                            if (cs[i].status === 'RUNNING') { activeIdx = i; break; }
                        }
                    }
                    if (activeIdx !== -1 && activeIdx !== lastScrolledIdx) {
                        lastScrolledIdx = activeIdx;
                        // Defer to next paint so the row has the new status class applied.
                        requestAnimationFrame(() => scrollToStep(activeIdx));
                    }
                }

                if (data.flowStatus === 'COMPLETED') {
                    finish(true);
                } else if (data.flowStatus === 'FAILED') {
                    const errMsg = (data.error || '').toString().trim() || 'Maestro terminou em FAILED sem mensagem (verifique o terminal do daemon).';
                    console.error('MSS flow FAILED:', errMsg);
                    console.error('YAML enviado:', yamlPath);
                    setExecutionError({ message: errMsg, yamlPath });
                    finish(false);
                }
            } catch (err) {
                console.error('MSS SSE parse error', err);
            }
        };

        es.onerror = () => {
            // Browser auto-reconnects on transient errors. Only escalate when
            // the flow already wrapped up — otherwise let the heartbeat resume.
            if (finished) try { es.close(); } catch {}
        };

        // Give the SSE handler a moment to connect and send the initial
        // RUNNING heartbeat — otherwise the bundle's `Flow not found` poll
        // window can elapse before the POST registers the flow.
        await new Promise(resolve => setTimeout(resolve, 250));

        try {
            const res = await fetch(`${DAEMON_URL}/mss/api/devices/runFlowFile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    flowId,
                    filePath: yamlPath,
                    workspacePath: '',
                    instanceId: connectedDevice.udid,
                    env: env || {},
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                console.error('runFlowFile failed', res.status, text);
                alert(`Falha ao iniciar a execução: ${res.status}`);
                finish(false);
            }
        } catch (e) {
            console.error('runFlowFile network error', e);
            alert('Erro de rede ao iniciar a execução.');
            finish(false);
        }
    }, [connectedDevice, testIdParam]);

    const handleExecuteTest = async () => {
        if (!connectedDevice) {
            alert('Conecte um dispositivo primeiro.');
            return;
        }

        // Resolve which steps to execute — editor steps take priority,
        // but fall back to recorded steps if the editor list is empty.
        let stepsToRun: TestStep[] = steps;
        if (stepsToRun.length === 0 && recordedSteps.length > 0) {
            stepsToRun = recordedSteps.map(rs => ({
                id: rs.id,
                action: rs.action,
                target: rs.elementId || rs.description,
                value: rs.value || '',
                status: 'idle' as const,
                engine: 'maestro' as const,
                maestro_command: rs.maestro_command || '',
            }));
            setSteps(stepsToRun);  // persist to editor so progress indicators work
        }

        if (stepsToRun.length === 0) {
            alert('Nenhum passo para executar. Grave ou adicione passos primeiro.');
            return;
        }

        const stepsEngine = stepsToRun[0]?.engine || selectedEngine;

        // Maestro: if env vars needed, show modal first
        if (stepsEngine === 'maestro' && envVarsNeeded.length > 0 && !showEnvVarsModal) {
            setShowEnvVarsModal(true);
            return;
        }

        // Generate fresh runId for this execution
        const execRunId = `run-${Date.now()}`;
        setRunId(execRunId);

        // Reset all step statuses
        setSteps(prev => prev.map(s => ({ ...s, status: 'idle' })));
        // Show the staged overlay immediately — cold-start of `maestro test`
        // is ~30s (JVM + driver APK forward). Without feedback the button
        // looks frozen. executeViaMaestroStudio hides it as soon as the first
        // commandStatuses event arrives from the SSE.
        setShowExecutionOverlay(true);
        setIsExecuting(true);

        // Small delay to let WebSocket connect before sending the request
        await new Promise(resolve => setTimeout(resolve, 200));

        const { referenceImages, imageStepMapping, autoMapImages } = useVisionStore.getState();

        // Auto-map images if they exist and mapping is empty
        if (referenceImages.length > 0 && Object.keys(imageStepMapping).length === 0) {
            autoMapImages(steps.length);
        }

        console.log("Executar Teste:", { execRunId, engine: stepsEngine, steps: steps.length });

        const timeoutId = setTimeout(() => {
            executionTimeoutRef.current = null;
            setIsExecuting(current => {
                if (current) {
                    console.error("Execucao Timeout: 5min excedidos.");
                    alert("A execucao excedeu o tempo limite de 5 minutos.");
                    return false;
                }
                return current;
            });
        }, 300000);
        executionTimeoutRef.current = timeoutId;

        // ── Maestro path: route through the MSS pipeline (SSE + runFlowFile).
        // The legacy /api/runs + /ws/front-{runId} pipeline had a race
        // condition (background task could broadcast RUN_STARTED before the
        // WebSocket connected) that left this button stuck in EXECUTANDO.
        if (stepsEngine === 'maestro') {
            // appId comes from the test_cases row that was loaded (testAppId).
            // Fallback chain prevents a broken-but-old test from blocking
            // execution: try the recording-session appId (set when this
            // browser session created the test), then scrape inline from
            // a launchApp step, then warn the user.
            let appId = testAppId || recordingAppId || '';
            if (!appId) {
                // Look for a launchApp step that carries the appId inline.
                for (const s of stepsToRun) {
                    const cmd = s.maestro_command || '';
                    const m = cmd.match(/appId\s*:\s*["']?([^"'\n\r]+)["']?/);
                    if (m && m[1]) { appId = m[1].trim(); break; }
                }
            }
            if (!appId) {
                clearTimeout(timeoutId);
                executionTimeoutRef.current = null;
                setIsExecuting(false);
                setShowExecutionOverlay(false);
                alert('Este teste nao tem appId definido. Salve-o novamente via Maestro Studio ou Importar YAML para que o app correto seja iniciado.');
                return;
            }
            // Sanitize block-form commands missing their indented children via
            // normalizeMaestroCommand (see editor-utils).
            const commands = stepsToRun.map(s => normalizeMaestroCommand(s.maestro_command || '')).filter(Boolean);
            const yamlContent = commands.length > 0
                ? `appId: ${appId}\n---\n${commands.join('\n')}`
                : maestroYaml;

            // Surface the exact YAML we're about to ship. Useful when the SSE
            // reports FAILED — the user can paste it in Maestro Studio's editor
            // to see which line breaks.
            console.groupCollapsed(`[Executar Teste] YAML enviado (${commands.length} comandos, ${yamlContent.length} bytes)`);
            console.log(yamlContent);
            console.groupEnd();

            // Drop any leftover banner from the previous run.
            setExecutionError(null);

            let yamlPath = maestroYamlPath;
            if (yamlContent) {
                try {
                    const saveRes = await fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            yaml_content: yamlContent,
                            project_id: currentProjectId || 'runs',
                            test_name: testName || execRunId,
                        }),
                    });
                    const saveData = await saveRes.json();
                    if (saveData.path) {
                        yamlPath = saveData.path;
                        setMaestroYamlPath(saveData.path);
                        setMaestroYaml(yamlContent);
                    }
                } catch (e) {
                    console.error('Failed to save YAML before execution:', e);
                }
            }

            if (!yamlPath) {
                clearTimeout(timeoutId);
                executionTimeoutRef.current = null;
                setIsExecuting(false);
                setShowExecutionOverlay(false);
                alert('Não foi possível salvar o YAML antes da execução.');
                return;
            }

            await executeViaMaestroStudio(yamlPath, envVarsValues || {});
            return;
        }

        // ── Non-Maestro path (UIAutomator2 / vision): keep legacy WS flow ──
        try {
            let res: Response;

            if (referenceImages.length > 0) {
                // Vision-first path: use FormData (UIAutomator2 only)
                const formData = new FormData();
                formData.append('run_id', execRunId);
                formData.append('steps', JSON.stringify(steps));
                formData.append('device_udid', connectedDevice.udid);
                formData.append('platform', 'android');

                const currentMapping = useVisionStore.getState().imageStepMapping;
                if (Object.keys(currentMapping).length > 0) {
                    formData.append('image_step_mapping', JSON.stringify(currentMapping));
                }

                for (const img of referenceImages) {
                    const blob = img.jpegBlob || img.file;
                    formData.append('reference_images', blob, `ref-${img.order}.jpg`);
                }

                res = await fetch(`${DAEMON_URL}/api/runs/vision`, {
                    method: 'POST',
                    body: formData,
                });
            } else {
                const payload: Record<string, unknown> = {
                    test_case_id: testIdParam || 'test-1',
                    device_udid: connectedDevice.udid,
                    run_id: execRunId,
                    steps: stepsToRun,
                    platform: 'android',
                    engine: stepsEngine,
                };

                res = await fetch(`${DAEMON_URL}/api/runs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) {
                const errText = await res.text();
                console.error("Erro na request de execucao:", res.status, errText);
                clearTimeout(timeoutId);
                executionTimeoutRef.current = null;
                setIsExecuting(false);
                setShowExecutionOverlay(false);
                alert("Falha ao iniciar execucao: " + res.status);
            } else {
                const responseData = await res.json();
                console.log("Execução Response:", responseData);
            }
        } catch (error) {
            console.error("Execution failed:", error);
            clearTimeout(timeoutId);
            executionTimeoutRef.current = null;
            setIsExecuting(false);
            setShowExecutionOverlay(false);
        }
    };

    // Revela o YAML salvo no Finder/Explorer (via daemon — o browser não
    // tem acesso ao filesystem). Exige projeto + teste já salvos em disco.
    const handleRevealInFinder = async () => {
        if (!currentProjectId) {
            alert('Associe o teste a um projeto antes (salve o teste).');
            return;
        }
        try {
            const res = await fetch(`${DAEMON_URL}/api/tests/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: currentProjectId, test_name: testName || 'Novo Teste' }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({} as { detail?: string }));
                alert(body.detail || `Falha ao abrir o navegador de arquivos (HTTP ${res.status}).`);
            }
        } catch {
            alert(`Daemon offline em ${DAEMON_URL} — suba o daemon para abrir o Finder.`);
        }
    };

    return (
        <div className="flex h-screen w-full bg-card overflow-hidden text-foreground flex-col">
            <EditorHeader
                currentProjectId={currentProjectId}
                testName={testName}
                projectName={projectName}
                stepsCount={steps.length}
                isExecuting={isExecuting}
                hasConnectedDevice={!!connectedDevice}
                onSave={() => {
                    if (steps.length === 0) { alert('Adicione passos antes de salvar.'); return; }
                    // Teste já nomeado (salvo antes) → salva direto, sem modal.
                    if (testName.trim()) {
                        void handleSaveTest(testName);
                    } else {
                        setShowSaveDialog(true);
                    }
                }}
                onExecute={handleExecuteTest}
                onRevealInFinder={handleRevealInFinder}
                onOpenExport={() => setShowExportModal(true)}
            />

            <div className="flex flex-1 overflow-hidden relative">
                <ExecutionOverlay isVisible={showExecutionOverlay} onComplete={() => {}} />

                {/* Persistent error banner for Executar Teste failures.
                    Sits at the bottom of the editor area; click 📋 to copy
                    the full error text (often a multi-line Maestro stack
                    trace). Auto-clears when a new run starts. */}
                {executionError && (
                    <ExecutionErrorBanner
                        executionError={executionError}
                        onClose={() => setExecutionError(null)}
                    />
                )}

                <div className="w-[550px] border-r border-border bg-card flex flex-col shrink-0 h-full">
                    {/* While recording, RecordingStepsList already shows a live
                        "Gravando — N passos" header, so this static bar (which
                        reflects `steps`, not `recordedSteps`, and reads "(0)"
                        mid-recording) would be redundant — hide it then. */}
                    {!isRecordingActive && (
                        <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                Passos do Teste ({steps.length})
                            </span>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-3 custom-scrollbar">
                        {/* Recording steps list — Maestro format, drag-reorderable */}
                        {isRecordingActive && recordedSteps.length > 0 && (
                            <RecordingStepsList
                                recordedSteps={recordedSteps}
                                sensors={sensors}
                                onDragEnd={handleRecordingDragEnd}
                                onRemoveStep={removeRecordedStep}
                            />
                        )}

                        {isGenerating && aiFeedbackText && (
                            <AiFeedbackPanel aiFeedbackText={aiFeedbackText} />
                        )}
                        <StepsList
                            steps={steps}
                            isGenerating={isGenerating}
                            isExecuting={isExecuting}
                            editingStepId={editingStepId}
                            editingData={editingData}
                            setEditingData={setEditingData}
                            sensors={sensors}
                            onDragEnd={handleDragEnd}
                            onEditStep={(step, s) => { setEditingStepId(step.id); setEditingData(s); }}
                            onDeleteStep={(step) => setSteps(prev => prev.filter(s => s.id !== step.id))}
                            onDuplicate={handleDuplicate}
                            onCopy={handleCopy}
                            onSaveEdit={(step) => {
                                setSteps(prev => prev.map(s => {
                                    if (s.id !== step.id) return s;
                                    const updated = { ...s, ...editingData } as TestStep;
                                    // Auto-generate maestro_command from action/target/value if not manually set
                                    if (updated.engine === 'maestro' && !editingData.maestro_command) {
                                        const act = (updated.action || '').toLowerCase();
                                        const tgt = updated.target || '';
                                        const val = updated.value || '';
                                        if (act === 'tapon' || act === 'tapOn') {
                                            updated.maestro_command = tgt.match(/^[a-z_][a-z0-9_]*$/)
                                                ? `- tapOn:\n    id: "${tgt}"`
                                                : `- tapOn: "${tgt}"`;
                                        } else if (act === 'inputtext' || act === 'inputText') {
                                            updated.maestro_command = `- inputText: "${val || tgt}"`;
                                        } else if (act === 'assertvisible' || act === 'assertVisible') {
                                            updated.maestro_command = tgt.match(/^[a-z_][a-z0-9_]*$/)
                                                ? `- assertVisible:\n    id: "${tgt}"`
                                                : `- assertVisible:\n    text: "${tgt}"`;
                                        }
                                    }
                                    return updated;
                                }));
                                setEditingStepId(null);
                            }}
                            onCancelEdit={() => setEditingStepId(null)}
                        />

                        {/* ── Add Step Button ── */}
                        {steps.length > 0 && !isExecuting && !isGenerating && (
                            <AddStepButtons
                                onAddStep={(newStep) => {
                                    setSteps(prev => [...prev, newStep]);
                                    setEditingStepId(newStep.id);
                                    setEditingData(newStep);
                                }}
                            />
                        )}

                        {/* ── Confidence Report (Maestro only) ── */}
                        {confidenceReport && selectedEngine === 'maestro' && (
                            <ConfidenceReportCard
                                confidenceReport={confidenceReport}
                                onClose={() => setConfidenceReport(null)}
                            />
                        )}
                    </div>

                    {/* Durante a gravação a viewport fica limpa: sem prompt de
                        IA, sem seletores de modelo/engine e sem screenshots de
                        referência (VisualGuide). Parar/continuar fica no painel
                        do dispositivo à direita. */}
                    {!isRecordingActive && (
                    <PromptInputPanel
                        selectedEngine={selectedEngine}
                        setSelectedEngine={setSelectedEngine}
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        prompt={prompt}
                        setPrompt={setPrompt}
                        isGenerating={isGenerating}
                        isExecuting={isExecuting}
                        isRecordingActive={isRecordingActive}
                        showPlusMenu={showPlusMenu}
                        setShowPlusMenu={setShowPlusMenu}
                        stepsCount={steps.length}
                        currentProjectId={currentProjectId}
                        onGenerate={handleGenerate}
                        onMockGenerate={handleMockGenerate}
                        onClearSteps={() => { setSteps([]); setAiFeedbackText(''); }}
                        onToggleRecording={handleStopRecording}
                        onStartRecording={handleStartRecording}
                        onOpenStepTemplates={() => setShowStepTemplates(true)}
                        onOpenMaestroStudio={() => setShowMaestroStudioDialog(true)}
                        onOpenPromptExamples={() => setShowPromptExamples(true)}
                    />
                    )}
                </div>

                <DevicePreviewPanel
                    connectedDevice={connectedDevice}
                    devicePreviewRef={devicePreviewRef}
                    isRecordingActive={isRecordingActive}
                    elapsedSeconds={elapsedSeconds}
                    onInteraction={handleRecordingInteraction}
                    onTextInput={handleRecordingTextInput}
                    onToggleRecording={handleStopRecording}
                    onStartRecording={handleStartRecording}
                    onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
                />
            </div>

            <ConnectDeviceModal
                isOpen={isDeviceModalOpen}
                onClose={() => setIsDeviceModalOpen(false)}
            />

            <ExecutionToast />
            <AmbiguityDialog runId={runId} />

            {/* "Choose a template" — mirrored from Maestro Studio's own
                template picker so the muscle memory carries over. Tabs for
                Mobile / Web / JS / Text (only Mobile is wired today),
                .yaml-suffixed name, App ID combobox with project suggestions,
                optional comma-separated tags, and a single Create action that
                also inserts the launchApp step before recording starts. */}
            {recorderConfig.open && (
                <RecorderConfigModal
                    recorderConfig={recorderConfig}
                    setRecorderConfig={setRecorderConfig}
                    appIdSuggestions={appIdSuggestions}
                    deviceUdid={connectedDevice?.udid}
                    onConfirm={confirmStartRecording}
                />
            )}

            {/* Pending InputText Modal — shown when daemon detects an EditText tap */}
            {pendingInputModal.visible && (
                <PendingInputModal
                    pendingInputText={pendingInputText}
                    setPendingInputText={setPendingInputText}
                    onConfirm={handleConfirmInput}
                    onSkip={() => { setPendingInputModal({ visible: false, stepIndex: -1 }); setPendingInputText(''); }}
                    onEscape={() => { setPendingInputModal({ visible: false, stepIndex: -1 }); setPendingInputText(''); }}
                />
            )}

            <SaveRecordingModal
                isOpen={showSaveModal}
                stepCount={recordedSteps.length}
                durationSeconds={elapsedSeconds}
                currentProjectId={currentProjectId}
                onSave={handleSaveRecording}
                onCancel={() => { setShowSaveModal(false); clearRecording(); }}
                engine={selectedEngine}
                maestroYaml={maestroYaml}
            />

            {/* Maestro Env Vars Modal */}
            {showEnvVarsModal && (
                <EnvVarsModal
                    envVarsNeeded={envVarsNeeded}
                    envVarsValues={envVarsValues}
                    setEnvVarsValues={setEnvVarsValues}
                    onCancel={() => setShowEnvVarsModal(false)}
                    onExecute={() => {
                        setShowEnvVarsModal(false);
                        handleExecuteTest();
                    }}
                />
            )}

            {/* Step Templates Dialog */}
            {showStepTemplates && (
                <StepTemplatesModal
                    onClose={() => setShowStepTemplates(false)}
                    onPick={(tpl) => {
                        const newStep: TestStep = {
                            id: `step-tpl-${Date.now()}`,
                            action: tpl.action,
                            target: tpl.target,
                            value: tpl.value,
                            status: 'idle',
                            engine: 'maestro',
                            maestro_command: tpl.maestro_command,
                        };
                        setSteps(prev => [...prev, newStep]);
                        setEditingStepId(newStep.id);
                        setEditingData({ ...newStep });
                        setShowStepTemplates(false);
                    }}
                />
            )}

            {/* Maestro Studio Dialog */}
            {showMaestroStudioDialog && (
                <MaestroStudioDialog
                    maestroStudioLaunching={maestroStudioLaunching}
                    onCancel={() => setShowMaestroStudioDialog(false)}
                    onOpen={async () => {
                        setMaestroStudioLaunching(true);
                        try {
                            await fetch(`${DAEMON_URL}/api/maestro/studio`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ udid: connectedDevice?.udid }),
                            });
                            setShowMaestroStudioDialog(false);
                        } catch {
                            alert('Falha ao iniciar Maestro Studio. Verifique se o daemon está rodando.');
                        } finally {
                            setMaestroStudioLaunching(false);
                        }
                    }}
                />
            )}

            {/* Prompt Examples Dialog */}
            {showPromptExamples && (
                <PromptExamplesDialog onClose={() => setShowPromptExamples(false)} />
            )}

            {/* Save Test Dialog */}
            {showSaveDialog && (
                <SaveTestDialog
                    projectName={projectName}
                    stepsCount={steps.length}
                    testName={testName}
                    isSaving={isSaving}
                    onCancel={() => setShowSaveDialog(false)}
                    onSave={handleSaveTest}
                />
            )}

            {/* Exportar resultado do teste (TestRail / Jira / PDF) */}
            {showExportModal && (
                <ExportResultModal
                    testName={testName || 'Novo Teste'}
                    projectName={projectName}
                    steps={steps}
                    onClose={() => setShowExportModal(false)}
                />
            )}

            {/* Toast do save direto (sem modal) */}
            {saveToast && (
                <div className="fixed bottom-4 right-4 z-50 bg-popover border border-success/40 text-success text-sm font-medium rounded-xl shadow-2xl px-4 py-2.5">
                    {saveToast}
                </div>
            )}
        </div>
    );
}
