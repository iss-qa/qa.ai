'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    FlaskConical, Trash2, Download, Wand2, Play, ChevronRight,
    Folder, FolderOpen, UploadCloud, FolderInput, FolderPlus,
} from 'lucide-react';
import type { TestCase, TestTreeNode } from '../project-types';

interface ProjectTestsListProps {
    projectId: string;
    tree: TestTreeNode;          // raiz: tests sem pasta + pastas de 1º nível
    totalCount: number;
    onDeleteTest: (e: React.MouseEvent, id: string) => void;
    onExportYaml: (e: React.MouseEvent, test: TestCase) => void;
    onOpenStudio: (e: React.MouseEvent, test: TestCase) => void;
    onMoveTest: (test: TestCase) => void;
    onImportIntoFolder: (path: string) => void;
    onCreateSubfolder: (parentPath: string) => void;
    onDeleteFolder: (path: string) => void;
}

export function ProjectTestsList({
    projectId, tree, totalCount,
    onDeleteTest, onExportYaml, onOpenStudio, onMoveTest, onImportIntoFolder, onCreateSubfolder, onDeleteFolder,
}: ProjectTestsListProps) {
    if (totalCount === 0 && tree.folders.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Nenhum teste neste projeto</p>
                <p className="text-xs mt-1 opacity-70">Importe testes, crie no editor ou grave um novo</p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-border">
            {/* Testes na raiz */}
            {tree.tests.map((test) => (
                <TestRow
                    key={test.id}
                    test={test}
                    projectId={projectId}
                    onDeleteTest={onDeleteTest}
                    onExportYaml={onExportYaml}
                    onOpenStudio={onOpenStudio}
                    onMoveTest={onMoveTest}
                />
            ))}
            {/* Pastas de 1º nível */}
            {tree.folders.map((folder) => (
                <FolderNode
                    key={folder.path}
                    node={folder}
                    depth={0}
                    projectId={projectId}
                    onDeleteTest={onDeleteTest}
                    onExportYaml={onExportYaml}
                    onOpenStudio={onOpenStudio}
                    onMoveTest={onMoveTest}
                    onImportIntoFolder={onImportIntoFolder}
                    onCreateSubfolder={onCreateSubfolder}
                    onDeleteFolder={onDeleteFolder}
                />
            ))}
        </div>
    );
}

// Conta recursivamente todos os testes de uma sub-árvore.
function countTests(node: TestTreeNode): number {
    return node.tests.length + node.folders.reduce((sum, f) => sum + countTests(f), 0);
}

function FolderNode({
    node, depth, projectId, onDeleteTest, onExportYaml, onOpenStudio, onMoveTest, onImportIntoFolder, onCreateSubfolder, onDeleteFolder,
}: {
    node: TestTreeNode;
    depth: number;
    projectId: string;
    onDeleteTest: (e: React.MouseEvent, id: string) => void;
    onExportYaml: (e: React.MouseEvent, test: TestCase) => void;
    onOpenStudio: (e: React.MouseEvent, test: TestCase) => void;
    onMoveTest: (test: TestCase) => void;
    onImportIntoFolder: (path: string) => void;
    onCreateSubfolder: (parentPath: string) => void;
    onDeleteFolder: (path: string) => void;
}) {
    const [open, setOpen] = useState(true);
    const total = countTests(node);
    const indent = { paddingLeft: `${16 + depth * 16}px` };

    return (
        <div>
            {/* Cabeçalho da pasta — cor destacada (brand) */}
            <div
                className="flex items-center justify-between py-2.5 pr-4 bg-brand/5 hover:bg-brand/10 border-l-2 border-brand/50 transition-colors cursor-pointer"
                style={indent}
                onClick={() => setOpen(v => !v)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={`w-4 h-4 text-brand transition-transform ${open ? 'rotate-90' : ''}`} />
                    {open ? <FolderOpen className="w-4 h-4 text-brand" /> : <Folder className="w-4 h-4 text-brand" />}
                    <span className="text-sm font-bold text-foreground truncate">{node.name}/</span>
                    <span className="text-[10px] font-medium text-muted-foreground bg-foreground/5 px-1.5 py-0.5 rounded">
                        {total} {total === 1 ? 'teste' : 'testes'}
                    </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onCreateSubfolder(node.path); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand/10 transition-colors"
                        title="Nova subpasta"
                    >
                        <FolderPlus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onImportIntoFolder(node.path); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand/10 transition-colors"
                        title="Importar testes nesta pasta"
                    >
                        <UploadCloud className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteFolder(node.path); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Excluir pasta (e seus testes)"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {open && (
                <div>
                    {node.folders.map((child) => (
                        <FolderNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            projectId={projectId}
                            onDeleteTest={onDeleteTest}
                            onExportYaml={onExportYaml}
                            onOpenStudio={onOpenStudio}
                            onMoveTest={onMoveTest}
                            onImportIntoFolder={onImportIntoFolder}
                            onCreateSubfolder={onCreateSubfolder}
                            onDeleteFolder={onDeleteFolder}
                        />
                    ))}
                    {node.tests.map((test) => (
                        <TestRow
                            key={test.id}
                            test={test}
                            projectId={projectId}
                            indentPx={16 + (depth + 1) * 16}
                            onDeleteTest={onDeleteTest}
                            onExportYaml={onExportYaml}
                            onOpenStudio={onOpenStudio}
                            onMoveTest={onMoveTest}
                        />
                    ))}
                    {total === 0 && (
                        <p className="text-xs text-muted-foreground py-3" style={{ paddingLeft: `${16 + (depth + 1) * 16}px` }}>
                            Pasta vazia — importe testes aqui.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function TestRow({
    test, projectId, indentPx = 16, onDeleteTest, onExportYaml, onOpenStudio, onMoveTest,
}: {
    test: TestCase;
    projectId: string;
    indentPx?: number;
    onDeleteTest: (e: React.MouseEvent, id: string) => void;
    onExportYaml: (e: React.MouseEvent, test: TestCase) => void;
    onOpenStudio: (e: React.MouseEvent, test: TestCase) => void;
    onMoveTest: (test: TestCase) => void;
}) {
    return (
        <Link
            href={`/dashboard/tests/editor?projectId=${projectId}&testId=${test.id}`}
            className="pr-4 py-3 flex items-center justify-between hover:bg-accent transition-colors cursor-pointer"
            style={{ paddingLeft: `${indentPx}px` }}
        >
            <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{test.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {Array.isArray(test.steps) ? `${test.steps.length} passos` : ''} • {test.last_run_at ? `Ultima exec: ${new Date(test.last_run_at).toLocaleDateString('pt-BR')}` : 'Nunca executado'}
                </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${test.status === 'passed' ? 'bg-green-500/20 text-green-400' : test.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-muted-foreground'}`}>
                    {test.status === 'passed' ? 'Sucesso' : test.status === 'failed' ? 'Falha' : 'Pendente'}
                </span>
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveTest(test); }}
                    className="p-2 hover:bg-foreground/10 text-muted-foreground hover:text-brand rounded-lg transition-colors border border-transparent hover:border-border"
                    title="Mover para outra pasta"
                >
                    <FolderInput className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => onDeleteTest(e, test.id)}
                    className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                    title="Excluir teste"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => onExportYaml(e, test)}
                    className="p-2 hover:bg-foreground/10 text-muted-foreground hover:text-amber-400 rounded-lg transition-colors border border-transparent hover:border-border"
                    title="Exportar YAML"
                >
                    <Download className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => onOpenStudio(e, test)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded-lg transition-colors border border-violet-500/20"
                    title="Abrir no Maestro Studio (edita o YAML com preview do device)"
                >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold">Studio</span>
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-colors border border-brand/20" title="Abrir no editor de passos">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span className="text-[11px] font-bold">Editor</span>
                </div>
            </div>
        </Link>
    );
}
