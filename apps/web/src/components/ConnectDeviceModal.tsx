import { useEffect, useState } from 'react';
import { X, Smartphone, Loader2, Usb } from 'lucide-react';
import { useDeviceStore, Device } from '@/store/deviceStore';
import { DAEMON_URL } from '@/lib/constants';

interface ConnectDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ConnectDeviceModal({ isOpen, onClose }: ConnectDeviceModalProps) {
    const { setConnectedDevice } = useDeviceStore();
    const [devices, setDevices] = useState<Device[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<'idle' | 'found' | 'error'>('idle');

    const fetchDevices = async () => {
        setIsScanning(true);
        setScanResult('idle');
        try {
            const res = await fetch(`${DAEMON_URL}/devices/scan`);
            if (res.ok) {
                const data = await res.json();
                const fetchedDevices = data.devices || [];
                setDevices(fetchedDevices);
                if (fetchedDevices.length > 0) {
                    setScanResult('found');
                } else {
                    setScanResult('error');
                }
            } else {
                setScanResult('error');
            }
        } catch (error) {
            console.error('Failed to fetch devices', error);
            setScanResult('error');
        } finally {
            setIsScanning(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchDevices();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConnect = (device: Device) => {
        setConnectedDevice(device);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div>
                        <h2 className="text-xl font-bold text-white">Conectar Dispositivo</h2>
                        <p className="text-sm text-slate-400 mt-1">Conecte via cabo USB (ADB) ou Wi-Fi</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-4">
                    {/* Dispositos Encontrados */}
                    {isScanning ? (
                        <div className="py-8 flex flex-col items-center justify-center text-center">
                            <Loader2 className="w-8 h-8 text-brand animate-spin mb-4" />
                            <h3 className="font-bold text-white">Buscando dispositivos...</h3>
                        </div>
                    ) : scanResult === 'found' && devices.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {devices.map((device) => (
                                <div key={device.udid} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                                            <Smartphone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white leading-none">{device.model || 'Unknown Android'}</h4>
                                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-mono">
                                                <span>UDID: {device.udid.substring(0, 12)}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1"><Usb className="w-3 h-3" /> USB</span>
                                                <span>•</span>
                                                <span>Android {device.os_version}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleConnect(device)}
                                        className="bg-brand text-black font-bold text-xs px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
                                    >
                                        Conectar
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mb-4">
                                <Smartphone className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-red-400">Nenhum dispositivo encontrado no ADB</h3>
                            <p className="text-xs text-slate-400 mt-2">Conecte o cabo USB no computador e confirme a autorização (RSA) na tela do celular.</p>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-6 pt-2">
                    <button
                        onClick={fetchDevices}
                        disabled={isScanning}
                        className="bg-white/5 text-white font-medium text-sm px-6 py-3 rounded-xl hover:bg-white/10 transition-colors border border-white/10 w-full flex items-center justify-center gap-2"
                    >
                        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Escanear Novamente
                    </button>
                </div>
            </div>
        </div>
    );
}
