'use client';

import { Upload, X, Loader2, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ImportStatus {
    type: 'idle' | 'error' | 'success';
    message: string;
}

interface ImportYamlModalProps {
    importDragActive: boolean;
    setImportDragActive: (active: boolean) => void;
    importStatus: ImportStatus;
    setImportStatus: (status: ImportStatus) => void;
    importing: boolean;
    onClose: () => void;
    handleImportFile: (file: File) => void;
}

export function ImportYamlModal({
    importDragActive,
    setImportDragActive,
    importStatus,
    setImportStatus,
    importing,
    onClose,
    handleImportFile,
}: ImportYamlModalProps) {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-brand" />
                        <h2 className="text-lg font-bold text-foreground">Importar Teste Maestro</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5">
                    {/* Drop zone */}
                    <div
                        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                            importDragActive
                                ? 'border-brand bg-brand/5 scale-[1.02]'
                                : 'border-border hover:border-border hover:bg-foreground/[0.02]'
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setImportDragActive(true); }}
                        onDragLeave={() => setImportDragActive(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setImportDragActive(false);
                            const files = Array.from(e.dataTransfer.files).filter(
                                f => f.name.endsWith('.yaml') || f.name.endsWith('.yml')
                            );
                            if (files.length === 0) {
                                setImportStatus({ type: 'error', message: 'Apenas arquivos .yaml ou .yml sao aceitos.' });
                            } else {
                                files.forEach(f => handleImportFile(f));
                            }
                        }}
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.yaml,.yml';
                            input.multiple = true;
                            input.onchange = (e) => {
                                const files = Array.from((e.target as HTMLInputElement).files || []);
                                files.forEach(f => handleImportFile(f));
                            };
                            input.click();
                        }}
                    >
                        {importing ? (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-10 h-10 text-brand animate-spin" />
                                <p className="text-sm text-foreground font-medium">Importando teste...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${importDragActive ? 'bg-brand/20 text-brand' : 'bg-foreground/5 text-muted-foreground'}`}>
                                    <FileUp className="w-7 h-7" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {importDragActive ? 'Solte os arquivos aqui' : 'Arraste e solte arquivos .yaml'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Suporta multiplos arquivos simultaneamente</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status message */}
                    {importStatus.type !== 'idle' && (
                        <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
                            importStatus.type === 'error' ? 'bg-danger/10 border border-danger/20 text-danger' :
                            'bg-success/10 border border-success/20 text-success'
                        }`}>
                            {importStatus.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span>{importStatus.message}</span>
                        </div>
                    )}

                    {/* Help text */}
                    <div className="mt-4 bg-foreground/[0.03] rounded-lg p-3">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            O arquivo deve ser um YAML valido do Maestro com a estrutura:
                        </p>
                        <pre className="text-[10px] text-muted-foreground font-mono mt-2 leading-relaxed">
{`appId: com.app.example
---
- launchApp
- tapOn: "Botao"
- inputText: "texto"`}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
