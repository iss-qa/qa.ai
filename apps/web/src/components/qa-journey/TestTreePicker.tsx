'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FlaskConical, Check, X } from 'lucide-react';
import type { TestCaseOption } from '@/lib/qa-journey/api';

interface TreeNode {
    name: string;
    path: string;
    folders: TreeNode[];
    tests: TestCaseOption[];
}

const normalize = (p?: string | null): string =>
    (p || '').split('/').map(s => s.trim()).filter(Boolean).join('/');

function buildTree(options: TestCaseOption[]): TreeNode {
    const root: TreeNode = { name: '', path: '', folders: [], tests: [] };
    const getNode = (path: string): TreeNode => {
        const norm = normalize(path);
        if (!norm) return root;
        let node = root;
        let acc = '';
        for (const seg of norm.split('/')) {
            acc = acc ? `${acc}/${seg}` : seg;
            let child = node.folders.find(f => f.name === seg);
            if (!child) { child = { name: seg, path: acc, folders: [], tests: [] }; node.folders.push(child); }
            node = child;
        }
        return node;
    };
    for (const opt of options) getNode(normalize(opt.folder_path)).tests.push(opt);
    const sort = (n: TreeNode) => {
        n.folders.sort((a, b) => a.name.localeCompare(b.name));
        n.tests.sort((a, b) => a.name.localeCompare(b.name));
        n.folders.forEach(sort);
    };
    sort(root);
    return root;
}

interface TestTreePickerProps {
    testCases: TestCaseOption[];
    value: string | null;
    onChange: (id: string | null) => void;
}

export function TestTreePicker({ testCases, value, onChange }: TestTreePickerProps) {
    const tree = useMemo(() => buildTree(testCases), [testCases]);
    const selected = testCases.find(t => t.id === value) || null;
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Fecha ao clicar fora ou pressionar Esc.
    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (testCases.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-foreground/5 px-3 py-3 text-sm text-muted-foreground">
                — Nenhum teste Maestro no projeto —
            </div>
        );
    }

    const pick = (id: string) => { onChange(id); setOpen(false); };

    return (
        <div ref={rootRef} className="relative">
            {/* Trigger — recolhido, mostra só a seleção atual */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-foreground/5 px-3 py-2.5 text-left hover:border-brand/40 transition-colors"
            >
                <span className="text-sm truncate min-w-0">
                    {selected ? (
                        <span className="text-foreground font-medium flex items-center gap-1.5 min-w-0">
                            <FlaskConical className="w-4 h-4 text-brand shrink-0" />
                            {selected.folder_path && <span className="text-muted-foreground font-mono">{normalize(selected.folder_path)}/</span>}
                            <span className="truncate">{selected.name}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">— Selecione um teste —</span>
                    )}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                    {selected && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); onChange(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(null); } }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                            title="Limpar seleção"
                        >
                            <X className="w-3.5 h-3.5" />
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {/* Painel da árvore — só quando aberto; absoluto p/ não empurrar layout */}
            {open && (
                <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-2xl overflow-hidden">
                    <div className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                        {tree.tests.map(t => (
                            <TestLeaf key={t.id} test={t} depth={0} selected={t.id === value} onSelect={() => pick(t.id)} />
                        ))}
                        {tree.folders.map(f => (
                            <FolderNode key={f.path} node={f} depth={0} value={value} onSelect={pick} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function FolderNode({
    node, depth, value, onSelect,
}: {
    node: TreeNode;
    depth: number;
    value: string | null;
    onSelect: (id: string) => void;
}) {
    const [open, setOpen] = useState(true);
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-1.5 py-1.5 pr-3 text-left hover:bg-accent transition-colors"
                style={{ paddingLeft: `${12 + depth * 14}px` }}
            >
                <ChevronRight className={`w-3.5 h-3.5 text-brand transition-transform ${open ? 'rotate-90' : ''}`} />
                {open ? <FolderOpen className="w-3.5 h-3.5 text-brand" /> : <Folder className="w-3.5 h-3.5 text-brand" />}
                <span className="text-xs font-bold text-foreground">{node.name}/</span>
            </button>
            {open && (
                <div>
                    {node.folders.map(f => (
                        <FolderNode key={f.path} node={f} depth={depth + 1} value={value} onSelect={onSelect} />
                    ))}
                    {node.tests.map(t => (
                        <TestLeaf key={t.id} test={t} depth={depth + 1} selected={t.id === value} onSelect={() => onSelect(t.id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function TestLeaf({
    test, depth, selected, onSelect,
}: {
    test: TestCaseOption;
    depth: number;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full flex items-center gap-1.5 py-1.5 pr-3 text-left transition-colors ${
                selected ? 'bg-brand/15 text-brand' : 'hover:bg-accent text-foreground'
            }`}
            style={{ paddingLeft: `${12 + depth * 14 + 18}px` }}
        >
            <FlaskConical className={`w-3.5 h-3.5 ${selected ? 'text-brand' : 'text-muted-foreground'}`} />
            <span className="text-xs truncate flex-1">{test.name}</span>
            {selected && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
        </button>
    );
}
