'use client';

import { useState } from 'react';
import {
    X, FolderInput, Folder, FolderOpen, ChevronRight, Home, Check, Loader2, AlertTriangle,
} from 'lucide-react';
import type { TestCase, TestTreeNode } from '../project-types';
import { normalizeFolderPath } from '../project-utils';

interface MoveStatus {
    type: 'idle' | 'error';
    message: string;
}

interface MoveTestModalProps {
    test: TestCase;
    tree: TestTreeNode;           // raiz do projeto (para listar as pastas destino)
    moving: boolean;
    status: MoveStatus;
    onClose: () => void;
    onConfirm: (destFolder: string) => void;
}

export function MoveTestModal({ test, tree, moving, status, onClose, onConfirm }: MoveTestModalProps) {
    const currentFolder = normalizeFolderPath(test.folder_path);
    const [dest, setDest] = useState<string>(currentFolder);
    const unchanged = normalizeFolderPath(dest) === currentFolder;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                        <FolderInput className="w-5 h-5 text-brand shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-foreground truncate">Mover teste</h2>
                            <p className="text-xs text-muted-foreground truncate">
                                {test.name}
                                {currentFolder && <span className="font-mono"> · de {currentFolder}/</span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pasta de destino</p>

                    <div className="rounded-lg border border-border bg-foreground/5 max-h-64 overflow-y-auto custom-scrollbar py-1">
                        {/* Raiz */}
                        <DestRow
                            icon={Home}
                            label="Testes do Projeto (raiz)"
                            depth={0}
                            selected={normalizeFolderPath(dest) === ''}
                            isCurrent={currentFolder === ''}
                            onSelect={() => setDest('')}
                        />
                        {tree.folders.map(f => (
                            <FolderRow
                                key={f.path}
                                node={f}
                                depth={0}
                                dest={normalizeFolderPath(dest)}
                                currentFolder={currentFolder}
                                onSelect={setDest}
                            />
                        ))}
                    </div>

                    {status.type === 'error' && (
                        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-danger/10 border border-danger/20 text-danger">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{status.message}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(normalizeFolderPath(dest))}
                        disabled={moving || unchanged}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                        title={unchanged ? 'Selecione uma pasta diferente da atual' : 'Mover para a pasta selecionada'}
                    >
                        {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
                        Mover
                    </button>
                </div>
            </div>
        </div>
    );
}

function FolderRow({
    node, depth, dest, currentFolder, onSelect,
}: {
    node: TestTreeNode;
    depth: number;
    dest: string;
    currentFolder: string;
    onSelect: (path: string) => void;
}) {
    const [open, setOpen] = useState(true);
    const hasChildren = node.folders.length > 0;
    return (
        <div>
            <div
                className={`flex items-center gap-1 transition-colors ${
                    dest === node.path ? 'bg-brand/15' : 'hover:bg-accent'
                }`}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
            >
                <button
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    className={`p-0.5 ${hasChildren ? 'text-brand' : 'opacity-0 pointer-events-none'}`}
                >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                <button
                    type="button"
                    onClick={() => onSelect(node.path)}
                    className="flex items-center gap-1.5 py-1.5 pr-3 text-left flex-1 min-w-0"
                >
                    {open ? <FolderOpen className="w-3.5 h-3.5 text-brand shrink-0" /> : <Folder className="w-3.5 h-3.5 text-brand shrink-0" />}
                    <span className={`text-xs font-bold truncate ${dest === node.path ? 'text-brand' : 'text-foreground'}`}>{node.name}/</span>
                    {node.path === currentFolder && (
                        <span className="text-[10px] text-muted-foreground font-normal">(atual)</span>
                    )}
                    {dest === node.path && <Check className="w-3.5 h-3.5 text-brand ml-auto shrink-0" />}
                </button>
            </div>
            {open && node.folders.map(child => (
                <FolderRow
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    dest={dest}
                    currentFolder={currentFolder}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}

function DestRow({
    icon: Icon, label, depth, selected, isCurrent, onSelect,
}: {
    icon: typeof Home;
    label: string;
    depth: number;
    selected: boolean;
    isCurrent: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full flex items-center gap-1.5 py-1.5 pr-3 text-left transition-colors ${
                selected ? 'bg-brand/15' : 'hover:bg-accent'
            }`}
            style={{ paddingLeft: `${8 + depth * 14 + 20}px` }}
        >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-brand' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-bold truncate ${selected ? 'text-brand' : 'text-foreground'}`}>{label}</span>
            {isCurrent && <span className="text-[10px] text-muted-foreground font-normal">(atual)</span>}
            {selected && <Check className="w-3.5 h-3.5 text-brand ml-auto shrink-0" />}
        </button>
    );
}
