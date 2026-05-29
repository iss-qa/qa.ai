'use client';

import { useState, useEffect } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Project {
    id: string;
    name: string;
}

interface SaveRecordingModalProps {
    isOpen: boolean;
    stepCount: number;
    durationSeconds: number;
    currentProjectId?: string | null;
    onSave: (testName: string, projectId: string, yamlContent?: string) => void;
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
            .select('id, name')
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

    if (!isOpen) return null;

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-bold text-foreground">Salvar Teste Gravado</h2>
                    <button
                        onClick={onCancel}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4">
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

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            if (!testName.trim()) {
                                alert('Informe o nome do teste');
                                return;
                            }
                            onSave(testName.trim(), projectId, engine === 'maestro' ? editableYaml : undefined);
                        }}
                        className="flex items-center gap-2 px-5 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm shadow-green-500/20"
                    >
                        <Save className="w-4 h-4" />
                        Salvar Teste
                    </button>
                </div>
            </div>
        </div>
    );
}
