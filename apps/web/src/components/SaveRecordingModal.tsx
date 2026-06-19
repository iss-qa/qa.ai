'use client';

import { useState, useEffect } from 'react';
import { Save, X, Loader2, FolderSearch, Cloud, FolderTree, ChevronRight, Check, Folder, FolderOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { pickWorkspaceDirectory, workspaceRefFromProject, type WorkspaceRef } from '@/lib/workspace';

interface Project {
    id: string;
    name: string;
    workspace_type?: 'local' | 'supabase' | null;
    workspace_path?: string | null;
}

interface SaveRecordingModalProps {
    isOpen: boolean;
    stepCount: number;
    durationSeconds: number;
    currentProjectId?: string | null;
    // appId escolhido na gravação — usado para pré-selecionar o projeto certo.
    recordingAppId?: string;
    onSave: (testName: string, projectId: string, yamlContent?: string, workspaceRef?: WorkspaceRef | null, folderPath?: string) => void | Promise<void>;
    onCancel: () => void;
    engine?: 'uiautomator2' | 'maestro';
    maestroYaml?: string;
    yamlValidationError?: string;
}

export function SaveRecordingModal({
    isOpen,
    stepCount,
    durationSeconds,
    currentProjectId,
    recordingAppId = '',
    onSave,
    onCancel,
    engine = 'uiautomator2',
    maestroYaml = '',
    yamlValidationError = '',
}: SaveRecordingModalProps) {
    const [testName, setTestName] = useState('');
    const [projectId, setProjectId] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [editableYaml, setEditableYaml] = useState('');
    const [isEditingYaml, setIsEditingYaml] = useState(false);
    const [workspacePath, setWorkspacePath] = useState('');
    const [pickingWorkspace, setPickingWorkspace] = useState(false);
    // Pasta de destino dentro do projeto ('' = raiz) + pastas disponíveis.
    const [folderPath, setFolderPath] = useState('');
    const [folders, setFolders] = useState<string[]>([]);
    // Trava anti duplo-clique + spinner: sem isso o salvar parecia "morto"
    // (nenhum feedback) e cada clique extra criava um teste duplicado.
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (maestroYaml) setEditableYaml(maestroYaml);
    }, [maestroYaml]);

    useEffect(() => {
        if (!isOpen) return;
        setTestName('');
        setLoadingProjects(true);

        // Fetch projects from Supabase + escolhe o projeto certo.
        (async () => {
            const { data } = await supabase
                .from('projects')
                .select('id, name, workspace_type, workspace_path')
                .order('name');
            if (!data || data.length === 0) {
                setProjects([{ id: 'default', name: 'Projeto Padrao' }]);
                setProjectId('default');
                setLoadingProjects(false);
                return;
            }
            setProjects(data);

            // Prioridade na pré-seleção:
            // 1) projeto que JÁ tem testes com este appId (o usuário gravou o app X
            //    → cai no projeto do app X, não no 1º da lista);
            // 2) projeto do contexto (currentProjectId), se válido;
            // 3) primeiro da lista.
            let chosen = '';
            if (recordingAppId) {
                const { data: rows } = await supabase
                    .from('test_cases')
                    .select('project_id')
                    .eq('app_id', recordingAppId)
                    .not('project_id', 'is', null)
                    .limit(200);
                const tally = new Map<string, number>();
                for (const r of rows || []) {
                    const pid = r.project_id as string;
                    if (data.some(p => p.id === pid)) tally.set(pid, (tally.get(pid) || 0) + 1);
                }
                // Empate: prefere o contexto atual se estiver entre os candidatos.
                if (currentProjectId && tally.has(currentProjectId)) chosen = currentProjectId;
                else if (tally.size > 0) chosen = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0][0];
            }
            if (!chosen && currentProjectId && data.some(p => p.id === currentProjectId)) chosen = currentProjectId;
            if (!chosen) chosen = data[0].id;
            setProjectId(chosen);
            setLoadingProjects(false);
        })();
    }, [isOpen, currentProjectId, recordingAppId]);

    const selectedProject = projects.find(p => p.id === projectId);
    const wsType = selectedProject?.workspace_type || 'local';
    const isSupabaseWorkspace = wsType === 'supabase'; // nuvem — não usa pasta local

    // O workspace acompanha o projeto selecionado: pasta local (daemon) ou
    // pasta no Google Drive (api), onde o YAML deste teste será gravado.
    useEffect(() => {
        const proj = projects.find(p => p.id === projectId);
        setWorkspacePath(proj?.workspace_path || '');
    }, [projectId, projects]);

    // Carrega as pastas do projeto selecionado para o seletor de destino.
    useEffect(() => {
        if (!isOpen || !projectId || projectId === 'default') { setFolders([]); setFolderPath(''); return; }
        let cancelled = false;
        supabase
            .from('test_folders')
            .select('path')
            .eq('project_id', projectId)
            .order('path')
            .then(({ data }) => {
                if (cancelled) return;
                setFolders((data || []).map(r => r.path as string).filter(Boolean));
                setFolderPath('');   // default = raiz ao trocar de projeto
            });
        return () => { cancelled = true; };
    }, [isOpen, projectId]);

    const handlePickWorkspace = async () => {
        setPickingWorkspace(true);
        try {
            const path = await pickWorkspaceDirectory();
            if (path) setWorkspacePath(path);
        } finally {
            setPickingWorkspace(false);
        }
    };

    if (!isOpen) return null;

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const handleSubmit = async () => {
        if (saving) return;
        if (!testName.trim()) {
            alert('Informe o nome do teste');
            return;
        }
        // Resolve o destino do YAML conforme o tipo de workspace do projeto.
        const ref: WorkspaceRef | null = isSupabaseWorkspace
            ? workspaceRefFromProject(selectedProject || {})
            : (workspacePath.trim() ? { type: 'local', path: workspacePath.trim() } : null);

        if (!ref) {
            const proceed = confirm(
                'Nenhum workspace selecionado. Sem workspace, o YAML não será salvo e o botão "Studio" pedirá uma pasta depois.\n\nSalvar mesmo assim?'
            );
            if (!proceed) return;
        }
        setSaving(true);
        try {
            await onSave(
                testName.trim(),
                projectId,
                engine === 'maestro' ? editableYaml : undefined,
                ref,
                folderPath,
            );
        } catch (e) {
            // Mantém o modal aberto para o usuário corrigir e tentar de novo.
            alert('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <h2 className="text-lg font-bold text-foreground">Salvar Teste Gravado</h2>
                    <button
                        onClick={onCancel}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Nome do teste
                        </label>
                        <input
                            type="text"
                            value={testName}
                            onChange={(e) => setTestName(e.target.value)}
                            placeholder="Ex: Login com credenciais validas"
                            className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Projeto
                        </label>
                        {loadingProjects ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Carregando projetos...
                            </div>
                        ) : (
                            <select
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50"
                            >
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Pasta de destino
                        </label>
                        <FolderPicker
                            folders={folders}
                            value={folderPath}
                            onChange={setFolderPath}
                            disabled={projectId === 'default'}
                        />
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            {isSupabaseWorkspace
                                ? <Cloud className="w-3 h-3 text-brand shrink-0" />
                                : <FolderSearch className="w-3 h-3 text-brand shrink-0" />}
                            <span>
                                {isSupabaseWorkspace ? 'Nuvem do projeto (Supabase Storage)' : 'Workspace local'}
                                {' · '}
                                {folderPath ? <>em <span className="font-mono text-foreground">{folderPath}/</span></> : 'na raiz'}
                            </span>
                        </p>
                    </div>

                    {/* Workspace LOCAL precisa do caminho em disco; na nuvem é implícito. */}
                    {!isSupabaseWorkspace && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Pasta local do workspace
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={workspacePath}
                                    onChange={(e) => setWorkspacePath(e.target.value)}
                                    placeholder="Nenhum workspace definido para este projeto"
                                    className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={handlePickWorkspace}
                                    disabled={pickingWorkspace}
                                    title="Selecionar pasta existente ou criar uma nova"
                                    className="px-3 py-2.5 bg-background border border-border rounded-lg text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors disabled:opacity-50"
                                >
                                    {pickingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-foreground/5 border border-border rounded-lg px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                            <span className="font-bold text-foreground">{stepCount}</span> passos gravados
                            <span className="mx-2 text-foreground/20">|</span>
                            <span className="font-bold text-foreground">{formatDuration(durationSeconds)}</span> de duracao
                            {engine === 'maestro' && (
                                <span className="ml-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] font-bold rounded">maestro</span>
                            )}
                        </div>
                    </div>

                    {engine === 'maestro' && editableYaml && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    YAML Maestro
                                </label>
                                <button
                                    onClick={() => setIsEditingYaml(!isEditingYaml)}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    {isEditingYaml ? 'Visualizar' : 'Editar YAML'}
                                </button>
                            </div>
                            {isEditingYaml ? (
                                <textarea
                                    value={editableYaml}
                                    onChange={(e) => setEditableYaml(e.target.value)}
                                    className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-green-300 font-mono focus:outline-none focus:border-brand/50 min-h-[200px] resize-y"
                                    spellCheck={false}
                                />
                            ) : (
                                <pre className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-green-300 font-mono max-h-[200px] overflow-y-auto">
                                    {editableYaml}
                                </pre>
                            )}
                            {yamlValidationError && (
                                <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded px-2 py-1">
                                    {yamlValidationError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shadow-sm shadow-green-500/20"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Salvando…' : 'Salvar Teste'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Seletor de pasta em árvore (contido no modal) ──────────────────────────
// Substitui o <select> nativo (cujo dropdown do SO estourava a janela com
// caminhos longos). Mostra as pastas hierarquicamente; clicar no nome
// seleciona, clicar no chevron expande os filhos.

interface FolderNode { name: string; path: string; children: FolderNode[]; }

function buildFolderTree(paths: string[]): FolderNode[] {
    const root: FolderNode[] = [];
    const byPath = new Map<string, FolderNode>();
    // Ordena para garantir que pais venham antes dos filhos.
    for (const full of [...paths].sort()) {
        const segs = full.split('/').filter(Boolean);
        let acc = '';
        let level = root;
        for (const seg of segs) {
            acc = acc ? `${acc}/${seg}` : seg;
            let node = byPath.get(acc);
            if (!node) {
                node = { name: seg, path: acc, children: [] };
                byPath.set(acc, node);
                level.push(node);
            }
            level = node.children;
        }
    }
    return root;
}

function FolderPicker({ folders, value, onChange, disabled }: {
    folders: string[];
    value: string;
    onChange: (path: string) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const tree = buildFolderTree(folders);

    // Ao abrir, expande os ancestrais da seleção atual para mostrá-la.
    useEffect(() => {
        if (!open || !value) return;
        const segs = value.split('/').filter(Boolean);
        const acc: string[] = [];
        let cur = '';
        for (const s of segs) { cur = cur ? `${cur}/${s}` : s; acc.push(cur); }
        setExpanded(prev => new Set([...Array.from(prev), ...acc]));
    }, [open, value]);

    const toggle = (path: string) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
    });
    const pick = (path: string) => { onChange(path); setOpen(false); };

    const renderNodes = (nodes: FolderNode[], depth: number) => nodes.map(node => {
        const isOpen = expanded.has(node.path);
        const isSel = value === node.path;
        return (
            <div key={node.path}>
                <div
                    className={`flex items-center gap-1 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-brand/15' : 'hover:bg-foreground/5'}`}
                    style={{ paddingLeft: `${6 + depth * 14}px` }}
                >
                    <button
                        type="button"
                        onClick={() => node.children.length && toggle(node.path)}
                        className={`p-1 shrink-0 ${node.children.length ? 'text-muted-foreground hover:text-foreground' : 'opacity-0 pointer-events-none'}`}
                    >
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                    <button type="button" onClick={() => pick(node.path)} className="flex-1 flex items-center gap-1.5 py-1.5 pr-2 text-left min-w-0">
                        {isOpen ? <FolderOpen className="w-3.5 h-3.5 text-brand shrink-0" /> : <Folder className="w-3.5 h-3.5 text-brand shrink-0" />}
                        <span className={`text-xs truncate ${isSel ? 'text-brand font-semibold' : 'text-foreground'}`}>{node.name}</span>
                        {isSel && <Check className="w-3.5 h-3.5 text-brand ml-auto shrink-0" />}
                    </button>
                </div>
                {isOpen && node.children.length > 0 && renderNodes(node.children, depth + 1)}
            </div>
        );
    });

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => !disabled && setOpen(v => !v)}
                disabled={disabled}
                className="w-full flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50 disabled:opacity-60"
            >
                <FolderTree className="w-4 h-4 text-brand shrink-0" />
                <span className="truncate flex-1 text-left">{value ? `${value}/` : 'Raiz do projeto'}</span>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto custom-scrollbar bg-popover border border-border rounded-lg shadow-2xl py-1">
                        <button
                            type="button"
                            onClick={() => pick('')}
                            className={`w-full flex items-center gap-1.5 px-3 py-2 text-left ${value === '' ? 'bg-brand/15' : 'hover:bg-foreground/5'}`}
                        >
                            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className={`text-xs ${value === '' ? 'text-brand font-semibold' : 'text-foreground'}`}>Raiz do projeto</span>
                            {value === '' && <Check className="w-3.5 h-3.5 text-brand ml-auto" />}
                        </button>
                        {tree.length > 0 && <div className="my-1 border-t border-border" />}
                        {renderNodes(tree, 0)}
                        {tree.length === 0 && (
                            <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
                                Sem subpastas. Crie pastas pela tela do projeto (Importar Testes → Criar pasta).
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
