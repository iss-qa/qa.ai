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
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Conectar Dispositivo</h2>
                        <p className="text-sm text-muted-foreground mt-1">Conecte via cabo USB (ADB) ou Wi-Fi</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
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
                            <h3 className="font-bold text-foreground">Buscando dispositivos...</h3>
                        </div>
                    ) : scanResult === 'found' && devices.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {devices.map((device) => (
                                <div key={device.udid} className="bg-foreground/5 border border-border rounded-xl p-4 hover:bg-foreground/[0.07] hover:border-brand/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 border border-brand/20">
                                            <Smartphone className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-foreground text-sm">{device.model || 'Android Device'}</h4>
                                            <div className="flex flex-col gap-0.5 mt-1.5">
                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    <span className="font-mono text-muted-foreground">{device.udid}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Usb className="w-3 h-3 text-green-400" /> USB</span>
                                                    <span className="text-muted-foreground">|</span>
                                                    <span>Android {device.os_version}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleConnect(device)}
                                            className="bg-brand text-white font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-brand/90 transition-colors shrink-0"
                                        >
                                            Conectar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="border border-danger/20 bg-danger/5 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
                                <Smartphone className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-danger">Nenhum dispositivo encontrado no ADB</h3>
                            <p className="text-xs text-muted-foreground mt-2">Conecte o cabo USB no computador e confirme a autorização (RSA) na tela do celular.</p>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-6 pt-2">
                    <button
                        onClick={fetchDevices}
                        disabled={isScanning}
                        className="bg-foreground/5 text-foreground font-medium text-sm px-6 py-3 rounded-xl hover:bg-accent transition-colors border border-border w-full flex items-center justify-center gap-2"
                    >
                        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Escanear Novamente
                    </button>
                </div>
            </div>
        </div>
    );
}
