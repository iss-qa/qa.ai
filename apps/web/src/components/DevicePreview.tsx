import React, { useRef, useCallback, useEffect } from 'react';
import { Smartphone } from 'lucide-react';
import { useScrcpyStream } from '../hooks/useScrcpyStream';

export interface RecordedInteraction {
    type: 'tap' | 'swipe' | 'keyevent';
    startX: number;
    startY: number;
    endX?: number;
    endY?: number;
    duration: number;
    timestamp: number;
}

interface DevicePreviewProps {
    udid: string;
    deviceWidth?: number;
    deviceHeight?: number;
    frameSrc?: string | null;
    onInteraction?: (interaction: RecordedInteraction) => void;
    onTextInput?: (text: string) => void;
}

export function DevicePreview({ udid, frameSrc, onInteraction, onTextInput }: DevicePreviewProps) {
    const { canvasRef, deviceDimensions, sendTouch, sendKeyevent, sendText } = useScrcpyStream(udid);
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerDown = useRef<{ x: number; y: number; devX: number; devY: number; time: number } | null>(null);
    const onInteractionRef = useRef(onInteraction);
    onInteractionRef.current = onInteraction;

    // Keep refs to latest values for native event listeners
    const sendTouchRef = useRef(sendTouch);
    sendTouchRef.current = sendTouch;
    const deviceDimensionsRef = useRef(deviceDimensions);
    deviceDimensionsRef.current = deviceDimensions;

    const toDeviceCoords = useCallback((clientX: number, clientY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const dims = deviceDimensionsRef.current;
        return {
            x: Math.round(((clientX - rect.left) / rect.width) * dims.width),
            y: Math.round(((clientY - rect.top) / rect.height) * dims.height),
        };
    }, [canvasRef]);

    // ===== Native non-passive event listeners =====
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const { x, y } = toDeviceCoords(e.clientX, e.clientY);
            const delta = e.deltaY > 0 ? 300 : -300;

            sendTouchRef.current('down', x, y);
            setTimeout(() => sendTouchRef.current('move', x, y + delta), 50);
            setTimeout(() => sendTouchRef.current('up', x, y + delta), 100);

            if (onInteractionRef.current) {
                onInteractionRef.current({
                    type: 'swipe',
                    startX: x,
                    startY: y,
                    endX: x,
                    endY: y + delta,
                    duration: 100,
                    timestamp: Date.now(),
                });
            }
        };

        const onTouchStart = (e: TouchEvent) => { e.preventDefault(); };
        const onTouchMove = (e: TouchEvent) => { e.preventDefault(); };
        const onTouchEnd = (e: TouchEvent) => { e.preventDefault(); };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        };
    }, [canvasRef, toDeviceCoords]);

    // Block defaults on the container to prevent parent scroll interference
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const block = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
        container.addEventListener('wheel', block, { passive: false });
        container.addEventListener('touchstart', block, { passive: false });
        container.addEventListener('touchmove', block, { passive: false });

        return () => {
            container.removeEventListener('wheel', block);
            container.removeEventListener('touchstart', block);
            container.removeEventListener('touchmove', block);
        };
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        pointerDown.current = { x: e.clientX, y: e.clientY, devX: x, devY: y, time: Date.now() };
        sendTouch('down', x, y);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!pointerDown.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('move', x, y);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!pointerDown.current) return;
        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
        sendTouch('up', x, y);

        if (onInteraction) {
            const start = pointerDown.current;
            const duration = Date.now() - start.time;
            const dx = x - start.devX;
            const dy = y - start.devY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 20) {
                onInteraction({
                    type: 'tap',
                    startX: start.devX,
                    startY: start.devY,
                    duration,
                    timestamp: Date.now(),
                });
            } else {
                onInteraction({
                    type: 'swipe',
                    startX: start.devX,
                    startY: start.devY,
                    endX: x,
                    endY: y,
                    duration,
                    timestamp: Date.now(),
                });
            }
        }

        pointerDown.current = null;
    };

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 w-full h-full select-none flex flex-col items-center justify-center bg-black/50"
            style={{ touchAction: 'none', overscrollBehavior: 'none' }}
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
                style={{ cursor: 'pointer', touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={(e) => {
                    e.preventDefault();
                    if (pointerDown.current) {
                        const { x, y } = toDeviceCoords(e.clientX, e.clientY);
                        sendTouch('up', x, y);
                        pointerDown.current = null;
                    }
                }}
            />

            {!canvasRef.current && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[-1]">
                    <Smartphone className="w-16 h-16 text-white/5 mb-4" />
                    <p className="text-white/20 text-sm font-medium">Aguardando espelhamento...</p>
                </div>
            )}
        </div>
    );
}
