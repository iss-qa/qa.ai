'use client';

import { Square, Smartphone } from 'lucide-react';
import { DevicePreview, type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import { DeviceToolbar } from '@/components/DeviceToolbar';
import { formatRecordingTime } from '../editor-utils';

interface ConnectedDevice {
    udid: string;
    model: string;
    os_version?: string;
}

export function DevicePreviewPanel({
    connectedDevice,
    devicePreviewRef,
    isRecordingActive,
    elapsedSeconds,
    onInteraction,
    onTextInput,
    onToggleRecording,
    onStartRecording,
    onOpenDeviceModal,
}: {
    connectedDevice: ConnectedDevice | null;
    devicePreviewRef: React.RefObject<DevicePreviewHandle>;
    isRecordingActive: boolean;
    elapsedSeconds: number;
    onInteraction: (interaction: RecordedInteraction) => void;
    onTextInput: () => void;
    onToggleRecording: () => void;
    onStartRecording: () => void;
    onOpenDeviceModal: () => void;
}) {
    return (
        <div className="flex-1 bg-black/40 flex items-center justify-center p-8 overflow-hidden relative">
            {/* Phone + lateral buttons */}
            <div className="flex items-start gap-4">
                {/* Phone + bottom toolbar */}
                <div className="flex flex-col items-center gap-3">
                    {/* Device info label */}
                    {connectedDevice && (
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span>{connectedDevice.model}</span>
                            <span className="text-zinc-600">|</span>
                            <span>{devicePreviewRef.current?.getDeviceDimensions?.()
                                ? `${devicePreviewRef.current.getDeviceDimensions().width}x${devicePreviewRef.current.getDeviceDimensions().height}`
                                : '...'
                            }</span>
                            {connectedDevice.os_version && (
                                <>
                                    <span className="text-zinc-600">|</span>
                                    <span>Android {connectedDevice.os_version}</span>
                                </>
                            )}
                        </div>
                    )}
                    <div className="relative w-[306px] h-[648px] shrink-0 bg-black rounded-[40px] border-[8px] border-[#1E2330] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
                        <div className="flex-1 w-full bg-card relative">
                            <DevicePreview
                                ref={devicePreviewRef}
                                udid={connectedDevice?.udid || ''}
                                onInteraction={isRecordingActive ? onInteraction : undefined}
                                onTextInput={isRecordingActive ? onTextInput : undefined}
                            />

                            {isRecordingActive && (
                                <div className="absolute inset-0 border-2 border-red-500/60 rounded-[32px] pointer-events-none">
                                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
                                        <div className="bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 border border-red-500/50 shadow-lg">
                                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                            <span className="font-bold text-red-400 text-[10px] uppercase tracking-wider">REC</span>
                                            <span className="text-foreground/70 font-mono text-[10px]">{formatRecordingTime(elapsedSeconds)}</span>
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
                        onClick={isRecordingActive ? onToggleRecording : onStartRecording}
                        className={`flex flex-col items-center justify-center gap-2 w-20 h-24 rounded-2xl border transition-all ${isRecordingActive ? 'bg-red-500/10 border-red-500/50 shadow-lg shadow-red-500/10' : 'bg-popover border-border hover:border-border hover:bg-accent'}`}
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
                                    <span className="text-[10px] font-bold text-foreground block uppercase">Gravar</span>
                                    <span className="text-[9px] text-muted-foreground">Testes</span>
                                </div>
                            </>
                        )}
                    </button>

                    {/* Connect device button */}
                    <button
                        onClick={onOpenDeviceModal}
                        className="flex flex-col items-center justify-center gap-2 w-20 h-24 rounded-2xl bg-popover border border-border hover:border-border hover:bg-accent transition-all"
                    >
                        <div className="relative">
                            <Smartphone className="w-5 h-5 text-muted-foreground" />
                            <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-popover ${connectedDevice ? 'bg-green-500' : 'bg-red-500'}`} />
                            {connectedDevice && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 animate-ping opacity-50" />}
                        </div>
                        <div className="text-center">
                            <span className="text-[10px] font-bold text-foreground block truncate w-16">
                                {connectedDevice ? connectedDevice.model : 'Conectar'}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                                {connectedDevice ? 'Conectado' : 'Dispositivo'}
                            </span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
