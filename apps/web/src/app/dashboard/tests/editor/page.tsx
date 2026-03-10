'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, Play, Save, Smartphone, X, Loader2, ArrowLeft, MousePointerClick, Keyboard, FileText, CheckCircle2, Wifi, Plus, UploadCloud, ChevronLeft, Circle, Copy, Camera } from 'lucide-react';
import Link from 'next/link';
import { useDeviceStore } from '@/store/deviceStore';
import { ConnectDeviceModal } from '@/components/ConnectDeviceModal';
import { DevicePreview } from '@/components/DevicePreview';
import { DeviceToolbar } from '@/components/DeviceToolbar';

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

export default function TestEditorPage() {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [aiFeedbackText, setAiFeedbackText] = useState('');
    const { connectedDevice, setConnectedDevice } = useDeviceStore();
    const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
    const streamFrameSrc = useDeviceStream(connectedDevice?.udid || null);

    useEffect(() => {
        if (!connectedDevice) return;
        const checkConnection = async () => {
            try {
                const res = await fetch('http://localhost:8000/devices');
                if (res.ok) {
                    const data = await res.json();
                    const devices = data.devices || [];
                    const isStillConnected = devices.some((d: any) => d.udid === connectedDevice.udid);
                    if (!isStillConnected) setConnectedDevice(null);
                }
            } catch (error) { }
        };
        const interval = setInterval(checkConnection, 5000);
        return () => clearInterval(interval);
    }, [connectedDevice, setConnectedDevice]);

    interface TestStep {
        id: number;
        action: string;
        target: string;
        status: string;
        value?: string;
    }

    const [steps, setSteps] = useState<TestStep[]>([]);
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
        ws.onopen = () => console.log('WS Connected for run', runId);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'run_started') {
                    setIsExecuting(true);
                } else if (data.type === 'step_started') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'running' } : s));
                } else if (data.type === 'step_completed') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'success' } : s));
                } else if (data.type === 'step_failed') {
                    setSteps(prev => prev.map((s, i) => i === data.data.step_num - 1 ? { ...s, status: 'error' } : s));
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
                                        id: idx + 1,
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

        try {
            await fetch('http://localhost:8000/api/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_case_id: 'test-1',
                    device_udid: connectedDevice.udid,
                    run_id: runId,
                    steps: steps,
                    platform: 'android'
                })
            });
        } catch (error) {
            console.error("Execution failed:", error);
            setIsExecuting(false);
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
                        {steps.length === 0 && !isGenerating ? <EmptyStepsState /> : steps.map((step, index) => (
                            <div key={step.id} className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors group cursor-pointer">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-sm text-brandLight flex items-center gap-1.5">
                                                {step.action === 'tap' && <MousePointerClick className="w-3.5 h-3.5" />}
                                                {step.action === 'type' && <Keyboard className="w-3.5 h-3.5" />}
                                                {step.action === 'open_app' && <Smartphone className="w-3.5 h-3.5" />}
                                                {step.action === 'assert_visible' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
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
                                            <div className="text-xs text-slate-400 mt-1 pl-1">
                                                Valor: <span className="text-white">&quot;{step.value}&quot;</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
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
