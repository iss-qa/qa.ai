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

        // Inicializar VideoDecoder (WebCodecs API)
        // Decodifica H.264 em hardware — GPU do computador
        const decoder = new VideoDecoder({
            output: (frame) => {
                // Renderizar frame decodificado no canvas
                if (canvas) {
                    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
                }
                frame.close(); // liberar memória imediatamente
            },
            error: (e) => console.error('Decoder error:', e),
        });

        decoderRef.current = decoder;

        // Conectar WebSocket
        const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
        const wsUrl = `${baseUrl}/stream/${udid}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        let configBuffer: Uint8Array | null = null;

        ws.onmessage = async (event) => {
            // Mensagem JSON = metadados (device_info)
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'device_info') {
                        setDeviceDimensions({ width: msg.width, height: msg.height });
                        canvas.width = msg.width;
                        canvas.height = msg.height;
                    }
                } catch (e) { /* ignore */ }
                return;
            }

            // Dados binários = frame H.264
            const frameData = new Uint8Array(event.data);

            const isKey = isKeyframe(frameData);
            
            // Check se é o pacote de configuração (SPS/PPS)
            if (frameData.length > 7 && (frameData[4] & 0x1F) === 7) {
                configBuffer = frameData;
                
                if (decoder.state === 'unconfigured') {
                    const profile = frameData[5].toString(16).padStart(2, '0').toUpperCase();
                    const compat = frameData[6].toString(16).padStart(2, '0').toUpperCase();
                    const level = frameData[7].toString(16).padStart(2, '0').toUpperCase();
                    const codecString = `avc1.${profile}${compat}${level}`;
                    
                    try {
                        decoder.configure({
                            codec: codecString,
                            optimizeForLatency: true,
                        });
                        console.log("[Scrcpy] Decoder configured:", codecString);
                    } catch (e) {
                        console.error("[Scrcpy] Configure failed:", e);
                    }
                }
                return; // Guardamos o SPSP/PPS, não alimentamos o decoder com isso isoladamente
            }

            let chunkData = frameData;
            
            // Sempre prepender o configBuffer antes de um keyframe (IDR) para garantir estabilidade do decodificador
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
                // Ignore
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            if (decoder.state !== 'closed') {
                decoder.close();
            }
        };
    }, [udid]);

    // Funções de input: enviar eventos para o device
    const sendTouch = useCallback((action: 'down' | 'up' | 'move', x: number, y: number, pressure: number = 1.0) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'touch', action, x, y, pressure }));
        }
    }, []);

    const sendKeyevent = useCallback((keycode: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'keyevent', keycode }));
        }
    }, []);

    return { canvasRef, deviceDimensions, sendTouch, sendKeyevent };
}
