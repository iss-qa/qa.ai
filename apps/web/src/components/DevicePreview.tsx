import React, { useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useScrcpyStream } from '../hooks/useScrcpyStream';

interface DevicePreviewProps {
    udid: string;
    deviceWidth?: number;    // ignorado na v2 (obtido do scrcpy)
    deviceHeight?: number;   // ignorado na v2 (obtido do scrcpy)
    frameSrc?: string | null; // mantido por compatibilidade
}

export function DevicePreview({ udid, frameSrc }: DevicePreviewProps) {
    const { canvasRef, deviceDimensions, sendTouch, sendKeyevent } = useScrcpyStream(udid);
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
        // Throttle manual is recommended for performance, but WebSocket handles frequent messages well
        sendTouch('move', x, y);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!pointerDown.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('up', x, y);
        pointerDown.current = null;
    };

    // Scroll da roda do mouse → swipe vertical
    const handleWheel = (e: React.WheelEvent) => {
        if (!canvasRef.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        const delta = e.deltaY > 0 ? 300 : -300;

        // Simular um swipe rápido para baixo/cima
        sendTouch('down', x, y);
        setTimeout(() => sendTouch('move', x, y + delta), 50);
        setTimeout(() => sendTouch('up', x, y + delta), 100);
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full select-none flex flex-col items-center justify-center bg-black/50">
            {/* O Canvas para o WebCodecs renderizar H.264 */}
            <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
                style={{ cursor: 'pointer', touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onWheel={handleWheel}
            />

            {/* Fallback visual inicial na ausência de vídeo (canvas vazio) */}
            {!canvasRef.current && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[-1]">
                    <Smartphone className="w-16 h-16 text-white/5 mb-4" />
                    <p className="text-white/20 text-sm font-medium">Aguardando espelhamento...</p>
                </div>
            )}
        </div>
    );
}
