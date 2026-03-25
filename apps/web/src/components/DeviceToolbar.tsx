import React, { useState } from 'react';
import { Camera, ChevronLeft, Circle, Copy, UploadCloud } from 'lucide-react';
import { InstallAPKModal } from './InstallAPKModal';
import { DAEMON_URL } from '@/lib/constants';

interface DeviceToolbarProps {
    udid: string;
    deviceName: string;
    sendKeyevent?: (keycode: number) => void;
}

export function DeviceToolbar({ udid, deviceName, sendKeyevent }: DeviceToolbarProps) {
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    const handleScreenshot = async () => {
        try {
            const res = await fetch(`${DAEMON_URL}/api/devices/${udid}/screenshot`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screenshot-${deviceName}-${Date.now()}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Failed to download screenshot", e);
        }
    };

    const tools = [
        {
            id: 'upload',
            label: 'Instalar APK',
            icon: <UploadCloud className="w-5 h-5" />,
            onClick: () => setIsUploadOpen(true),
        },
        {
            id: 'back',
            label: 'Voltar',
            icon: <ChevronLeft className="w-5 h-5" />,
            onClick: () => sendKeyevent?.(4),   // KEYCODE_BACK
        },
        {
            id: 'home',
            label: 'Tela Inicial',
            icon: <Circle className="w-5 h-5" />,
            onClick: () => sendKeyevent?.(3),   // KEYCODE_HOME
        },
        {
            id: 'recents',
            label: 'Trocar Aplicativo',
            icon: <Copy className="w-5 h-5" />,
            onClick: () => sendKeyevent?.(187), // KEYCODE_APP_SWITCH
        },
        {
            id: 'screenshot',
            label: 'Capturar Tela',
            icon: <Camera className="w-5 h-5" />,
            onClick: handleScreenshot,
        },
    ];

    return (
        <>
            <div className="flex items-center justify-between w-full bg-[#1A1D27] border border-white/10 rounded-2xl p-2 shadow-lg">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={tool.onClick}
                        title={tool.label}
                        className="p-2.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
                    >
                        {tool.icon}
                    </button>
                ))}
            </div>

            <InstallAPKModal
                udid={udid}
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
            />
        </>
    );
}
