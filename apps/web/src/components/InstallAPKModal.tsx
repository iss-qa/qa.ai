import React, { useState, useRef } from 'react';
import { Smartphone, X, Loader2, UploadCloud } from 'lucide-react';

interface InstallAPKModalProps {
    udid: string;
    isOpen: boolean;
    onClose: () => void;
}

export function InstallAPKModal({ udid, isOpen, onClose }: InstallAPKModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'installing' | 'done' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            if (selected.name.endsWith('.apk')) {
                setFile(selected);
                setStatus('idle');
            } else {
                setErrorMsg("Por favor selecione um arquivo .apk válido.");
                setStatus('error');
            }
        }
    };

    const handleInstall = async () => {
        if (!file) return;
        setStatus('uploading');

        const formData = new FormData();
        formData.append('apk', file);
        formData.append('udid', udid);

        try {
            setStatus('installing');
            const res = await fetch('http://localhost:8000/api/devices/install-apk', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (data.success) {
                setStatus('done');
                setTimeout(() => { onClose(); setStatus('idle'); setFile(null); }, 2000);
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Falha na instalação pelo ADB.');
            }
        } catch (e: unknown) {
            setStatus('error');
            setErrorMsg('Erro de conexão com o dispositivo ou daemon.');
            console.error(e);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col relative animate-in fade-in zoom-in-95">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6">Instalar Aplicativo (APK)</h2>

                <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-3
            ${file ? "border-green-500 bg-green-500/10" : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50"}`}
                >
                    <input
                        type="file"
                        accept=".apk"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />

                    {file ? (
                        <>
                            <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-2">
                                <UploadCloud className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-medium text-zinc-200 truncate w-full max-w-[200px]">{file.name}</p>
                            <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </>
                    ) : (
                        <>
                            <div className="text-zinc-500 mb-2">
                                <Smartphone className="w-12 h-12" />
                            </div>
                            <p className="text-sm text-zinc-400">
                                Selecione o arquivo <span className="text-zinc-200 font-medium">.apk</span> aqui
                            </p>
                            <p className="text-xs text-zinc-600 mt-1">
                                A instalação será feita via ADB. Pode levar até 2 min.
                            </p>
                        </>
                    )}
                </div>

                {/* Status */}
                <div className="mt-4 min-h-[24px]">
                    {status === 'installing' && (
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin text-brand" />
                            Instalando no dispositivo...
                        </div>
                    )}
                    {status === 'done' && (
                        <p className="text-sm text-green-400 font-medium">✅ Instalado com sucesso!</p>
                    )}
                    {status === 'error' && (
                        <p className="text-sm text-red-400 break-words">❌ {errorMsg}</p>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleInstall}
                        disabled={!file || status === 'installing' || status === 'done'}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                        {status === 'installing' ? 'Aguarde...' : 'Instalar APK'}
                    </button>
                </div>
            </div>
        </div>
    );
}
