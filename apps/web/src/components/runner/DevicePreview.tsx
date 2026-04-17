'use client';

import { Smartphone } from 'lucide-react';
import { useScrcpyStream } from '../../hooks/useScrcpyStream';
import { useRef } from 'react';

interface DevicePreviewProps {
    screenshotUrl?: string | null; // mantido por comp., ideal não usar mais
    status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
    udid?: string; // NOVO: udid do device para conectar o scrcpy
}

export function DevicePreview({ screenshotUrl, status, udid = 'emulator-5554' }: DevicePreviewProps) {
    // Passar udid mock ou recebido
    const { canvasRef, deviceDimensions, sendTouch, streamStatus } = useScrcpyStream(udid);
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerDown = useRef<{ x: number; y: number; time: number } | null>(null);

    // Converte coordenadas do canvas → coordenadas reais do device
    const toDeviceCoords = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: Math.round(((clientX - rect.left) / rect.width) * deviceDimensions.width),
            y: Math.round(((clientY - rect.top) / rect.height) * deviceDimensions.height),
        };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerDown.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('down', x, y);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!pointerDown.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('move', x, y);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!pointerDown.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('up', x, y);
        pointerDown.current = null;
    };

    return (
        <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center p-8">

            {/* Device Frame */}
            <div className={`relative w-[320px] h-[680px] rounded-[3rem] border-[12px] shadow-2xl overflow-hidden transition-colors duration-500
        ${status === 'running' ? 'border-brand/40 shadow-[0_0_40px_rgba(59,130,246,0.15)] ring-4 ring-brand/10' :
                    status === 'passed' ? 'border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.15)] ring-4 ring-green-500/10' :
                        status === 'failed' ? 'border-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.15)] ring-4 ring-red-500/10' :
                            'border-white/10'
                }
      `}>
                {/* Dynamic Island Mock */}
                <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-20">
                    <div className="w-[124px] h-[34px] bg-black rounded-b-3xl" />
                </div>

                {/* Screen Content */}
                <div className="absolute inset-0 bg-black flex flex-col items-center justify-center overflow-hidden">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full object-contain bg-black z-10"
                        style={{ cursor: 'pointer', touchAction: 'none' }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    />

                    {/* Fallback de UI caso o vídeo H264 e screenshot não estejam presentes */}
                    {streamStatus !== 'streaming' && (
                        <div className="absolute z-0 flex flex-col items-center text-textSecondary gap-4 pointer-events-none">
                            <Smartphone className="w-12 h-12 opacity-20" />
                            <p className="text-sm font-medium">
                                {streamStatus === 'connecting' ? 'Conectando...' :
                                 streamStatus === 'error' ? 'Falha na conexao. Reconectando...' :
                                 'Aguardando Conexão...'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Scan Line Animation (only while running) */}
                {status === 'running' && (
                    <div className="absolute inset-x-0 h-32 bg-gradient-to-b from-brand/0 via-brand/20 to-brand/0 animate-scan pointer-events-none z-30" />
                )}
            </div>

        </div>
    );
}
