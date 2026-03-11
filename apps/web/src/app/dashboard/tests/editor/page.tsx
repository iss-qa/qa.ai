'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, Play, Save, Smartphone, Loader2, ArrowLeft, MousePointerClick, Keyboard, CheckCircle2, Wifi, UploadCloud, ChevronLeft, Circle, Copy, Camera, Trash2, Edit2, Check, GripVertical, CopyPlus, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { useDeviceStore } from '@/store/deviceStore';
import { ConnectDeviceModal } from '@/components/ConnectDeviceModal';
import { DevicePreview } from '@/components/DevicePreview';
import { DeviceToolbar } from '@/components/DeviceToolbar';

export interface TestStep {
    id: string;
    action: string;
    target: string;
    status: string;
    value?: string;
    error_message?: string;
    strategies_log?: any[];
    suggestion?: string;
}

function useDeviceStream(udid: string | null) {
    const [frameSrc, setFrameSrc] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingRef = useRef<string | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!udid) {
            setFrameSrc(null);
            return;
        }

        const ws = new WebSocket(`ws://localhost:8000/stream/${udid}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            if (pendingRef.current) URL.revokeObjectURL(pendingRef.current);
            pendingRef.current = url;

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setFrameSrc(url);
                pendingRef.current = null;
            });
        };

        ws.onerror = (error) => {
            console.error("Device stream WebSocket error:", error);
        }

        return () => {
            ws.close();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (pendingRef.current) URL.revokeObjectURL(pendingRef.current);
        };
    }, [udid]);

    return frameSrc;
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
                        <div className="flex-1 pr-8">
                            <div className="flex items-center justify-between">
                                <span className={`font-bold text-sm flex items-center gap-1.5 ${step.status === 'error' ? 'text-red-400' : 'text-brandLight'}`}>
                                    {step.action === 'tap' && <MousePointerClick className="w-3.5 h-3.5" />}
                                    {step.action === 'type' && <Keyboard className="w-3.5 h-3.5" />}
                                    {step.action === 'open_app' && <Smartphone className="w-3.5 h-3.5" />}
                                    {(step.action === 'assert_visible' || step.action === 'assert_text') && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                                    {step.action.toUpperCase()}
                                </span>
                                {step.status === 'success' && <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
                                {step.status === 'running' && <Loader2 className="w-3 h-3 text-brand animate-spin" />}
                                {step.status === 'error' && <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>}
                            </div>
                            <div className={`text-xs mt-1 font-mono px-2 py-1 rounded border truncate ${step.status === 'running' ? 'bg-brand/10 border-brand/50 text-brandLight' : step.status === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-black/30 border-black/20 text-slate-300'}`}>
                                {step.target}
                            </div>
                            {step.value && (
                                <div className="text-xs text-slate-400 mt-1 pl-1 truncate">
                                    Valor: <span className="text-white">&quot;{step.value}&quot;</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {step.status === 'error' && (
                        <div className="mt-2 text-xs border-t border-red-500/20 pt-2">
                            <div className="flex items-start gap-1.5 text-red-400 font-medium mb-1.5">
                                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span className="break-all leading-tight">{step.error_message || "Passo falhou durante a execução"}</span>
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
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editingData, setEditingData] = useState<Partial<TestStep>>({});
    const [aiFeedbackText, setAiFeedbackText] = useState('');
    const { connectedDevice, setConnectedDevice } = useDeviceStore();
    const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
    const streamFrameSrc = useDeviceStream(connectedDevice?.udid || null);

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
        const ws = new WebSocket(`ws://localhost:8000/ws/front-${runId}`);
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
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'success' } : s));
                } else if (data.type === 'step_failed') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { 
                        ...s, 
                        status: 'error',
                        error_message: data.data.error_message,
                        strategies_log: data.data.strategies_log,
                        suggestion: data.data.suggestion
                    } : s));
                } else if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_cancelled') {
                    setIsExecuting(false);
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
            const response = await fetch('http://localhost:8000/api/tests/parse-prompt-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt, platform: 'android', project_id: 'default' })
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

                                    const newSteps = data.steps.map((s: any, idx: number) => ({
                                        id: String(idx + 1),
                                        action: s.action,
                                        target: s.target || '',
                                        value: s.value || '',
                                        status: 'idle'
                                    }));

                                    setSteps(newSteps);
                                    setPrompt('');

                                    // Generate a new Run ID so WebSocket connects, but DO NOT execute yet.
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

    const handleExecuteTest = async () => {
        if (!connectedDevice || steps.length === 0 || !runId) return;

        // Reset all step statuses
        setSteps(prev => prev.map(s => ({ ...s, status: 'idle' })));
        setIsExecuting(true);

        const payload = {
            test_case_id: 'test-1',
            device_udid: connectedDevice.udid,
            run_id: runId,
            steps: steps,
            platform: 'android'
        };

        console.log("Executar Teste Payload:", payload);
        
        let timeoutId = setTimeout(() => {
            setIsExecuting(current => {
                if (current) {
                    console.error("Execução Timeout: 60s excedidos sem finalização.");
                    alert("A execução excedeu o tempo limite de 60 segundos.");
                    return false;
                }
                return current;
            });
        }, 60000);

        try {
            const res = await fetch('http://localhost:8000/api/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const errText = await res.text();
                console.error("Erro na request POST /api/runs:", res.status, errText);
                setIsExecuting(false);
                clearTimeout(timeoutId);
                alert("Falha ao iniciar execução: " + res.status);
            } else {
                const responseData = await res.json();
                console.log("POST /api/runs Response:", responseData);
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
                    <Link href="/dashboard/tests" className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                            <h1 className="font-bold text-sm">Login App WasteZero</h1>
                            <p className="text-xs text-slate-400">Projeto: BancoX Mobile</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-md transition-colors border border-transparent">
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

            <div className="flex flex-1 overflow-hidden">
                <div className="w-[450px] border-r border-white/10 bg-[#0C0F1A] flex flex-col shrink-0 h-full">
                    <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Passos do Teste ({steps.length})
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 flex flex-col gap-3 custom-scrollbar">
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
                        <div className="flex flex-col gap-2">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Ex: No aplicativo WasteZero, clique para abri-lo, na tela de login informe isaias@gmail.com..."
                                className="w-full resize-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 min-h-[72px]"
                                disabled={isGenerating}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleGenerate();
                                    }
                                }}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !prompt.trim()}
                                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Gerando...
                                        </>
                                    ) : (
                                        <>✨ Gerar com IA</>
                                    )}
                                </button>
                                <button
                                    onClick={() => setIsRecording(!isRecording)}
                                    className="px-3 py-2 text-sm border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                                >
                                    📱 Gravar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-black/40 flex flex-col items-center justify-center p-8 overflow-y-auto custom-scrollbar">
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
                                udid={connectedDevice?.udid || ''}
                                frameSrc={streamFrameSrc}
                            />

                            {isRecording && (
                                <div className="absolute inset-0 bg-brand/5 border-2 border-brand/50 rounded-[32px] cursor-crosshair group pointer-events-none">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-black/80 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap backdrop-blur-sm pointer-events-none">
                                            Modo Gravação Ativo
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 w-[306px] shrink-0">
                        {connectedDevice ? (
                            <DeviceToolbar udid={connectedDevice.udid} deviceName={connectedDevice.model} />
                        ) : (
                            <div className="flex items-center justify-between w-full bg-[#1A1D27] border border-white/10 rounded-2xl p-2 shadow-lg opacity-50 blur-[1px]">
                                <button className="p-2.5 text-slate-400"><UploadCloud className="w-5 h-5" /></button>
                                <button className="p-2.5 text-slate-400"><ChevronLeft className="w-5 h-5" /></button>
                                <button className="p-2.5 text-slate-400"><Circle className="w-5 h-5" /></button>
                                <button className="p-2.5 text-slate-400"><Copy className="w-5 h-5" /></button>
                                <button className="p-2.5 text-slate-400"><Camera className="w-5 h-5" /></button>
                            </div>
                        )}

                        <div className="flex items-center justify-between w-full bg-[#1A1D27] border border-white/10 rounded-2xl px-5 py-3 shadow-lg">
                            <button
                                onClick={() => setIsDeviceModalOpen(true)}
                                className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                            >
                                <div className="relative flex items-center justify-center">
                                    <div className={`w-3 h-3 rounded-full ${connectedDevice ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    {connectedDevice && <div className="absolute w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75"></div>}
                                </div>
                                <div className="flex flex-col items-start w-[80px]">
                                    <span className="text-xs font-bold text-white truncate w-full">
                                        {connectedDevice ? connectedDevice.model : 'Conectar'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {connectedDevice ? 'Conectado' : 'Dispositivo'}
                                    </span>
                                </div>
                            </button>
                            <div className="w-px h-8 bg-white/10"></div>
                            <button
                                onClick={() => setIsRecording(!isRecording)}
                                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isRecording ? 'bg-red-500/10 text-red-500' : 'text-slate-300 hover:bg-white/5'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-slate-500'}`}></div>
                                <div className="flex flex-col items-start">
                                    <span className={`text-xs font-bold ${isRecording ? 'text-red-400' : 'text-white'}`}>
                                        REPEATO
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        Gravador
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
        </div>
    );
}
