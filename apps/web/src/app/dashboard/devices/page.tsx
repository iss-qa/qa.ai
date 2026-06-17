'use client';

import { Smartphone, Monitor, Plus, Wifi, X, Loader2, CheckCircle2, Plug, Save, RotateCcw, AlertCircle, Link2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { getDaemonUrl, setDaemonUrl, DAEMON_URL_STORAGE_KEY } from '@/lib/constants';

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

    // --- Conexão com o daemon (local ou túnel) ---
    const [daemonStatus, setDaemonStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [editingEndpoint, setEditingEndpoint] = useState(false);
    const [endpointInput, setEndpointInput] = useState('');
    const [currentEndpoint, setCurrentEndpoint] = useState('');

    // Sincroniza o endpoint exibido com o resolvido (localStorage > env > localhost).
    useEffect(() => {
        const url = getDaemonUrl();
        setCurrentEndpoint(url);
        setEndpointInput(url);
    }, []);

    // Fetch devices on mount and periodically. Usa getDaemonUrl() a cada chamada
    // para refletir mudança de endpoint sem reload.
    const fetchDevices = useCallback(async () => {
        try {
            const res = await fetch(`${getDaemonUrl()}/devices`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices || []);
                setDaemonStatus('online');
            } else {
                setDaemonStatus('offline');
            }
        } catch (error) {
            console.error('Failed to fetch devices', error);
            setDaemonStatus('offline');
        }
    }, []);

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 5000);
        return () => clearInterval(interval);
    }, [fetchDevices, currentEndpoint]);

    const handleSaveEndpoint = () => {
        const trimmed = endpointInput.trim();
        setDaemonUrl(trimmed || null);          // vazio = volta ao default
        const resolved = getDaemonUrl();
        setCurrentEndpoint(resolved);
        setEndpointInput(resolved);
        setEditingEndpoint(false);
        setDaemonStatus('checking');
        fetchDevices();
    };

    const handleResetEndpoint = () => {
        window.localStorage.removeItem(DAEMON_URL_STORAGE_KEY);
        const resolved = getDaemonUrl();
        setCurrentEndpoint(resolved);
        setEndpointInput(resolved);
        setEditingEndpoint(false);
        setDaemonStatus('checking');
        fetchDevices();
    };

    const handleAddClick = () => {
        setIsAddOpen(true);
        setIsScanning(false);
    };

    const handleScan = async () => {
        setIsScanning(true);
        setScanResult('idle');

        try {
            // Trigger a manual fetch to see if ADB sees it now
            const res = await fetch(`${getDaemonUrl()}/devices/scan`);
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
        } catch {
            setScanResult('error');
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Dispositivos</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Nuvem de dispositivos para execução automatizada.</p>
                </div>
                <button
                    onClick={handleAddClick}
                    className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> CONECTAR DISPOSITIVO
                </button>
            </div>

            {/* Conexão com o daemon (local ou túnel) */}
            <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-foreground/5 flex items-center justify-center text-brand shrink-0">
                            <Plug className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-foreground text-sm">Conexão com o daemon</h3>
                                <StatusBadge status={daemonStatus} />
                            </div>
                            {!editingEndpoint && (
                                <p className="text-[11px] text-muted-foreground font-mono truncate">{currentEndpoint}</p>
                            )}
                        </div>
                    </div>
                    {!editingEndpoint && (
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => { setDaemonStatus('checking'); fetchDevices(); }}
                                className="border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent"
                            >
                                Testar
                            </button>
                            <button
                                onClick={() => setEditingEndpoint(true)}
                                className="border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent"
                            >
                                Alterar endpoint
                            </button>
                        </div>
                    )}
                </div>

                {editingEndpoint && (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1 min-w-0">
                                <Link2 className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={endpointInput}
                                    onChange={e => setEndpointInput(e.target.value)}
                                    placeholder="http://localhost:8001 ou https://xxxx.ngrok-free.app"
                                    className="w-full bg-foreground/5 border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 font-mono"
                                />
                            </div>
                            <button onClick={handleSaveEndpoint} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-brand/90 flex items-center gap-1.5">
                                <Save className="w-3.5 h-3.5" /> Salvar
                            </button>
                            <button onClick={handleResetEndpoint} title="Voltar ao padrão (localhost)" className="border border-border text-muted-foreground px-3 py-2 rounded-lg text-xs font-bold hover:bg-accent flex items-center gap-1.5">
                                <RotateCcw className="w-3.5 h-3.5" /> Padrão
                            </button>
                        </div>
                    </div>
                )}

                {daemonStatus === 'offline' && !editingEndpoint && (
                    <div className="flex items-start gap-2 text-[11px] text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                            Daemon inacessível em <span className="font-mono">{currentEndpoint}</span>. Rode o daemon na sua máquina (porta 8001).
                            Na web, se o navegador bloquear <span className="font-mono">http://localhost</span>, exponha o daemon com um túnel
                            (<span className="font-mono">ngrok http 8001</span>) e cole a URL HTTPS em &quot;Alterar endpoint&quot;.
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {devices.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-muted-foreground bg-foreground/5 border border-border rounded-2xl border-dashed">
                        Nenhum dispositivo conectado no momento. Clique em &quot;Conectar Dispositivo&quot; para buscar.
                    </div>
                ) : (
                    devices.map((device) => (
                        <div key={device.udid} className="bg-card rounded-2xl p-5 shadow-sm border border-border hover:border-brand/40 transition-all text-foreground">
                            <div className="flex items-center justify-between mb-6">
                                <div className="p-2 bg-foreground/5 rounded-lg text-brand">
                                    {device.platform === 'android' ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${device.status === 'ONLINE' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500'}`} />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{device.status === 'ONLINE' ? 'Online' : 'Offline'}</span>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-foreground leading-tight truncate">{device.model || 'Unknown Device'}</h4>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1 truncate">{device.udid} • Android {device.os_version}</p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-muted-foreground text-xs font-medium">
                                <div className="flex items-center gap-1">
                                    <Wifi className="w-3 h-3" />
                                    <span>ADB Local</span>
                                </div>
                                <div className="flex items-center gap-1 text-success">
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
                    <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button
                            onClick={() => setIsAddOpen(false)}
                            className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-foreground mb-2">Conectar Dispositivo</h2>
                        <p className="text-sm text-muted-foreground mb-6">Conecte o celular via cabo USB com depuração USB ativada.</p>

                        <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${isScanning ? 'border-brand/50 bg-brand/5' : scanResult === 'found' ? 'border-success/50 bg-success/10' : scanResult === 'error' ? 'border-danger/50 bg-danger/5' : 'border-border hover:border-brand/30'}`}>
                            {isScanning ? (
                                <>
                                    <Loader2 className="w-8 h-8 text-brand animate-spin mb-4" />
                                    <h3 className="font-bold text-foreground">Buscando dispositivos pelo ADB...</h3>
                                    <p className="text-xs text-muted-foreground mt-2">Certifique-se de que o modo desenvolvedor e a depuração USB estão ativados no celular.</p>
                                </>
                            ) : scanResult === 'found' ? (
                                <>
                                    <div className="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center text-success mb-4">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-bold text-foreground">Dispositivo Encontrado!</h3>
                                    <p className="text-xs text-success/80 mt-2 mb-6">Redirecionando...</p>
                                </>
                            ) : (
                                <>
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${scanResult === 'error' ? 'bg-danger/10 text-danger' : 'bg-foreground/5 text-muted-foreground'}`}>
                                        <Smartphone className="w-6 h-6" />
                                    </div>
                                    <h3 className={`font-bold ${scanResult === 'error' ? 'text-danger' : 'text-foreground'}`}>
                                        {scanResult === 'error' ? 'Nenhum dispositivo encontrado no ADB' : 'Pronto para escanear ADB local'}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-2 mb-6">Conecte o cabo USB no computador e confirme a autorização (RSA) na tela do celular.</p>

                                    <button
                                        onClick={handleScan}
                                        className="bg-foreground text-background font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-foreground/90 transition-colors w-full"
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

function StatusBadge({ status }: { status: 'checking' | 'online' | 'offline' }) {
    if (status === 'online') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Conectado
            </span>
        );
    }
    if (status === 'offline') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-danger">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" /> Offline
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Verificando
        </span>
    );
}
