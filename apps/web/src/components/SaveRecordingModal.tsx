'use client';

import { useState, useEffect } from 'react';
import { Save, X, Loader2, FolderSearch, Cloud } from 'lucide-react';
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
    onSave: (testName: string, projectId: string, yamlContent?: string, workspaceRef?: WorkspaceRef | null) => void | Promise<void>;
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

        // Fetch projects from Supabase
        supabase
            .from('projects')
            .select('id, name, workspace_type, workspace_path')
            .order('name')
            .then(({ data }) => {
                if (data && data.length > 0) {
                    setProjects(data);
                    // Pre-select current project if available, otherwise first project
                    if (currentProjectId && data.some(p => p.id === currentProjectId)) {
                        setProjectId(currentProjectId);
                    } else {
                        setProjectId(data[0].id);
                    }
                } else {
                    setProjects([{ id: 'default', name: 'Projeto Padrao' }]);
                    setProjectId('default');
                }
                setLoadingProjects(false);
            });
    }, [isOpen, currentProjectId]);

    const selectedProject = projects.find(p => p.id === projectId);
    const wsType = selectedProject?.workspace_type || 'local';
    const isSupabaseWorkspace = wsType === 'supabase'; // nuvem — não usa pasta local

    // O workspace acompanha o projeto selecionado: pasta local (daemon) ou
    // pasta no Google Drive (api), onde o YAML deste teste será gravado.
    useEffect(() => {
        const proj = projects.find(p => p.id === projectId);
        setWorkspacePath(proj?.workspace_path || '');
    }, [projectId, projects]);

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
                            Workspace (pasta do YAML)
                        </label>
                        {isSupabaseWorkspace ? (
                            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2.5 text-xs">
                                <Cloud className="w-4 h-4 text-brand shrink-0" />
                                <span className="text-foreground">Nuvem (Supabase Storage) · pasta exclusiva do projeto</span>
                            </div>
                        ) : (
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
                        )}
                        <p className="text-[11px] text-muted-foreground">
                            {isSupabaseWorkspace
                                ? 'O YAML será gravado no Supabase Storage, numa pasta exclusiva deste projeto.'
                                : 'O YAML do teste será salvo nesta pasta (a mesma usada pelo Maestro Studio do projeto).'}
                        </p>
                    </div>

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
