'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Play, Save, Smartphone, Loader2, ArrowLeft, MousePointerClick, Keyboard, CheckCircle2, Wifi, ChevronLeft, Circle, Copy, Trash2, Edit2, Check, GripVertical, CopyPlus, XCircle, ChevronDown, ChevronUp, Search, Crosshair, RefreshCw, AlertTriangle, Square, MoveHorizontal, ArrowUp, Plus, FlaskConical, Clapperboard, BookOpen, X, ThumbsUp, ThumbsDown, ListPlus } from 'lucide-react';
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
import { getMaestroActionLabel, getMaestroActionIcon, getMaestroStepDescription, stepsToMaestroYaml } from '@/lib/maestroYaml';

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
    confidence?: 'high' | 'low' | 'unresolved';
    confidence_comment?: string;
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
                        {editingData.engine === 'maestro' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">maestro</span>
                        )}
                    </div>

                    {editingData.engine === 'maestro' ? (
                        /* ── Maestro edit: show YAML command directly ── */
                        <div className="flex flex-col gap-2 mt-1">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold">Descrição</label>
                                <input
                                    value={editingData.target || ''}
                                    onChange={e => setEditingData({ ...editingData, target: e.target.value })}
                                    placeholder="Ex: Aguarda botão Entrar aparecer"
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold">Comando YAML</label>
                                <textarea
                                    value={editingData.maestro_command || ''}
                                    onChange={e => setEditingData({ ...editingData, maestro_command: e.target.value })}
                                    placeholder="- tapOn:&#10;    text: &quot;Entrar&quot;"
                                    rows={4}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono resize-y"
                                />
                            </div>
                        </div>
                    ) : (
                        /* ── UIAutomator2 edit: action dropdown + target/value ── */
                        <>
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
                        </>
                    )}

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
                                <div className="shrink-0 flex items-center gap-1.5">
                                    {/* Confidence badge — only shown when idle (not overridden by execution status) */}
                                    {step.engine === 'maestro' && step.confidence && step.status === 'idle' && (
                                        <span
                                            title={step.confidence_comment || ''}
                                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border cursor-help ${
                                                step.confidence === 'high'
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                    : step.confidence === 'low'
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                                            }`}
                                        >
                                            {step.confidence === 'high' ? '✅' : step.confidence === 'low' ? '⚠️' : '❌'}
                                        </span>
                                    )}
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

const STEP_TEMPLATES = [
    {
        id: 'extendedWaitUntil',
        label: 'Aguardar texto visível',
        desc: 'Aguarda até que um texto apareça na tela',
        action: 'extendedWaitUntil',
        target: 'Busque seu produto',
        value: '10000',
        maestro_command: '- extendedWaitUntil:\n    visible:\n      text: "Busque seu produto"\n    timeout: 10000',
        yaml: `- extendedWaitUntil:\n    visible:\n      text: "Busque seu produto"\n    timeout: 10000`,
        editHint: 'Edite o texto em "Alvo"',
    },
    {
        id: 'inputText',
        label: 'Digitar texto',
        desc: 'Digita um texto no campo com foco',
        action: 'inputText',
        target: 'Maestro QAMind',
        value: '',
        maestro_command: '- inputText: "Maestro QAMind"',
        yaml: `- inputText: "Maestro QAMind"`,
        editHint: 'Edite o texto em "Alvo"',
    },
    {
        id: 'tapOn',
        label: 'Clicar em elemento',
        desc: 'Toca em um elemento pelo texto visível',
        action: 'tapOn',
        target: 'Entrar',
        value: '',
        maestro_command: '- tapOn:\n    text: "Entrar"',
        yaml: `- tapOn:\n    text: "Entrar"`,
        editHint: 'Edite o texto do botão em "Alvo"',
    },
    {
        id: 'assertVisible',
        label: 'Verificar texto visível',
        desc: 'Falha se o texto NÃO estiver na tela',
        action: 'assertVisible',
        target: 'Login realizado com sucesso',
        value: '',
        maestro_command: '- assertVisible:\n    text: "Login realizado com sucesso"',
        yaml: `- assertVisible:\n    text: "Login realizado com sucesso"`,
        editHint: 'Edite o texto esperado em "Alvo"',
    },
    {
        id: 'assertNotVisible',
        label: 'Verificar texto ausente',
        desc: 'Falha se o texto AINDA estiver na tela',
        action: 'assertNotVisible',
        target: 'Erro de autenticação',
        value: '',
        maestro_command: '- assertNotVisible:\n    text: "Erro de autenticação"',
        yaml: `- assertNotVisible:\n    text: "Erro de autenticação"`,
        editHint: 'Edite o texto indesejado em "Alvo"',
    },
    {
        id: 'waitForAnimationToEnd',
        label: 'Aguardar animação',
        desc: 'Espera todas as animações terminarem',
        action: 'waitForAnimationToEnd',
        target: 'Aguarda animações terminarem',
        value: '',
        maestro_command: '- waitForAnimationToEnd',
        yaml: `- waitForAnimationToEnd`,
        editHint: null,
    },
    {
        id: 'scroll',
        label: 'Rolar tela',
        desc: 'Rola a tela para baixo',
        action: 'scroll',
        target: 'Rola a tela para baixo',
        value: '',
        maestro_command: '- scroll',
        yaml: `- scroll`,
        editHint: null,
    },
    {
        id: 'swipe',
        label: 'Deslizar (swipe)',
        desc: 'Desliza na direção especificada',
        action: 'swipe',
        target: 'Desliza para cima',
        value: 'UP',
        maestro_command: '- swipe:\n    direction: UP\n    duration: 400',
        yaml: `- swipe:\n    direction: UP\n    duration: 400`,
        editHint: 'Edite a direção em "Valor" (UP, DOWN, LEFT, RIGHT)',
    },
    {
        id: 'hideKeyboard',
        label: 'Esconder teclado',
        desc: 'Fecha o teclado virtual',
        action: 'hideKeyboard',
        target: 'Esconde o teclado',
        value: '',
        maestro_command: '- hideKeyboard',
        yaml: `- hideKeyboard`,
        editHint: null,
    },
    {
        id: 'pressKey_back',
        label: 'Pressionar Voltar',
        desc: 'Pressiona o botão de voltar do Android',
        action: 'pressKey',
        target: 'Pressiona o botão Voltar',
        value: 'Back',
        maestro_command: '- pressKey: Back',
        yaml: `- pressKey: Back`,
        editHint: null,
    },
] as const;

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
    const [confidenceReport, setConfidenceReport] = useState<{
        high_confidence_steps: number[];
        low_confidence_steps: number[];
        unresolved_elements: string[];
    } | null>(null);
    const [envVarsValues, setEnvVarsValues] = useState<Record<string, string>>({});
    const [showEnvVarsModal, setShowEnvVarsModal] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [showMaestroStudioDialog, setShowMaestroStudioDialog] = useState(false);
    const [showPromptExamples, setShowPromptExamples] = useState(false);
    const [showStepTemplates, setShowStepTemplates] = useState(false);
    const [maestroStudioLaunching, setMaestroStudioLaunching] = useState(false);
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
        addStepFromDaemon,
        updateStepAtIndex,
        updateStepElement,
        setElapsedSeconds,
        setShowSaveModal,
        clearRecording,
        deviceResolution,
    } = useRecordingStore();

    // SSE state for recording
    const recordingEsRef = useRef<EventSource | null>(null);
    const recordingUdidRef = useRef<string>('');

    // Pending inputText modal state
    const [pendingInputModal, setPendingInputModal] = useState<{
        visible: boolean;
        stepIndex: number;
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
    const handleSseStep = useCallback((data: any) => {
        if (data.updated && typeof data.step_index === 'number') {
            // confirm-input update for existing step
            updateStepAtIndex(data.step_index, data);
            return;
        }
        const step = addStepFromDaemon(data);
        if (step && data.is_pending) {
            setPendingInputModal({ visible: true, stepIndex: data.step_index ?? 0 });
            setPendingInputText('');
        }
    }, [addStepFromDaemon, updateStepAtIndex]);

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

    const handleRecordingTextInput = useCallback((_text: string) => {
        // no-op: text captured via confirm-input modal after EditText tap
    }, []);

    const handleStartRecording = async () => {
        if (!connectedDevice) {
            alert('Conecte um dispositivo primeiro!');
            return;
        }
        startRecordingStore(undefined, testIdParam || undefined);
        setIsRecording(true);
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
        setIsRecording(false);

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
            const appId = 'br.com.foxbit.foxbitandroid';
            const yaml = stepsToMaestroYaml(
                appId,
                recordedSteps.map((rs, idx) => ({
                    id: rs.id,
                    order: idx + 1,
                    action: rs.action as any,
                    elementId: rs.elementId || undefined,
                    value: rs.value || undefined,
                    direction: rs.direction,
                }))
            );
            setMaestroYaml(yaml);
        }
    };

    const handleConfirmInput = async () => {
        const { stepIndex } = pendingInputModal;
        const text = pendingInputText.trim();
        setPendingInputModal({ visible: false, stepIndex: -1 });
        setPendingInputText('');
        if (!text || !connectedDevice) return;
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

    const handleSaveRecording = async (testName: string, projectId: string, yamlContent?: string) => {
        // Generate Maestro YAML from recorded steps
        const appId = 'br.com.foxbit.foxbitandroid';
        const generatedYaml = yamlContent || stepsToMaestroYaml(
            appId,
            recordedSteps.map((rs, idx) => ({
                id: rs.id,
                order: idx + 1,
                action: rs.action as any,
                elementId: rs.elementId || undefined,
                value: rs.value || undefined,
                direction: rs.direction,
            }))
        );

        // Save YAML to backend
        try {
            const saveRes = await fetch(`${DAEMON_URL}/api/maestro/save-yaml`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yaml_content: generatedYaml,
                    project_id: projectId || 'default',
                    test_name: testName,
                }),
            });
            const saveData = await saveRes.json();
            if (saveRes.ok && saveData.path) {
                setMaestroYamlPath(saveData.path);
                setMaestroYaml(generatedYaml);
            }
        } catch (e) {
            console.error('Failed to save Maestro YAML:', e);
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
            const savePayload: Record<string, unknown> = {
                name: testName,
                description: `Teste gravado com ${recordedSteps.length} passos (Maestro)`,
                steps: stepsForDb,
                tags: ['recorded', 'maestro'],
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
                maestro_command: s.maestro_command || '',
                confidence: s.confidence || '',
                confidence_comment: s.confidence_comment || '',
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
                } else if (data.type === 'step_recorded') {
                    // Handle recording events from daemon (auto assertVisible on screen change)
                    const stepData = data.data;
                    if (stepData?.action === 'assertVisible' && stepData?.auto_generated && stepData?.elementId) {
                        useRecordingStore.getState().addAssertVisible(stepData.elementId, true);
                    }
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
                                        const newSteps = data.steps.map((s: any, idx: number) => ({
                                            id: String(idx + 1),
                                            action: s.action || s.maestro_command || '',
                                            target: s.description || '',
                                            value: '',
                                            status: 'idle',
                                            engine: 'maestro' as const,
                                            maestro_command: s.maestro_command || '',
                                            confidence: (s.confidence as 'high' | 'low' | 'unresolved') || 'high',
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
        setShowExecutionOverlay(false);
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
            setIsExecuting(current => {
                if (current) {
                    console.error("Execucao Timeout: 5min excedidos.");
                    alert("A execucao excedeu o tempo limite de 5 minutos.");
                    return false;
                }
                return current;
            });
        }, 300000);

        try {
            let res: Response;

            if (referenceImages.length > 0 && stepsEngine !== 'maestro') {
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
                // Standard / Maestro path: JSON
                const currentEngine = stepsEngine;
                const payload: Record<string, any> = {
                    test_case_id: testIdParam || 'test-1',
                    device_udid: connectedDevice.udid,
                    run_id: execRunId,
                    steps: stepsToRun,
                    platform: 'android',
                    engine: currentEngine,
                };

                if (currentEngine === 'maestro') {
                    // Always regenerate fresh YAML from current steps' maestro_command fields
                    const appId = 'br.com.foxbit.foxbitandroid';
                    const commands = stepsToRun
                        .map(s => s.maestro_command || '')
                        .filter(Boolean);
                    let yamlContent = commands.length > 0
                        ? `appId: ${appId}\n---\n${commands.join('\n')}`
                        : maestroYaml;

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

                    payload.yaml_path = yamlPath;
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
                console.error("Erro na request de execucao:", res.status, errText);
                setIsExecuting(false);
                setShowExecutionOverlay(false);
                clearTimeout(timeoutId);
                alert("Falha ao iniciar execucao: " + res.status);
            } else {
                const responseData = await res.json();
                console.log("Execução Response:", responseData);
            }
        } catch (error) {
            console.error("Execution failed:", error);
            setIsExecuting(false);
            setShowExecutionOverlay(false);
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
                {/* Execution overlay removed — tests start immediately */}

                <div className="w-[550px] border-r border-white/10 bg-[#0C0F1A] flex flex-col shrink-0 h-full">
                    <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Passos do Teste ({steps.length})
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-3 custom-scrollbar">
                        {/* Recording steps list — Maestro format */}
                        {isRecordingActive && recordedSteps.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider px-1">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    Gravando — {recordedSteps.length} passos
                                </div>
                                {recordedSteps.map((rs, idx) => {
                                    const actionLabel = getMaestroActionLabel(rs.action);
                                    const actionIcon = getMaestroActionIcon(rs.action);
                                    const isAssert = rs.action === 'assertVisible';
                                    const isInput = rs.action === 'inputText';
                                    const borderColor = isAssert ? 'border-cyan-500/30' : 'border-red-500/20';
                                    const bgColor = isAssert ? 'bg-cyan-500/10' : 'bg-red-500/20';
                                    const textColor = isAssert ? 'text-cyan-400' : isInput ? 'text-amber-400' : 'text-brandLight';

                                    return (
                                        <div key={rs.id} className={`bg-white/5 border ${borderColor} rounded-lg p-3 flex items-start gap-3 animate-[fadeIn_0.3s_ease-out]`}>
                                            <div className={`w-6 h-6 rounded-full ${bgColor} ${textColor} flex items-center justify-center text-xs font-bold shrink-0 border ${borderColor}`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm">{actionIcon}</span>
                                                    <span className={`text-xs font-bold ${textColor}`}>{actionLabel}</span>
                                                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">maestro</span>
                                                    {rs.autoGenerated && (
                                                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">auto</span>
                                                    )}
                                                    {rs.fromScan && (
                                                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-400">scan</span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-slate-300 mt-1.5 px-2 py-1 rounded bg-black/30 border border-black/20 truncate font-mono">
                                                    {rs.elementId || rs.description}
                                                </div>
                                                {isInput && rs.value && (
                                                    <div className="text-xs text-slate-400 mt-1 pl-1 truncate">
                                                        Valor: <span className="text-white">&quot;{rs.isPassword ? '*'.repeat(rs.value.length) : rs.value}&quot;</span>
                                                    </div>
                                                )}
                                            </div>
                                            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-1" />
                                        </div>
                                    );
                                })}
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
                                    ))}
                                </SortableContext>
                            </DndContext>
                        )}

                        {/* ── Add Step Button ── */}
                        {steps.length > 0 && !isExecuting && !isGenerating && (
                            <div className="flex flex-col gap-1.5 mt-1">
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => {
                                            const newStep: TestStep = {
                                                id: `step-${Date.now()}-1`,
                                                action: 'tapOn',
                                                target: '',
                                                value: '',
                                                status: 'idle',
                                                engine: 'maestro',
                                                maestro_command: '- tapOn:\n    id: ""',
                                            };
                                            setSteps(prev => [...prev, newStep]);
                                            setEditingStepId(newStep.id);
                                            setEditingData(newStep);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:border-brand/50 hover:bg-brand/5 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> tapOn
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newStep: TestStep = {
                                                id: `step-${Date.now()}-2`,
                                                action: 'inputText',
                                                target: 'Texto a digitar',
                                                value: '',
                                                status: 'idle',
                                                engine: 'maestro',
                                                maestro_command: '- inputText: ""',
                                            };
                                            setSteps(prev => [...prev, newStep]);
                                            setEditingStepId(newStep.id);
                                            setEditingData(newStep);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> inputText
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newStep: TestStep = {
                                                id: `step-${Date.now()}-3`,
                                                action: 'assertVisible',
                                                target: '',
                                                value: '',
                                                status: 'idle',
                                                engine: 'maestro',
                                                maestro_command: '- assertVisible:\n    id: ""',
                                            };
                                            setSteps(prev => [...prev, newStep]);
                                            setEditingStepId(newStep.id);
                                            setEditingData(newStep);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> assert
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Confidence Report (Maestro only) ── */}
                        {confidenceReport && selectedEngine === 'maestro' && (
                            <div className="mx-2 mb-2 rounded-lg border border-white/8 bg-white/3 p-3 text-xs">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="font-bold text-zinc-400 uppercase tracking-wide text-[10px]">Relatório de Confiança</span>
                                    <button
                                        onClick={() => setConfidenceReport(null)}
                                        className="text-zinc-600 hover:text-zinc-400 text-[10px]"
                                    >
                                        fechar ×
                                    </button>
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <span className="flex items-center gap-1 text-emerald-400">
                                        <span className="text-base leading-none">✅</span>
                                        <strong>{confidenceReport.high_confidence_steps.length}</strong> alta confiança
                                    </span>
                                    {confidenceReport.low_confidence_steps.length > 0 && (
                                        <span className="flex items-center gap-1 text-amber-400">
                                            <span className="text-base leading-none">⚠️</span>
                                            <strong>{confidenceReport.low_confidence_steps.length}</strong> baixa confiança
                                            <span className="text-zinc-500">(passos {confidenceReport.low_confidence_steps.join(', ')})</span>
                                        </span>
                                    )}
                                    {confidenceReport.unresolved_elements.length > 0 && (
                                        <span className="flex items-center gap-1 text-red-400">
                                            <span className="text-base leading-none">❌</span>
                                            <strong>{confidenceReport.unresolved_elements.length}</strong> não resolvido
                                            <span className="text-zinc-500 truncate max-w-[120px]" title={confidenceReport.unresolved_elements.join(', ')}>
                                                ({confidenceReport.unresolved_elements.join(', ')})
                                            </span>
                                        </span>
                                    )}
                                    {confidenceReport.low_confidence_steps.length === 0 && confidenceReport.unresolved_elements.length === 0 && (
                                        <span className="text-zinc-500">Todos os seletores confirmados em múltiplas fontes.</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-[#0A0C14]">
                        <VisualGuide projectId={selectedEngine === 'maestro' ? (currentProjectId || undefined) : undefined} />

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
                                                        onClick={() => { setShowStepTemplates(true); setShowPlusMenu(false); }}
                                                    >
                                                        <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
                                                        Adicionar passo
                                                    </button>
                                                    <button
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                        onClick={() => { setShowMaestroStudioDialog(true); setShowPlusMenu(false); }}
                                                    >
                                                        <Clapperboard className="w-3.5 h-3.5 text-orange-400" />
                                                        Maestro Studio
                                                    </button>
                                                    <button
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                                        onClick={() => { setShowPromptExamples(true); setShowPlusMenu(false); }}
                                                    >
                                                        <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                                                        Exemplos de prompt
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
                            {/* Device info label */}
                            {connectedDevice && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span>{connectedDevice.model}</span>
                                    <span className="text-slate-600">|</span>
                                    <span>{devicePreviewRef.current?.getDeviceDimensions?.()
                                        ? `${devicePreviewRef.current.getDeviceDimensions().width}x${devicePreviewRef.current.getDeviceDimensions().height}`
                                        : '...'
                                    }</span>
                                    {connectedDevice.os_version && (
                                        <>
                                            <span className="text-slate-600">|</span>
                                            <span>Android {connectedDevice.os_version}</span>
                                        </>
                                    )}
                                </div>
                            )}
                            <div className="relative w-[306px] h-[648px] shrink-0 bg-black rounded-[40px] border-[8px] border-[#1E2330] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
                                <div className="flex-1 w-full bg-[#0A0C14] relative">
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

            {/* Pending InputText Modal — shown when daemon detects an EditText tap */}
            {pendingInputModal.visible && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-6 w-[380px] shadow-2xl">
                        <h3 className="text-base font-bold text-white mb-2">Qual texto você digitou?</h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Um campo de texto foi detectado. Informe o valor digitado para gerar o passo <code className="text-purple-400">inputText</code>.
                        </p>
                        <input
                            autoFocus
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand mb-4"
                            placeholder="Texto digitado..."
                            value={pendingInputText}
                            onChange={e => setPendingInputText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleConfirmInput();
                                if (e.key === 'Escape') {
                                    setPendingInputModal({ visible: false, stepIndex: -1 });
                                    setPendingInputText('');
                                }
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => { setPendingInputModal({ visible: false, stepIndex: -1 }); setPendingInputText(''); }}
                                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg"
                            >
                                Pular
                            </button>
                            <button
                                onClick={handleConfirmInput}
                                className="px-4 py-1.5 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand/80"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
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

            {/* Step Templates Dialog */}
            {showStepTemplates && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                            <div className="flex items-center gap-2.5">
                                <ListPlus className="w-5 h-5 text-emerald-400" />
                                <div>
                                    <h3 className="text-sm font-bold text-white">Adicionar passo</h3>
                                    <p className="text-[10px] text-zinc-500">Clique para adicionar ao final da lista — edite e arraste para reposicionar</p>
                                </div>
                            </div>
                            <button onClick={() => setShowStepTemplates(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-zinc-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar">
                            {STEP_TEMPLATES.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    onClick={() => {
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
                                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors">{tpl.label}</span>
                                            {tpl.editHint && (
                                                <span className="text-[9px] text-emerald-500/70 border border-emerald-500/20 rounded px-1 py-0.5">editável</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-zinc-500 mb-2">{tpl.desc}</p>
                                        <pre className="text-[10px] font-mono text-zinc-400 bg-black/30 rounded px-2.5 py-1.5 whitespace-pre overflow-x-auto">{tpl.yaml}</pre>
                                        {tpl.editHint && (
                                            <p className="text-[9px] text-zinc-600 mt-1.5">{tpl.editHint}</p>
                                        )}
                                    </div>
                                    <Plus className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 shrink-0 mt-1 transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Maestro Studio Dialog */}
            {showMaestroStudioDialog && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-orange-500/20 rounded-2xl p-6 w-[440px] shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                <Clapperboard className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Maestro Studio</h3>
                                <p className="text-xs text-zinc-500">Ferramenta visual de mapeamento de elementos</p>
                            </div>
                        </div>

                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-4 space-y-1.5">
                            <p className="text-xs font-semibold text-orange-300">Atenção — conflito de instância ADB</p>
                            <p className="text-xs text-zinc-400">
                                O Maestro Studio usa a mesma conexão ADB do editor. Ao iniciar, o servidor ADB será reiniciado automaticamente, encerrando o espelhamento de tela.
                            </p>
                            <p className="text-xs text-zinc-400">
                                Após fechar o Maestro Studio, reconecte o dispositivo pelo botão <span className="text-white font-medium">Conectar</span> para retomar o espelhamento.
                            </p>
                        </div>

                        <p className="text-xs text-zinc-500 mb-5">
                            Use o Maestro Studio para inspecionar elementos da interface e copiar seletores para usar nos seus prompts.
                        </p>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowMaestroStudioDialog(false)}
                                className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-white hover:border-zinc-500 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                disabled={maestroStudioLaunching}
                                onClick={async () => {
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
                                className="flex-1 px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {maestroStudioLaunching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                                {maestroStudioLaunching ? 'Iniciando...' : 'Abrir Maestro Studio'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt Examples Dialog */}
            {showPromptExamples && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-5 h-5 text-cyan-400" />
                                <h3 className="text-base font-bold text-white">Exemplos de Prompt</h3>
                            </div>
                            <button onClick={() => setShowPromptExamples(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-zinc-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
                            {/* Bad example */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <ThumbsDown className="w-3 h-3 text-red-400" />
                                    </div>
                                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Prompt vago (evite)</span>
                                </div>
                                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                                    <p className="text-sm text-zinc-300 italic leading-relaxed">
                                        "Abrir aplicativo da foxbit, realizar login, comprar e vender bitcoin"
                                    </p>
                                </div>
                                <p className="text-[11px] text-zinc-500">Muito genérico. A IA não sabe quais campos, botões ou textos esperar na tela.</p>
                            </div>

                            <div className="border-t border-white/5" />

                            {/* Good example */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <ThumbsUp className="w-3 h-3 text-green-400" />
                                    </div>
                                    <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Prompt preciso (recomendado)</span>
                                </div>
                                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                        "Na área de trabalho, clique para abrir o app da Foxbit. Na tela inicial, identifique o botão <span className="text-white font-medium">Entrar</span> e clique nele. Quando a tela de login com campos de e-mail e senha for exibida, preencha o e-mail <span className="text-brand font-mono">{'{{EMAIL}}'}</span> e a senha <span className="text-brand font-mono">{'{{SENHA}}'}</span>. Verifique que o botão <span className="text-white font-medium">Entrar</span> ficou habilitado e clique nele para realizar login. Após alguns segundos, valide que o login foi bem-sucedido verificando se a tela inicial do app aparece."
                                    </p>
                                </div>
                                <p className="text-[11px] text-zinc-500">Descreve cada tela, elemento e validação esperada. Use <span className="font-mono text-brand">{'{{VARIAVEL}}'}</span> para dados dinâmicos.</p>
                            </div>

                            <div className="border-t border-white/5" />

                            {/* Tips */}
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Dicas para bons prompts</p>
                                <ul className="space-y-1.5 text-xs text-zinc-400">
                                    <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Descreva o <span className="text-white">estado inicial</span> da tela antes de cada ação</li>
                                    <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Nomeie os elementos exatamente como aparecem na tela (ex: "botão Entrar", não "botão de login")</li>
                                    <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Inclua <span className="text-white">validações</span> após cada etapa importante</li>
                                    <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Use <span className="font-mono text-brand">{'{{VARIAVEL}}'}</span> para dados que mudam entre execuções (credenciais, CPF, etc.)</li>
                                    <li className="flex gap-2"><span className="text-brand mt-0.5">•</span>Mencione tempos de espera quando o app é lento (ex: "aguarde o carregamento")</li>
                                </ul>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-white/10">
                            <button
                                onClick={() => setShowPromptExamples(false)}
                                className="w-full px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-white hover:border-zinc-500 transition-colors"
                            >
                                Fechar
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
