'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Play, Save, Smartphone, Loader2, ArrowLeft, MousePointerClick, Keyboard, CheckCircle2, Wifi, ChevronLeft, Circle, Copy, Trash2, Edit2, Check, GripVertical, CopyPlus, XCircle, ChevronDown, ChevronUp, Search, Crosshair, RefreshCw, AlertTriangle, Square, MoveHorizontal, ArrowUp, Plus, Paperclip, Globe, FlaskConical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DAEMON_URL } from '@/lib/constants';
import { useDeviceStore } from '@/store/deviceStore';
import { useVisionStore } from '@/store/visionStore';
import { useRecordingStore, type RecordedStep } from '@/store/recordingStore';
import { ConnectDeviceModal } from '@/components/ConnectDeviceModal';
import { DevicePreview, type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import { DeviceToolbar } from '@/components/DeviceToolbar';
import { VisualGuide } from '@/components/VisualGuide';
import { ExecutionToast } from '@/components/ExecutionToast';
import { AmbiguityDialog } from '@/components/AmbiguityDialog';
import { SaveRecordingModal } from '@/components/SaveRecordingModal';
import { ExecutionOverlay } from '@/components/ExecutionOverlay';
import { supabase } from '@/lib/supabase';

export interface TestStep {
    id: string;
    action: string;
    target: string;
    status: string;
    value?: string;
    error_message?: string;
    strategies_log?: any[];
    suggestion?: string;
    engine?: 'uiautomator2' | 'maestro';
    maestro_command?: string;
}



function SortableStepItem({
    step, index, isEditing, isExecuting,
    onEdit, onDelete, onDuplicate, onCopy,
    editingData, setEditingData,
    onSaveEdit, onCancelEdit
}: {
    step: TestStep;
    index: number;
    isEditing: boolean;
    isExecuting: boolean;
    onEdit: (data: Partial<TestStep>) => void;
    onDelete: () => void;
    onDuplicate: (step: TestStep) => void;
    onCopy: (step: TestStep) => void;
    editingData: Partial<TestStep>;
    setEditingData: (data: Partial<TestStep>) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        opacity: isDragging ? 0.8 : 1
    };
    
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    return (
        <div ref={setNodeRef} style={style} className={`bg-white/5 border ${step.status === 'error' ? 'border-red-500/50' : 'border-white/10'} rounded-lg p-3 hover:bg-white/10 transition-colors group relative ${isDragging ? 'shadow-2xl ring-2 ring-brand' : ''}`}>
            {!isExecuting && !isEditing && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity z-10 bg-[#0A0C14]/80 p-0.5 rounded backdrop-blur-sm border border-white/5 shadow-xl">
                    <button {...attributes} {...listeners} className="p-1.5 cursor-grab active:cursor-grabbing hover:bg-white/10 text-slate-400 rounded-md" title="Mover">
                        <GripVertical className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDuplicate(step)} className="p-1.5 hover:bg-brand/20 text-slate-400 hover:text-brand rounded-md" title="Duplicar">
                        <CopyPlus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onCopy(step)} className="p-1.5 hover:bg-brand/20 text-slate-400 hover:text-brand rounded-md" title="Copiar">
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onEdit(step)} className="p-1.5 hover:bg-brand/20 text-slate-400 hover:text-brand rounded-md" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onDelete} className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-md" title="Remover">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {isEditing ? (
                <div className="flex flex-col gap-2 relative z-20">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-xs font-bold text-brandLight">Editando Passo {index + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-zinc-500 uppercase font-bold">Ação</label>
                            <select
                                value={editingData.action}
                                onChange={e => setEditingData({ ...editingData, action: e.target.value })}
                                className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                            >
                                <option value="tap">TAP</option>
                                <option value="type">TYPE</option>
                                <option value="open_app">OPEN_APP</option>
                                <option value="assert_text">ASSERT_TEXT</option>
                                <option value="wait">WAIT</option>
                                <option value="swipe">SWIPE</option>
                                <option value="press_back">BACK</option>
                                <option value="press_home">HOME</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-zinc-500 uppercase font-bold">Alvo (Target)</label>
                            <input
                                value={editingData.target || ''}
                                onChange={e => setEditingData({ ...editingData, target: e.target.value })}
                                placeholder="Ex: Botão de Login"
                                className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Valor (Value)</label>
                        <input
                            value={editingData.value || ''}
                            onChange={e => setEditingData({ ...editingData, value: e.target.value })}
                            placeholder="Ex: isaias@gmail.com"
                            className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                        />
                    </div>
                    <div className="flex gap-2 justify-end mt-2">
                        <button onClick={onCancelEdit} className="px-3 py-1 text-xs text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                        <button onClick={onSaveEdit} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/50 text-xs rounded shadow-sm flex items-center gap-1 hover:bg-green-500/30 transition-colors">
                            <Check className="w-3.5 h-3.5" /> Salvar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${step.status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-slate-800 text-slate-400'}`}>
                            {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`font-bold text-xs flex items-center gap-1.5 truncate min-w-0 ${step.status === 'error' ? 'text-red-400' : 'text-brandLight'}`}>
                                    {step.action.toUpperCase()}
                                    {step.engine && (
                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${step.engine === 'maestro' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {step.engine === 'maestro' ? 'maestro' : 'u2'}
                                        </span>
                                    )}
                                </span>
                                <div className="shrink-0">
                                    {step.status === 'success' && <div className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Passou</span></div>}
                                    {step.status === 'running' && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
                                    {step.status === 'error' && <div className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Falhou</span></div>}
                                    {step.status === 'analyzing' && <div className="flex items-center gap-1 text-blue-400"><Search className="w-3.5 h-3.5 animate-pulse" /><span className="text-[9px] font-bold uppercase">Analisando</span></div>}
                                    {step.status === 'located' && <div className="flex items-center gap-1 text-teal-400"><Crosshair className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Localizado</span></div>}
                                    {step.status === 'confirming' && <div className="flex items-center gap-1 text-blue-400"><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-[9px] font-bold uppercase">Confirmando</span></div>}
                                    {step.status === 'fallback' && <div className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-[9px] font-bold uppercase">Fallback</span></div>}
                                </div>
                            </div>
                            <div className={`text-[11px] mt-1.5 px-2 py-1 rounded border truncate ${step.status === 'running' ? 'bg-brand/10 border-brand/50 text-brandLight' : step.status === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-black/30 border-black/20 text-slate-300'}`}>
                                {step.target}
                            </div>
                            {step.value && (
                                <div className="text-xs text-slate-400 mt-1 pl-1 truncate">
                                    Valor: <span className="text-white">&quot;{step.value}&quot;</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Vision analyzing progress bar */}
                    {step.status === 'analyzing' && (
                        <div className="mt-2 h-0.5 bg-blue-500/20 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-1/3 animate-[progress_2s_ease-in-out_infinite] rounded-full" />
                        </div>
                    )}

                    {step.status === 'error' && (
                        <div className="mt-2 text-xs border-t border-red-500/20 pt-2">
                            <div className="flex items-start gap-1.5 text-red-400 font-medium mb-1.5 min-w-0">
                                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span className="break-words leading-tight text-[11px] min-w-0">{step.error_message || "Passo falhou durante a execucao"}</span>
                            </div>
                            
                            {step.suggestion && (
                                <div className="mt-2 bg-brand/10 border border-brand/20 p-2 rounded flex gap-1.5 text-brandLight">
                                    <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span className="leading-tight">{step.suggestion}</span>
                                </div>
                            )}

                            {step.strategies_log && step.strategies_log.length > 0 && (
                                <div className="mt-2.5">
                                    <button 
                                        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                                    >
                                        Estruturas Tentadas ({step.strategies_log.length})
                                        {isDetailsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                    
                                    {isDetailsOpen && (
                                        <div className="mt-2 flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-1 bg-black/20 p-2 rounded">
                                            {step.strategies_log.map((log, i) => (
                                                <div key={i} className="flex flex-col gap-0.5 border-b border-white/5 pb-1 last:border-0 last:pb-0">
                                                    <span className="font-mono text-[9px] text-slate-300 break-all leading-tight">{log.name}</span>
                                                    <span className={`text-[9px] leading-tight ${log.result.includes('sucesso') || log.result.includes('encontrado') ? 'text-green-400' : 'text-red-400/80'}`}>
                                                        → {log.result}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TestEditorPage() {
    const searchParams = useSearchParams();
    const currentProjectId = searchParams.get('projectId');
    const testIdParam = searchParams.get('testId');
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editingData, setEditingData] = useState<Partial<TestStep>>({});
    const [aiFeedbackText, setAiFeedbackText] = useState('');
    const { connectedDevice, setConnectedDevice } = useDeviceStore();
    const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
    const [selectedEngine, setSelectedEngine] = useState<'uiautomator2' | 'maestro'>('uiautomator2');
    const [maestroYaml, setMaestroYaml] = useState<string>('');
    const [maestroYamlPath, setMaestroYamlPath] = useState<string>('');
    const [envVarsNeeded, setEnvVarsNeeded] = useState<string[]>([]);
    const [envVarsValues, setEnvVarsValues] = useState<Record<string, string>>({});
    const [showEnvVarsModal, setShowEnvVarsModal] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [showExecutionOverlay, setShowExecutionOverlay] = useState(false);
    const [testName, setTestName] = useState('');
    const [projectName, setProjectName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const devicePreviewRef = useRef<DevicePreviewHandle>(null);

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
        supabase.from('test_cases').select('*').eq('id', testIdParam).single()
            .then(({ data, error }) => {
                if (error || !data) return;
                setTestName(data.name || '');
                const loadedSteps = (data.steps || []).map((s: any, idx: number) => ({
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
        addInteraction,
        addKeyevent: addRecordingKeyevent,
        addTextInput,
        updateStepElement,
        setElapsedSeconds,
        setShowSaveModal,
        clearRecording,
        deviceResolution,
    } = useRecordingStore();

    // Recording timer
    useEffect(() => {
        if (!isRecordingActive || !recordingStartTime) return;
        const interval = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - recordingStartTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [isRecordingActive, recordingStartTime, setElapsedSeconds]);

    const handleRecordingInteraction = useCallback(async (interaction: RecordedInteraction) => {
        if (!isRecordingActive || !connectedDevice) return;

        const step = addInteraction(interaction);

        // Enrich step with element info from daemon (async, non-blocking)
        try {
            const res = await fetch(`${DAEMON_URL}/recordings/enrich-step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    udid: connectedDevice.udid,
                    x: interaction.startX,
                    y: interaction.startY,
                    action: interaction.type,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.element_info) {
                    updateStepElement(step.id, data.element_info);
                }
            }
        } catch (e) {
            // Enrichment is best-effort, don't block recording
        }
    }, [isRecordingActive, connectedDevice, addInteraction, updateStepElement]);

    const handleRecordingTextInput = useCallback((text: string) => {
        if (!isRecordingActive) return;
        addTextInput(text);
    }, [isRecordingActive, addTextInput]);

    const handleStartRecording = async () => {
        if (!connectedDevice) {
            alert('Conecte um dispositivo primeiro!');
            return;
        }
        startRecordingStore();
        setIsRecording(true);

        // Notify daemon
        try {
            await fetch(`${DAEMON_URL}/recordings/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ udid: connectedDevice.udid }),
            });
        } catch (e) {
            console.error('Failed to notify daemon about recording start:', e);
        }
    };

    const handleStopRecording = async () => {
        stopRecordingStore();
        setIsRecording(false);

        // Notify daemon
        if (connectedDevice) {
            try {
                await fetch(`${DAEMON_URL}/recordings/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ udid: connectedDevice.udid }),
                });
            } catch (e) {
                console.error('Failed to notify daemon about recording stop:', e);
            }
        }

        // Maestro: convert recorded steps to YAML via Claude
        if (selectedEngine === 'maestro' && recordedSteps.length > 0) {
            try {
                const events = recordedSteps.map(rs => ({
                    type: rs.action,
                    x: rs.x,
                    y: rs.y,
                    value: rs.value,
                    element_info: rs.elementInfo || null,
                }));
                const res = await fetch(`${DAEMON_URL}/api/maestro/convert-recording`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recorded_events: events,
                        width: deviceResolution?.width || 1080,
                        height: deviceResolution?.height || 2400,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setMaestroYaml(data.yaml_flow || '');
                    setEnvVarsNeeded(data.env_vars_needed || []);
                }
            } catch (e) {
                console.error('Failed to convert recording to Maestro:', e);
            }
        }
    };

    const handleSaveRecording = async (testName: string, projectId: string, yamlContent?: string) => {
        // Maestro: if YAML provided, save it and set up for execution
        if (selectedEngine === 'maestro' && yamlContent) {
            try {
                const saveRes = await fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        yaml_content: yamlContent,
                        project_id: projectId || 'default',
                        test_name: testName,
                    }),
                });
                const saveData = await saveRes.json();
                if (!saveRes.ok) {
                    alert('YAML invalido: ' + (saveData.detail || 'erro'));
                    return;
                }
                setMaestroYamlPath(saveData.path);
                setMaestroYaml(yamlContent);
            } catch (e) {
                console.error('Failed to save Maestro YAML:', e);
                alert('Erro ao salvar YAML Maestro.');
                return;
            }
        }

        // Convert recorded steps to TestStep format and load into editor
        const newSteps: TestStep[] = recordedSteps.map((rs) => ({
            id: rs.id,
            action: rs.action === 'back' ? 'press_back' : rs.action === 'home' ? 'press_home' : rs.action,
            target: rs.elementInfo?.text || rs.elementInfo?.resource_id || rs.target,
            value: rs.value || '',
            status: 'idle',
            engine: selectedEngine,
        }));

        // Persist to Supabase
        const stepsForDb = recordedSteps.map((rs, idx) => ({
            id: rs.id,
            num: idx + 1,
            action: rs.action === 'back' ? 'press_back' : rs.action === 'home' ? 'press_home' : rs.action,
            target: rs.elementInfo?.text || rs.elementInfo?.resource_id || rs.target || '',
            value: rs.value || '',
            description: rs.description || '',
        }));

        try {
            const engineTag = selectedEngine === 'maestro' ? 'maestro' : 'u2';
            const savePayload: Record<string, unknown> = {
                name: testName,
                description: `Teste gravado com ${recordedSteps.length} passos`,
                steps: stepsForDb,
                tags: ['recorded', engineTag],
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
                console.error('Failed to save test:', errData);
                alert('Erro ao salvar teste: ' + (errData.detail || res.statusText));
            }
        } catch (e) {
            console.error('Failed to save test:', e);
            alert('Erro ao salvar teste. Verifique se o daemon esta rodando.');
        }

        setSteps(newSteps);
        const newRunId = `run-rec-${Date.now()}`;
        setRunId(newRunId);
        setShowSaveModal(false);
        clearRecording();
    };

    const handleSaveTest = async (name: string) => {
        if (!name.trim() || steps.length === 0) return;
        setIsSaving(true);
        try {
            const stepsForDb = steps.map((s, idx) => ({
                id: s.id,
                num: idx + 1,
                action: s.action,
                target: s.target || '',
                value: s.value || '',
                engine: s.engine || selectedEngine,
            }));
            const payload: Record<string, unknown> = {
                name: name.trim(),
                description: `Teste com ${steps.length} passos`,
                steps: stepsForDb,
                tags: [selectedEngine === 'maestro' ? 'maestro' : 'u2'],
                is_active: true,
                version: 1,
            };
            if (currentProjectId) payload.project_id = currentProjectId;

            const res = await fetch(`${DAEMON_URL}/api/tests/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                alert('Erro ao salvar: ' + (err.detail || res.statusText));
                return;
            }
            const result = await res.json();
            if (result.warning) {
                console.warn('Save warning:', result.warning);
            }
            setTestName(name.trim());
            setShowSaveDialog(false);
        } catch (e) {
            console.error('Save failed:', e);
            alert('Erro ao salvar teste.');
        } finally {
            setIsSaving(false);
        }
    };

    const formatRecordingTime = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const LLM_MODELS = [
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Alias)' },
        { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ];

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
    const EmptyStepsState = () => (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 opacity-50">
            <div className="text-4xl">🧪</div>
            <p className="text-sm text-zinc-400">Nenhum passo ainda.</p>
            <p className="text-xs text-zinc-500">Use o prompt abaixo para gerar com IA<br />ou ative o Gravador Manual.</p>
        </div>
    );

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
                    useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: steps.length, description: 'Analisando tela...' });
                } else if (data.type === 'step_located') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'located' } : s));
                    useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: steps.length, description: `Elemento localizado (${Math.round((data.data.confidence || 0) * 100)}%)` });
                } else if (data.type === 'step_confirming') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'confirming' } : s));
                    useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: steps.length, description: 'Confirmando resultado...' });
                } else if (data.type === 'step_fallback') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'fallback' } : s));
                    useVisionStore.getState().setExecutionProgress({ current: data.data.step_num, total: steps.length, description: 'Fallback XML...' });
                } else if (data.type === 'ambiguity_detected') {
                    useVisionStore.getState().setAmbiguityEvent({
                        stepNum: data.data.step_num,
                        screenshotBase64: data.data.screenshot,
                        candidates: data.data.candidates,
                        reason: data.data.reason,
                    });
                } else if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_cancelled') {
                    setIsExecuting(false);
                    setShowExecutionOverlay(false);
                    useVisionStore.getState().setExecutionProgress(null);
                }
            } catch (error) {
                console.error('WS parse error', error);
            }
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
            const response = await fetch(`${DAEMON_URL}/api/tests/parse-prompt-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    platform: 'android',
                    project_id: 'default',
                    model: selectedModel,
                    engine: selectedEngine,
                    device_udid: connectedDevice?.udid || undefined
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
                                        // Maestro: steps come with description + maestro_command
                                        const newSteps = data.steps.map((s: any, idx: number) => ({
                                            id: String(idx + 1),
                                            action: s.action || s.maestro_command || '',
                                            target: s.description || '',
                                            value: '',
                                            status: 'idle',
                                            engine: 'maestro' as const,
                                            maestro_command: s.maestro_command || '',
                                        }));
                                        setSteps(newSteps);
                                        setMaestroYaml(data.yaml_flow || '');
                                        setEnvVarsNeeded(data.env_vars_needed || []);

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
                                        const newSteps = data.steps.map((s: any, idx: number) => ({
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
            // Maestro mock — Login Foxbit (validated on real device)
            const maestroSteps = [
                { id: '1', action: 'launchApp', target: 'Abre o app Foxbit', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- launchApp' },
                { id: '2', action: 'extendedWaitUntil', target: 'Aguarda botao Entrar aparecer', value: '8000', status: 'idle', engine: 'maestro' as const, maestro_command: '- extendedWaitUntil:\n    visible: "Entrar"\n    timeout: 8000' },
                { id: '3', action: 'tapOn', target: 'Clica em Entrar na tela inicial', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Entrar"' },
                { id: '4', action: 'waitForAnimationToEnd', target: 'Aguarda transicao para tela de login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- waitForAnimationToEnd' },
                { id: '5', action: 'extendedWaitUntil', target: 'Aguarda campo de email aparecer', value: '5000', status: 'idle', engine: 'maestro' as const, maestro_command: '- extendedWaitUntil:\n    visible: "Digite seu e-mail"\n    timeout: 5000' },
                { id: '6', action: 'tapOn', target: 'Toca no campo de email', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Digite seu e-mail"' },
                { id: '7', action: 'inputText', target: 'Digita o email', value: 'isaias@gmail.com', status: 'idle', engine: 'maestro' as const, maestro_command: '- inputText: "isaias@gmail.com"' },
                { id: '8', action: 'tapOn', target: 'Toca no campo de senha', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Digite sua senha"' },
                { id: '9', action: 'inputText', target: 'Digita a senha', value: 'Isaias123', status: 'idle', engine: 'maestro' as const, maestro_command: '- inputText: "Isaias123"' },
                { id: '10', action: 'hideKeyboard', target: 'Esconde o teclado', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- hideKeyboard' },
                { id: '11', action: 'tapOn', target: 'Clica em Entrar para fazer login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Entrar"' },
                { id: '12', action: 'waitForAnimationToEnd', target: 'Aguarda transicao pos-login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- waitForAnimationToEnd' },
            ];
            setSteps(maestroSteps);

            // Save YAML — tested and ALL 12 steps passed on real device
            const yamlContent = `appId: br.com.foxbit.foxbitandroid\n---\n- launchApp\n- extendedWaitUntil:\n    visible: "Entrar"\n    timeout: 8000\n- tapOn: "Entrar"\n- waitForAnimationToEnd\n- extendedWaitUntil:\n    visible: "Digite seu e-mail"\n    timeout: 5000\n- tapOn: "Digite seu e-mail"\n- inputText: "isaias@gmail.com"\n- tapOn: "Digite sua senha"\n- inputText: "Isaias123"\n- hideKeyboard\n- tapOn: "Entrar"\n- waitForAnimationToEnd`;
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
            // UIAutomator2 mock
            const mockSteps = [
                { id: '1', action: 'open_app', target: 'Foxbit', value: '', status: 'idle', engine: 'uiautomator2' as const },
                { id: '2', action: 'wait', target: '', value: '500', status: 'idle', engine: 'uiautomator2' as const },
                { id: '3', action: 'assert_text', target: '', value: 'Entrar', status: 'idle', engine: 'uiautomator2' as const },
                { id: '4', action: 'tap', target: 'Entrar', value: '', status: 'idle', engine: 'uiautomator2' as const },
                { id: '5', action: 'wait', target: '', value: '500', status: 'idle', engine: 'uiautomator2' as const },
                { id: '6', action: 'tap', target: 'Digite seu e-mail', value: '', status: 'idle', engine: 'uiautomator2' as const },
                { id: '7', action: 'type', target: '', value: 'isaias@gmail.com', status: 'idle', engine: 'uiautomator2' as const },
                { id: '8', action: 'tap', target: 'Digite sua senha', value: '', status: 'idle', engine: 'uiautomator2' as const },
                { id: '9', action: 'type', target: '', value: '123456', status: 'idle', engine: 'uiautomator2' as const },
                { id: '10', action: 'tap', target: 'Entrar', value: '', status: 'idle', engine: 'uiautomator2' as const },
            ];
            setSteps(mockSteps);
        }

        const newRunId = `run-mock-${Date.now()}`;
        setRunId(newRunId);
    };

    const handleExecuteTest = async () => {
        if (!connectedDevice || steps.length === 0 || !runId) return;

        const stepsEngine = steps[0]?.engine || selectedEngine;

        // Maestro: if env vars needed, show modal first
        if (stepsEngine === 'maestro' && envVarsNeeded.length > 0 && !showEnvVarsModal) {
            setShowEnvVarsModal(true);
            return;
        }

        // Reset all step statuses
        setSteps(prev => prev.map(s => ({ ...s, status: 'idle' })));
        setShowExecutionOverlay(true);
        setIsExecuting(true);

        const { referenceImages, imageStepMapping, autoMapImages } = useVisionStore.getState();

        // Auto-map images if they exist and mapping is empty
        if (referenceImages.length > 0 && Object.keys(imageStepMapping).length === 0) {
            autoMapImages(steps.length);
        }

        console.log("Executar Teste: images=", referenceImages.length, "mapping=", imageStepMapping);

        let timeoutId = setTimeout(() => {
            setIsExecuting(current => {
                if (current) {
                    console.error("Execução Timeout: 5min excedidos sem finalização.");
                    alert("A execução excedeu o tempo limite de 5 minutos.");
                    return false;
                }
                return current;
            });
        }, 300000);

        try {
            let res: Response;

            if (referenceImages.length > 0) {
                // Vision-first path: use FormData
                const formData = new FormData();
                formData.append('run_id', runId);
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
                // Standard / Maestro path: JSON
                const currentEngine = stepsEngine;
                const payload: Record<string, any> = {
                    test_case_id: 'test-1',
                    device_udid: connectedDevice.udid,
                    run_id: runId,
                    steps: steps,
                    platform: 'android',
                    engine: currentEngine,
                };

                if (currentEngine === 'maestro') {
                    payload.yaml_path = maestroYamlPath;
                    payload.env_vars = envVarsValues;
                }

                res = await fetch(`${DAEMON_URL}/api/runs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) {
                const errText = await res.text();
                console.error("Erro na request de execução:", res.status, errText);
                setIsExecuting(false);
                clearTimeout(timeoutId);
                alert("Falha ao iniciar execução: " + res.status);
            } else {
                const responseData = await res.json();
                console.log("Execução Response:", responseData);
            }
        } catch (error) {
            console.error("Execution failed:", error);
            setIsExecuting(false);
            clearTimeout(timeoutId);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#0A0C14] overflow-hidden text-white flex-col">
            <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <Link href={currentProjectId ? `/dashboard/projects/${currentProjectId}` : '/dashboard/projects'} className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                            <h1 className="font-bold text-sm">{testName || 'Novo Teste'}</h1>
                            <p className="text-xs text-slate-400">Projeto: {projectName || 'Sem projeto'}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (steps.length === 0) { alert('Adicione passos antes de salvar.'); return; }
                            setShowSaveDialog(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-md transition-colors border border-white/10"
                    >
                        <Save className="w-4 h-4" /> Salvar
                    </button>
                    <button
                        onClick={handleExecuteTest}
                        disabled={isExecuting || steps.length === 0 || !connectedDevice}
                        className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 text-white rounded-md transition-colors shadow-sm shadow-green-500/20"
                    >
                        {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                        {isExecuting ? 'EXECUTANDO...' : 'EXECUTAR TESTE'}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Execution loading overlay — covers entire editor */}
                <ExecutionOverlay
                    isVisible={showExecutionOverlay}
                    onComplete={() => setShowExecutionOverlay(false)}
                />

                <div className="w-[550px] border-r border-white/10 bg-[#0C0F1A] flex flex-col shrink-0 h-full">
                    <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Passos do Teste ({steps.length})
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-3 custom-scrollbar">
                        {/* Recording steps list */}
                        {isRecordingActive && recordedSteps.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider px-1">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    Gravando — {recordedSteps.length} passos
                                </div>
                                {recordedSteps.map((rs, idx) => (
                                    <div key={rs.id} className="bg-white/5 border border-red-500/20 rounded-lg p-3 flex items-start gap-3 animate-[fadeIn_0.3s_ease-out]">
                                        <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold shrink-0 border border-red-500/30">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 text-sm font-bold text-brandLight">
                                                {rs.action === 'tap' && <MousePointerClick className="w-3.5 h-3.5" />}
                                                {rs.action === 'type' && <Keyboard className="w-3.5 h-3.5" />}
                                                {rs.action === 'swipe' && <MoveHorizontal className="w-3.5 h-3.5" />}
                                                {rs.action === 'back' && <ChevronLeft className="w-3.5 h-3.5" />}
                                                {rs.action === 'home' && <Circle className="w-3.5 h-3.5" />}
                                                {rs.action.toUpperCase()}
                                            </div>
                                            <div className="text-xs text-slate-300 mt-1 truncate">
                                                {rs.isPassword ? rs.description.replace(/"[^"]*"/, `"${'*'.repeat(8)}"`) : rs.description}
                                            </div>
                                            {rs.elementInfo?.text && (
                                                <div className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
                                                    {rs.elementInfo.text}
                                                </div>
                                            )}
                                        </div>
                                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-1" />
                                    </div>
                                ))}
                                <div className="bg-white/5 border border-dashed border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-slate-500 text-xs">
                                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                        <div className="w-2 h-2 rounded-full bg-red-500/50 animate-pulse" />
                                    </div>
                                    Aguardando proxima interacao...
                                </div>
                            </div>
                        )}

                        {isGenerating && aiFeedbackText && (
                            <div className="bg-black/40 border border-brand/20 p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shrink-0 shadow-lg shadow-black/20">
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-50 animate-[pulse_2s_ease-in-out_infinite]" />
                                <div className="flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-wider">
                                    <Bot className="w-4 h-4 animate-pulse" />
                                    O que a IA está pensando...
                                </div>
                                <div className="text-xs text-slate-300/80 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {aiFeedbackText}
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Gerando passos de teste em tempo real
                                </div>
                            </div>
                        )}
                        {steps.length === 0 && !isGenerating ? <EmptyStepsState /> : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                    {steps.map((step, index) => (
                                        <SortableStepItem
                                            key={step.id}
                                            step={step}
                                            index={index}
                                            isEditing={editingStepId === step.id}
                                            isExecuting={isExecuting}
                                            onEdit={(s) => { setEditingStepId(step.id); setEditingData(s); }}
                                            onDelete={() => setSteps(prev => prev.filter(s => s.id !== step.id))}
                                            onDuplicate={handleDuplicate}
                                            onCopy={handleCopy}
                                            editingData={editingData}
                                            setEditingData={setEditingData}
                                            onSaveEdit={() => {
                                                setSteps(prev => prev.map(s => s.id === step.id ? { ...s, ...editingData } as TestStep : s));
                                                setEditingStepId(null);
                                            }}
                                            onCancelEdit={() => setEditingStepId(null)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-[#0A0C14]">
                        <VisualGuide />

                        {/* Chat-style input */}
                        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl focus-within:border-zinc-500 transition-colors">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Descreva o teste que deseja criar..."
                                className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none min-h-[80px] max-h-[160px]"
                                disabled={isGenerating}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleGenerate();
                                    }
                                }}
                            />

                            {/* Bottom bar inside input */}
                            <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                                <div className="flex items-center gap-1.5">
                                    {/* Engine selector pill */}
                                    <select
                                        value={selectedEngine}
                                        onChange={(e) => setSelectedEngine(e.target.value as 'uiautomator2' | 'maestro')}
                                        className="bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none pr-5 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right_6px]"
                                        disabled={isGenerating || isExecuting}
                                    >
                                        <option value="uiautomator2">UIAutomator2</option>
                                        <option value="maestro">Maestro</option>
                                    </select>

                                    {/* LLM selector pill */}
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none pr-5 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right_6px] max-w-[140px]"
                                        disabled={isGenerating}
                                    >
                                        {LLM_MODELS.map((m) => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>

                                    {/* Plus menu */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPlusMenu(!showPlusMenu)}
                                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${showPlusMenu ? 'bg-zinc-600 text-white rotate-45' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700'}`}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>

                                        {showPlusMenu && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setShowPlusMenu(false)} />
                                                <div className="absolute bottom-9 left-0 bg-[#1A1D27] border border-white/10 rounded-xl shadow-2xl py-1.5 z-40 w-48 animate-[fadeIn_0.1s_ease-out]">
                                                    <button
                                                        onClick={() => { handleMockGenerate(); setShowPlusMenu(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                    >
                                                        <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                                                        Mock - Teste exemplo
                                                    </button>
                                                    {steps.length > 0 && (
                                                        <button
                                                            onClick={() => { setSteps([]); setAiFeedbackText(''); setShowPlusMenu(false); }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Limpar passos ({steps.length})
                                                        </button>
                                                    )}
                                                    <div className="border-t border-white/5 my-1" />
                                                    <button
                                                        onClick={() => { if (isRecordingActive) { handleStopRecording(); } else { handleStartRecording(); } setShowPlusMenu(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                    >
                                                        <div className={`w-3.5 h-3.5 rounded-full ${isRecordingActive ? 'bg-red-500' : 'border-2 border-red-400'}`} />
                                                        {isRecordingActive ? 'Parar gravacao' : 'Gravar testes'}
                                                    </button>
                                                    <button
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                        onClick={() => setShowPlusMenu(false)}
                                                    >
                                                        <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                                                        Upload anexo
                                                    </button>
                                                    <button
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                        onClick={() => setShowPlusMenu(false)}
                                                    >
                                                        <Globe className="w-3.5 h-3.5 text-green-400" />
                                                        @browser: web test
                                                    </button>
                                                    <button
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                        onClick={() => setShowPlusMenu(false)}
                                                    >
                                                        <Search className="w-3.5 h-3.5 text-purple-400" />
                                                        @inspect: inspecionar tela
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Send button */}
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !prompt.trim()}
                                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-600 disabled:text-zinc-400"
                                >
                                    {isGenerating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-black/40 flex items-center justify-center p-8 overflow-hidden relative">
                    {/* Phone + lateral buttons */}
                    <div className="flex items-start gap-4">
                        {/* Phone + bottom toolbar */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative w-[306px] h-[648px] shrink-0 bg-black rounded-[40px] border-[8px] border-[#1E2330] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
                                <div className="flex-1 w-full bg-[#0A0C14] relative">
                                    <div className="absolute top-0 w-full h-6 bg-black/20 flex justify-between items-center px-4 z-10">
                                        <span className="text-[10px] text-white font-medium">14:32</span>
                                        <div className="flex gap-1">
                                            <Wifi className="w-3 h-3 text-white" />
                                            <div className="w-4 h-2 border border-white rounded-[2px] relative"><div className="absolute left-0 top-0 bottom-0 bg-white w-3/4"></div></div>
                                        </div>
                                    </div>

                                    <DevicePreview
                                        ref={devicePreviewRef}
                                        udid={connectedDevice?.udid || ''}
                                        onInteraction={isRecordingActive ? handleRecordingInteraction : undefined}
                                        onTextInput={isRecordingActive ? handleRecordingTextInput : undefined}
                                    />

                                    {isRecordingActive && (
                                        <div className="absolute inset-0 border-2 border-red-500/60 rounded-[32px] pointer-events-none">
                                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
                                                <div className="bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 border border-red-500/50 shadow-lg">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                                    <span className="font-bold text-red-400 text-[10px] uppercase tracking-wider">REC</span>
                                                    <span className="text-white/70 font-mono text-[10px]">{formatRecordingTime(elapsedSeconds)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Device toolbar below phone (back, home, recents, etc) */}
                            {connectedDevice && (
                                <DeviceToolbar udid={connectedDevice.udid} deviceName={connectedDevice.model} sendKeyevent={(kc) => devicePreviewRef.current?.sendKeyevent(kc)} />
                            )}
                        </div>

                        {/* Right sidebar: Record + Connect stacked at top */}
                        <div className="flex flex-col gap-3 shrink-0 pt-2">
                            {/* Record button */}
                            <button
                                onClick={isRecordingActive ? handleStopRecording : handleStartRecording}
                                className={`flex flex-col items-center justify-center gap-2 w-20 h-24 rounded-2xl border transition-all ${isRecordingActive ? 'bg-red-500/10 border-red-500/50 shadow-lg shadow-red-500/10' : 'bg-[#1A1D27] border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                            >
                                {isRecordingActive ? (
                                    <>
                                        <Square className="w-5 h-5 text-red-500 fill-red-500" />
                                        <div className="text-center">
                                            <span className="text-[10px] font-bold text-red-400 block uppercase">Parar</span>
                                            <span className="text-[9px] text-red-400/70 font-mono">{formatRecordingTime(elapsedSeconds)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-5 h-5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
                                        <div className="text-center">
                                            <span className="text-[10px] font-bold text-white block uppercase">Gravar</span>
                                            <span className="text-[9px] text-slate-400">Testes</span>
                                        </div>
                                    </>
                                )}
                            </button>

                            {/* Connect device button */}
                            <button
                                onClick={() => setIsDeviceModalOpen(true)}
                                className="flex flex-col items-center justify-center gap-2 w-20 h-24 rounded-2xl bg-[#1A1D27] border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
                            >
                                <div className="relative">
                                    <Smartphone className="w-5 h-5 text-slate-300" />
                                    <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1A1D27] ${connectedDevice ? 'bg-green-500' : 'bg-red-500'}`} />
                                    {connectedDevice && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 animate-ping opacity-50" />}
                                </div>
                                <div className="text-center">
                                    <span className="text-[10px] font-bold text-white block truncate w-16">
                                        {connectedDevice ? connectedDevice.model : 'Conectar'}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                        {connectedDevice ? 'Conectado' : 'Dispositivo'}
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <ConnectDeviceModal
                isOpen={isDeviceModalOpen}
                onClose={() => setIsDeviceModalOpen(false)}
            />

            <ExecutionToast />
            <AmbiguityDialog runId={runId} />
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
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-6 w-[400px] shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">Variaveis de ambiente</h3>
                        <p className="text-xs text-slate-400 mb-4">O YAML Maestro requer as seguintes variaveis:</p>
                        <div className="flex flex-col gap-3">
                            {envVarsNeeded.map((varName) => (
                                <div key={varName}>
                                    <label className="text-xs font-bold text-slate-300 mb-1 block">{varName}</label>
                                    <input
                                        type={varName.toLowerCase().includes('password') || varName.toLowerCase().includes('senha') ? 'password' : 'text'}
                                        value={envVarsValues[varName] || ''}
                                        onChange={(e) => setEnvVarsValues(prev => ({ ...prev, [varName]: e.target.value }))}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                                        placeholder={`Valor para ${varName}`}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={() => setShowEnvVarsModal(false)}
                                className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-white hover:border-zinc-500 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowEnvVarsModal(false);
                                    handleExecuteTest();
                                }}
                                className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
                            >
                                Executar Teste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Test Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-6 w-[380px] shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-1">Salvar Teste</h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Projeto: <span className="text-white font-medium">{projectName || 'Sem projeto'}</span>
                            {' '}&middot;{' '}{steps.length} passos
                        </p>
                        <input
                            type="text"
                            autoFocus
                            placeholder="Nome do teste (ex: Login com email valido)"
                            defaultValue={testName}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTest((e.target as HTMLInputElement).value);
                            }}
                            id="save-test-name-input"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder-zinc-500"
                        />
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setShowSaveDialog(false)}
                                className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-white hover:border-zinc-500 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    const input = document.getElementById('save-test-name-input') as HTMLInputElement;
                                    handleSaveTest(input?.value || '');
                                }}
                                disabled={isSaving}
                                className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {isSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
