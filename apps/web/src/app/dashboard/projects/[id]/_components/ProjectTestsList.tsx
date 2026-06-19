'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    FlaskConical, Trash2, Download, Wand2, Play, ChevronRight,
    Folder, FolderOpen, UploadCloud, FolderInput, FolderPlus,
    MoreHorizontal, FileCode2, X, Copy, Check, CheckSquare, Square, Layers, CalendarClock,
} from 'lucide-react';
import type { TestCase, TestTreeNode } from '../project-types';

// IDs de todos os testes de uma sub-árvore (pasta + subpastas) — usado pelo
// "selecionar pasta inteira".
function collectTestIds(node: TestTreeNode): string[] {
    return [
        ...node.tests.map(t => t.id),
        ...node.folders.flatMap(collectTestIds),
    ];
}

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
    // Executa em lote os IDs selecionados (implementado pela página: device + API).
    onRunBatch: (testIds: string[]) => void;
    // Abre o modal de agendamento com os IDs selecionados.
    onScheduleBatch: (testIds: string[]) => void;
    // Quando há busca ativa, força todas as pastas expandidas (mostra matches).
    forceExpand?: boolean;
}

export function ProjectTestsList({
    projectId, tree, totalCount,
    onDeleteTest, onExportYaml, onOpenStudio, onMoveTest, onImportIntoFolder, onCreateSubfolder, onDeleteFolder, onRunBatch, onScheduleBatch, forceExpand = false,
}: ProjectTestsListProps) {
    // Modal "Ver código YAML": evita exportar só para inspecionar o YAML.
    const [yamlViewTest, setYamlViewTest] = useState<TestCase | null>(null);

    // Seleção múltipla para execução em lote (Set de test_case.id).
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    // Marca/desmarca um conjunto de IDs de uma vez (usado por "selecionar pasta").
    const setManySelected = (ids: string[], on: boolean) => {
        setSelected(prev => {
            const next = new Set(prev);
            ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
            return next;
        });
    };
    const clearSelection = () => setSelected(new Set());

    // Estado de expansão das pastas persistido por sessão (sessionStorage):
    // ao abrir um teste no Editor e voltar, a árvore reabre como estava — sem
    // forçar o usuário a reexpandir tudo. Sessão nova = tudo recolhido (default).
    const expandKey = `qamind-tree-expanded:${projectId}`;
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = sessionStorage.getItem(expandKey);
            return raw ? new Set<string>(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    });
    const toggleFolder = (path: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            try { sessionStorage.setItem(expandKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
            return next;
        });
    };

    if (totalCount === 0 && tree.folders.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Nenhum teste neste projeto</p>
                <p className="text-xs mt-1 opacity-70">Importe testes, crie no editor ou grave um novo</p>
            </div>
        );
    }

    // Busca ativa sem resultados.
    if (forceExpand && tree.tests.length === 0 && tree.folders.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Nenhum teste encontrado para a busca</p>
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
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onDeleteTest={onDeleteTest}
                    onExportYaml={onExportYaml}
                    onOpenStudio={onOpenStudio}
                    onMoveTest={onMoveTest}
                    onViewYaml={setYamlViewTest}
                />
            ))}
            {/* Pastas de 1º nível */}
            {tree.folders.map((folder) => (
                <FolderNode
                    key={folder.path}
                    node={folder}
                    depth={0}
                    projectId={projectId}
                    expanded={expanded}
                    forceExpand={forceExpand}
                    onToggle={toggleFolder}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onToggleFolderSelect={setManySelected}
                    onDeleteTest={onDeleteTest}
                    onExportYaml={onExportYaml}
                    onOpenStudio={onOpenStudio}
                    onMoveTest={onMoveTest}
                    onViewYaml={setYamlViewTest}
                    onImportIntoFolder={onImportIntoFolder}
                    onCreateSubfolder={onCreateSubfolder}
                    onDeleteFolder={onDeleteFolder}
                />
            ))}

            {yamlViewTest && (
                <YamlViewModal test={yamlViewTest} onClose={() => setYamlViewTest(null)} />
            )}

            {/* Barra de ação de seleção em lote (fixa no rodapé) */}
            {selected.size > 0 && (
                <BatchActionBar
                    count={selected.size}
                    onRun={() => { onRunBatch(Array.from(selected)); }}
                    onSchedule={() => { onScheduleBatch(Array.from(selected)); }}
                    onClear={clearSelection}
                />
            )}
        </div>
    );
}

function BatchActionBar({ count, onRun, onSchedule, onClear }: { count: number; onRun: () => void; onSchedule: () => void; onClear: () => void }) {
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-popover border border-border rounded-2xl shadow-2xl px-4 py-2.5">
            <span className="inline-flex items-center gap-2 text-sm text-foreground">
                <Layers className="w-4 h-4 text-brand" />
                <span className="font-bold tabular-nums">{count}</span> selecionado{count === 1 ? '' : 's'}
            </span>
            <button
                onClick={onClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
                Limpar
            </button>
            <button
                onClick={onSchedule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
            >
                <CalendarClock className="w-3.5 h-3.5" /> Agendar
            </button>
            <button
                onClick={onRun}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-colors"
            >
                <Play className="w-3.5 h-3.5 fill-current" /> Executar em lote
            </button>
        </div>
    );
}

// Conta recursivamente todos os testes de uma sub-árvore.
function countTests(node: TestTreeNode): number {
    return node.tests.length + node.folders.reduce((sum, f) => sum + countTests(f), 0);
}

function FolderNode({
    node, depth, projectId, expanded, forceExpand, onToggle, selected, onToggleSelect, onToggleFolderSelect, onDeleteTest, onExportYaml, onOpenStudio, onMoveTest, onViewYaml, onImportIntoFolder, onCreateSubfolder, onDeleteFolder,
}: {
    node: TestTreeNode;
    depth: number;
    projectId: string;
    expanded: Set<string>;
    forceExpand?: boolean;
    onToggle: (path: string) => void;
    selected: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleFolderSelect: (ids: string[], on: boolean) => void;
    onDeleteTest: (e: React.MouseEvent, id: string) => void;
    onExportYaml: (e: React.MouseEvent, test: TestCase) => void;
    onOpenStudio: (e: React.MouseEvent, test: TestCase) => void;
    onMoveTest: (test: TestCase) => void;
    onViewYaml: (test: TestCase) => void;
    onImportIntoFolder: (path: string) => void;
    onCreateSubfolder: (parentPath: string) => void;
    onDeleteFolder: (path: string) => void;
}) {
    // Expansão controlada pelo pai (persistida por sessão). Default = recolhida.
    // Busca ativa força expandido para mostrar os resultados.
    const open = forceExpand || expanded.has(node.path);
    const total = countTests(node);
    const indent = { paddingLeft: `${16 + depth * 16}px` };
    // Seleção da pasta inteira: todos os testes da sub-árvore.
    const folderTestIds = collectTestIds(node);
    const allSelected = folderTestIds.length > 0 && folderTestIds.every(id => selected.has(id));
    const someSelected = !allSelected && folderTestIds.some(id => selected.has(id));

    return (
        <div>
            {/* Cabeçalho da pasta — cor destacada (brand) */}
            <div
                className="flex items-center justify-between py-2.5 pr-4 bg-brand/5 hover:bg-brand/10 border-l-2 border-brand/50 transition-colors cursor-pointer"
                style={indent}
                onClick={() => onToggle(node.path)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {folderTestIds.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleFolderSelect(folderTestIds, !allSelected); }}
                            title={allSelected ? 'Desmarcar pasta' : 'Selecionar pasta inteira'}
                            className="shrink-0 text-muted-foreground hover:text-brand transition-colors"
                        >
                            {allSelected
                                ? <CheckSquare className="w-4 h-4 text-brand" />
                                : <Square className={`w-4 h-4 ${someSelected ? 'text-brand/60' : ''}`} />}
                        </button>
                    )}
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
                            expanded={expanded}
                            forceExpand={forceExpand}
                            onToggle={onToggle}
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            onToggleFolderSelect={onToggleFolderSelect}
                            onDeleteTest={onDeleteTest}
                            onExportYaml={onExportYaml}
                            onOpenStudio={onOpenStudio}
                            onMoveTest={onMoveTest}
                            onViewYaml={onViewYaml}
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
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            onDeleteTest={onDeleteTest}
                            onExportYaml={onExportYaml}
                            onOpenStudio={onOpenStudio}
                            onMoveTest={onMoveTest}
                            onViewYaml={onViewYaml}
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
    test, projectId, indentPx = 16, selected, onToggleSelect, onDeleteTest, onExportYaml, onOpenStudio, onMoveTest, onViewYaml,
}: {
    test: TestCase;
    projectId: string;
    indentPx?: number;
    selected: Set<string>;
    onToggleSelect: (id: string) => void;
    onDeleteTest: (e: React.MouseEvent, id: string) => void;
    onExportYaml: (e: React.MouseEvent, test: TestCase) => void;
    onOpenStudio: (e: React.MouseEvent, test: TestCase) => void;
    onMoveTest: (test: TestCase) => void;
    onViewYaml: (test: TestCase) => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = () => setMenuOpen(false);
    // Evita navegar (a linha é um Link) ao clicar em ações.
    const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const isSelected = selected.has(test.id);

    return (
        <Link
            href={`/dashboard/tests/editor?projectId=${projectId}&testId=${test.id}`}
            className={`pr-4 py-3 flex items-center justify-between transition-colors cursor-pointer ${isSelected ? 'bg-brand/5' : 'hover:bg-accent'}`}
            style={{ paddingLeft: `${indentPx}px` }}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <button
                    onClick={(e) => { stop(e); onToggleSelect(test.id); }}
                    title={isSelected ? 'Desmarcar' : 'Selecionar para lote'}
                    className="shrink-0 text-muted-foreground hover:text-brand transition-colors"
                >
                    {isSelected ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
                </button>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{test.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {Array.isArray(test.steps) ? `${test.steps.length} passos` : ''} • {test.last_run_at ? `Ultima exec: ${new Date(test.last_run_at).toLocaleDateString('pt-BR')}` : 'Nunca executado'}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${test.status === 'passed' ? 'bg-green-500/20 text-green-400' : test.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-muted-foreground'}`}>
                    {test.status === 'passed' ? 'Sucesso' : test.status === 'failed' ? 'Falha' : 'Pendente'}
                </span>
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

                {/* Menu de ações (3 pontinhos) — agrupa o que não é Studio/Editor. */}
                <div className="relative shrink-0">
                    <button
                        onClick={(e) => { stop(e); setMenuOpen(v => !v); }}
                        title="Mais ações"
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors border border-transparent hover:border-border"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={(e) => { stop(e); closeMenu(); }} />
                            <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-popover border border-border rounded-lg shadow-xl py-1">
                                <RowMenuItem
                                    icon={<FileCode2 className="w-4 h-4" />}
                                    label="Ver código YAML"
                                    onClick={(e) => { stop(e); closeMenu(); onViewYaml(test); }}
                                />
                                <RowMenuItem
                                    icon={<Download className="w-4 h-4" />}
                                    label="Exportar YAML"
                                    onClick={(e) => { stop(e); closeMenu(); onExportYaml(e, test); }}
                                />
                                <RowMenuItem
                                    icon={<FolderInput className="w-4 h-4" />}
                                    label="Mover para outra pasta"
                                    onClick={(e) => { stop(e); closeMenu(); onMoveTest(test); }}
                                />
                                <div className="my-1 border-t border-border" />
                                <RowMenuItem
                                    icon={<Trash2 className="w-4 h-4" />}
                                    label="Excluir"
                                    danger
                                    onClick={(e) => { stop(e); closeMenu(); onDeleteTest(e, test.id); }}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Link>
    );
}

function RowMenuItem({ icon, label, onClick, danger = false }: {
    icon: React.ReactNode;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
                danger
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-foreground hover:bg-foreground/5'
            }`}
        >
            <span className={danger ? 'text-danger' : 'text-muted-foreground'}>{icon}</span>
            {label}
        </button>
    );
}

// Modal de leitura do YAML do teste — inspecionar sem precisar exportar.
function YamlViewModal({ test, onClose }: { test: TestCase; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const yaml = (typeof test.raw_yaml === 'string' && test.raw_yaml.trim())
        ? test.raw_yaml
        : '# Este teste não tem YAML salvo (raw_yaml vazio).';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(yaml);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard indisponível */ }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileCode2 className="w-4 h-4 text-brand shrink-0" />
                        <span className="text-sm font-bold text-foreground truncate">{test.name}</span>
                        {test.workspace_path && (
                            <span className="text-[11px] font-mono text-muted-foreground truncate hidden sm:inline">{test.workspace_path}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={copy}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copiado' : 'Copiar'}
                        </button>
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent" aria-label="Fechar">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-4">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">{yaml}</pre>
                </div>
            </div>
        </div>
    );
}
