'use client';

import { useState, type ComponentType } from 'react';
import {
    X, UploadCloud, FileArchive, FilePlus2, FolderPlus, Folder,
    AlertTriangle, CheckCircle2, Loader2, FileCode2,
} from 'lucide-react';
import { normalizeFolderPath } from '../project-utils';

interface ImportStatus {
    type: 'idle' | 'error' | 'success';
    message: string;
}

type ImportMode = 'zip' | 'files' | 'folder';

interface ImportTestsModalProps {
    // Pasta de destino pré-selecionada (quando aberto a partir de uma pasta).
    // Em modo 'files' = pasta-alvo do import; em modo 'folder' = pasta pai.
    defaultFolder?: string;
    // Aba inicial: 'files' (importar) ou 'folder' (criar subpasta).
    initialMode?: ImportMode;
    importing: boolean;
    importStatus: ImportStatus;
    onClose: () => void;
    onImportFiles: (files: File[], folderPath: string) => void;
    onImportZip: (file: File) => void;
    onCreateFolder: (path: string) => void;
}

const FILE_ACCEPT = '.yaml,.yml,.json,.js,.ts';

export function ImportTestsModal({
    defaultFolder = '',
    initialMode = 'files',
    importing,
    importStatus,
    onClose,
    onImportFiles,
    onImportZip,
    onCreateFolder,
}: ImportTestsModalProps) {
    const [mode, setMode] = useState<ImportMode>(initialMode);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [folderName, setFolderName] = useState(defaultFolder ? `${defaultFolder}/` : 'tests');

    const normFolder = normalizeFolderPath(folderName);

    const pickFiles = (multiple: boolean, accept: string, onPick: (fs: File[]) => void) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.onchange = (e) => onPick(Array.from((e.target as HTMLInputElement).files || []));
        input.click();
    };

    const canSubmit =
        (mode === 'zip' && !!zipFile) ||
        (mode === 'files' && files.length > 0) ||
        (mode === 'folder' && normFolder.length > 0);

    const submit = () => {
        if (!canSubmit || importing) return;
        if (mode === 'zip' && zipFile) onImportZip(zipFile);
        else if (mode === 'files') onImportFiles(files, defaultFolder);
        else if (mode === 'folder') onCreateFolder(normFolder);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-border">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Importar testes</h2>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md">
                            Importe um ZIP com a estrutura completa, arquivos individuais ou crie
                            uma pasta para organizar seus testes.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Mode cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <ModeCard
                            active={mode === 'zip'}
                            icon={FileArchive}
                            title="ZIP completo"
                            desc="Recria toda a estrutura de pastas"
                            onClick={() => setMode('zip')}
                        />
                        <ModeCard
                            active={mode === 'files'}
                            icon={FilePlus2}
                            title="Arquivos"
                            desc="Importe um ou vários testes"
                            onClick={() => setMode('files')}
                        />
                        <ModeCard
                            active={mode === 'folder'}
                            icon={FolderPlus}
                            title="Criar pasta"
                            desc="Monte a estrutura do projeto"
                            onClick={() => setMode('folder')}
                        />
                    </div>

                    {defaultFolder && mode !== 'folder' && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Folder className="w-3.5 h-3.5 text-brand" />
                            Importando dentro de <span className="font-mono text-brand">{defaultFolder}/</span>
                        </p>
                    )}

                    {/* Body por modo */}
                    {mode === 'folder' ? (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Nome da pasta
                            </label>
                            {defaultFolder && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <Folder className="w-3.5 h-3.5 text-brand" />
                                    Criando subpasta dentro de <span className="font-mono text-brand">{defaultFolder}/</span>
                                </p>
                            )}
                            <input
                                type="text"
                                value={folderName}
                                onChange={(e) => setFolderName(e.target.value)}
                                placeholder="ex: tests ou tests/basic"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                                className="w-full bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50"
                            />
                            {normFolder && (
                                <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2.5">
                                    <Folder className="w-4 h-4 text-brand shrink-0" />
                                    <span className="text-sm font-mono text-brand">{normFolder}/</span>
                                    <span className="text-[11px] text-muted-foreground ml-1">
                                        pasta destacada — importe testes dentro dela depois
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <DropZone
                            mode={mode}
                            dragActive={dragActive}
                            importing={importing}
                            files={files}
                            zipFile={zipFile}
                            onDragOver={() => setDragActive(true)}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(dropped) => {
                                setDragActive(false);
                                if (mode === 'zip') {
                                    const zip = dropped.find(f => f.name.toLowerCase().endsWith('.zip'));
                                    if (zip) setZipFile(zip);
                                } else {
                                    setFiles(dropped.filter(f => /\.(ya?ml|json|js|ts)$/i.test(f.name)));
                                }
                            }}
                            onClick={() => {
                                if (mode === 'zip') {
                                    pickFiles(false, '.zip', (fs) => { if (fs[0]) setZipFile(fs[0]); });
                                } else {
                                    pickFiles(true, FILE_ACCEPT, (fs) =>
                                        setFiles(fs.filter(f => /\.(ya?ml|json|js|ts)$/i.test(f.name))));
                                }
                            }}
                        />
                    )}

                    {/* Status */}
                    {importStatus.type !== 'idle' && (
                        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                            importStatus.type === 'error'
                                ? 'bg-danger/10 border border-danger/20 text-danger'
                                : 'bg-success/10 border border-success/20 text-success'
                        }`}>
                            {importStatus.type === 'error'
                                ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span>{importStatus.message}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSubmit || importing}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                        {mode === 'folder' ? 'Criar pasta' : 'Importar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ModeCard({
    active, icon: Icon, title, desc, onClick,
}: {
    active: boolean;
    icon: ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all ${
                active
                    ? 'border-brand/60 bg-brand/10 ring-1 ring-brand/40'
                    : 'border-border bg-foreground/[0.02] hover:bg-foreground/5'
            }`}
        >
            <Icon className={`w-5 h-5 ${active ? 'text-brand' : 'text-muted-foreground'}`} />
            <span className="text-sm font-bold text-foreground">{title}</span>
            <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
        </button>
    );
}

function DropZone({
    mode, dragActive, importing, files, zipFile, onDragOver, onDragLeave, onDrop, onClick,
}: {
    mode: 'zip' | 'files';
    dragActive: boolean;
    importing: boolean;
    files: File[];
    zipFile: File | null;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: (files: File[]) => void;
    onClick: () => void;
}) {
    const hasSelection = mode === 'zip' ? !!zipFile : files.length > 0;
    return (
        <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragActive ? 'border-brand bg-brand/5 scale-[1.01]' : 'border-border hover:bg-foreground/[0.02]'
            }`}
            onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
            onDragLeave={onDragLeave}
            onDrop={(e) => { e.preventDefault(); onDrop(Array.from(e.dataTransfer.files)); }}
            onClick={onClick}
        >
            {importing ? (
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-brand animate-spin" />
                    <p className="text-sm text-foreground font-medium">Importando...</p>
                </div>
            ) : hasSelection ? (
                <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-brand/20 text-brand">
                        {mode === 'zip' ? <FileArchive className="w-7 h-7" /> : <FileCode2 className="w-7 h-7" />}
                    </div>
                    {mode === 'zip' ? (
                        <p className="text-sm font-medium text-foreground">{zipFile?.name}</p>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-foreground">{files.length} arquivo(s) selecionado(s)</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                                {files.map(f => f.name).join(', ')}
                            </p>
                        </>
                    )}
                    <p className="text-[11px] text-muted-foreground">Clique para trocar a seleção</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <UploadCloud className="w-9 h-9 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            {mode === 'zip' ? 'Selecione o arquivo .zip' : 'Selecione arquivos de teste'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {mode === 'zip'
                                ? 'A estrutura de pastas do ZIP será recriada no projeto'
                                : '.yaml, .json, .js, .ts — adicionados à lista de testes do projeto'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
