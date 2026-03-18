import { useEffect, useRef, useState, useCallback } from 'react';

function isKeyframe(data: Uint8Array): boolean {
    for (let i = 0; i < data.length - 4; i++) {
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
            const nalType = data[i + 4] & 0x1F;
            if (nalType === 5) return true;
        }
    }
    return false;
}

export function useScrcpyStream(udid: string | null) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const decoderRef = useRef<VideoDecoder | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [deviceDimensions, setDeviceDimensions] = useState({ width: 1080, height: 2400 });

    useEffect(() => {
        if (!udid || !canvasRef.current) return;

        if (!('VideoDecoder' in window)) {
            console.error('WebCodecs API is not supported in this browser.');
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        let configBuffer: Uint8Array | null = null;
        let codecString = '';
        let waitingForKeyframe = false;

        function createDecoder(): VideoDecoder {
            return new VideoDecoder({
                output: (frame) => {
                    if (canvas) {
                        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
                    }
                    frame.close();
                },
                error: (e) => {
                    console.warn('[Scrcpy] Decoder error, will reset on next keyframe:', e);
                    waitingForKeyframe = true;
                },
            });
        }

        let decoder = createDecoder();
        decoderRef.current = decoder;

        function resetAndReconfigure() {
            try {
                if (decoder.state !== 'closed') {
                    decoder.close();
                }
            } catch { /* ignore */ }

            decoder = createDecoder();
            decoderRef.current = decoder;
            waitingForKeyframe = false;

            if (codecString) {
                try {
                    decoder.configure({ codec: codecString, optimizeForLatency: true });
                } catch (e) {
                    console.error('[Scrcpy] Re-configure failed:', e);
                }
            }
        }

        // Connect WebSocket
        const baseUrl = process.env.NEXT_PUBLIC_DAEMON_URL?.replace('http', 'ws') || 'ws://localhost:8001';
        const ws = new WebSocket(`${baseUrl}/stream/${udid}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'device_info') {
                        setDeviceDimensions({ width: msg.width, height: msg.height });
                        canvas.width = msg.width;
                        canvas.height = msg.height;
                    }
                } catch { /* ignore */ }
                return;
            }

            const frameData = new Uint8Array(event.data);
            const isKey = isKeyframe(frameData);

            // SPS/PPS config packet
            if (frameData.length > 7 && (frameData[4] & 0x1F) === 7) {
                configBuffer = frameData;
                if (decoder.state === 'unconfigured') {
                    const profile = frameData[5].toString(16).padStart(2, '0').toUpperCase();
                    const compat = frameData[6].toString(16).padStart(2, '0').toUpperCase();
                    const level = frameData[7].toString(16).padStart(2, '0').toUpperCase();
                    codecString = `avc1.${profile}${compat}${level}`;
                    try {
                        decoder.configure({ codec: codecString, optimizeForLatency: true });
                        console.log('[Scrcpy] Decoder configured:', codecString);
                    } catch (e) {
                        console.error('[Scrcpy] Configure failed:', e);
                    }
                }
                return;
            }

            // Recovery: if decoder is broken, reset on next keyframe
            if (decoder.state === 'closed' || waitingForKeyframe) {
                if (isKey && configBuffer) {
                    resetAndReconfigure();
                } else {
                    return; // skip until keyframe
                }
            }

            // If decode queue is growing too large, reset decoder instead of
            // dropping individual frames (which causes H.264 corruption).
            // reset() discards all pending work cleanly, then we wait for
            // the next keyframe to resume.
            if (decoder.state === 'configured' && decoder.decodeQueueSize > 10) {
                console.warn('[Scrcpy] Decode queue overflow, resetting decoder');
                try {
                    decoder.reset();
                    // Re-configure immediately
                    if (codecString) {
                        decoder.configure({ codec: codecString, optimizeForLatency: true });
                    }
                } catch {
                    // If reset fails, full recreation
                    resetAndReconfigure();
                }
                waitingForKeyframe = true;
                return;
            }

            let chunkData = frameData;
            if (isKey && configBuffer) {
                chunkData = new Uint8Array(configBuffer.length + frameData.length);
                chunkData.set(configBuffer, 0);
                chunkData.set(frameData, configBuffer.length);
            }

            try {
                if (decoder.state === 'configured') {
                    decoder.decode(new EncodedVideoChunk({
                        type: isKey ? 'key' : 'delta',
                        timestamp: performance.now() * 1000,
                        data: chunkData,
                    }));
                }
            } catch (e) {
                console.warn('[Scrcpy] Decode error:', e);
                waitingForKeyframe = true;
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            try {
                if (decoder.state !== 'closed') {
                    decoder.close();
                }
            } catch { /* ignore */ }
        };
    }, [udid]);

    // Throttle move events to ~30fps
    const lastMoveRef = useRef<number>(0);

    const sendTouch = useCallback((action: 'down' | 'up' | 'move', x: number, y: number, pressure: number = 1.0) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        if (action === 'move') {
            const now = performance.now();
            if (now - lastMoveRef.current < 33) return;
            lastMoveRef.current = now;
        }

        wsRef.current.send(JSON.stringify({ type: 'touch', action, x, y, pressure }));
    }, []);

    const sendKeyevent = useCallback((keycode: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'keyevent', keycode }));
        }
    }, []);

    const sendText = useCallback((text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && text) {
            wsRef.current.send(JSON.stringify({ type: 'text', text }));
        }
    }, []);

    const sendBackspace = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'backspace' }));
        }
    }, []);

    return { canvasRef, deviceDimensions, sendTouch, sendKeyevent, sendText, sendBackspace };
}
