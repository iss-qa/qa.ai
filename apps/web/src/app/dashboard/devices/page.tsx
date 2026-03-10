'use client';

import { Smartphone, Monitor, Cpu, Plus, Wifi, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

// API Interface
interface Device {
    udid: string;
    status: string;
    model: string;
    os_version?: string;
    platform?: string;
}

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<'idle' | 'found' | 'error'>('idle');

    // Fetch devices on mount and periodically
    const fetchDevices = async () => {
        try {
            const res = await fetch('http://localhost:8000/devices');
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices || []);
            }
        } catch (error) {
            console.error('Failed to fetch devices', error);
        }
    };

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAddClick = () => {
        setIsAddOpen(true);
        setIsScanning(false);
    };

    const handleScan = async () => {
        setIsScanning(true);
        setScanResult('idle');

        try {
            // Trigger a manual fetch to see if ADB sees it now
            const res = await fetch('http://localhost:8000/devices/scan');
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices || []);
                if (data.devices && data.devices.length > 0) {
                    setScanResult('found');
                    setTimeout(() => setIsAddOpen(false), 2000); // Auto close on success
                } else {
                    setScanResult('error');
                }
            } else {
                setScanResult('error');
            }
        } catch (error) {
            setScanResult('error');
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Dispositivos</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Nuvem de dispositivos para execução automatizada.</p>
                </div>
                <button
                    onClick={handleAddClick}
                    className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> CONECTAR DISPOSITIVO
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {devices.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                        Nenhum dispositivo conectado no momento. Clique em "Conectar Dispositivo" para buscar.
                    </div>
                ) : (
                    devices.map((device) => (
                        <div key={device.udid} className="bg-[#0A0C14] rounded-2xl p-5 shadow-sm border border-white/10 hover:border-brand/40 transition-all text-white">
                            <div className="flex items-center justify-between mb-6">
                                <div className="p-2 bg-white/5 rounded-lg text-brand">
                                    {device.platform === 'android' ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${device.status === 'ONLINE' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500'}`} />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{device.status === 'ONLINE' ? 'Online' : 'Offline'}</span>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-white leading-tight truncate">{device.model || 'Unknown Device'}</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 truncate">{device.udid} • Android {device.os_version}</p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-slate-400 text-xs font-medium">
                                <div className="flex items-center gap-1">
                                    <Wifi className="w-3 h-3" />
                                    <span>ADB Local</span>
                                </div>
                                <div className="flex items-center gap-1 text-green-400">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Pronto</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal de Conexão */}
            {isAddOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button
                            onClick={() => setIsAddOpen(false)}
                            className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-2">Conectar Novo Dispositivo</h2>
                        <p className="text-sm text-slate-400 mb-6">Instale o App QAMind Bridge no seu celular ou utilize o cabo USB para detecção.</p>

                        <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${isScanning ? 'border-brand/50 bg-brand/5' : scanResult === 'found' ? 'border-green-500/50 bg-green-500/10' : scanResult === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 hover:border-brand/30'}`}>
                            {isScanning ? (
                                <>
                                    <Loader2 className="w-8 h-8 text-brand animate-spin mb-4" />
                                    <h3 className="font-bold text-white">Buscando dispositivos pelo ADB...</h3>
                                    <p className="text-xs text-slate-400 mt-2">Certifique-se de que o modo desenvolvedor e a depuração USB estão ativados no celular.</p>
                                </>
                            ) : scanResult === 'found' ? (
                                <>
                                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mb-4">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-bold text-white">Dispositivo Encontrado!</h3>
                                    <p className="text-xs text-green-400/80 mt-2 mb-6">Redirecionando...</p>
                                </>
                            ) : (
                                <>
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${scanResult === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-slate-400'}`}>
                                        <Smartphone className="w-6 h-6" />
                                    </div>
                                    <h3 className={`font-bold ${scanResult === 'error' ? 'text-red-400' : 'text-white'}`}>
                                        {scanResult === 'error' ? 'Nenhum dispositivo encontrado no ADB' : 'Pronto para escanear ADB local'}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-2 mb-6">Conecte o cabo USB no computador e confirme a autorização (RSA) na tela do celular.</p>

                                    <button
                                        onClick={handleScan}
                                        className="bg-white text-black font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-slate-200 transition-colors w-full"
                                    >
                                        Escanear Novamente
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
