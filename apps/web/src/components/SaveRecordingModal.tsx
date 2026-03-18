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
    onSave: (testName: string, projectId: string) => void;
    onCancel: () => void;
}

export function SaveRecordingModal({
    isOpen,
    stepCount,
    durationSeconds,
    currentProjectId,
    onSave,
    onCancel,
}: SaveRecordingModalProps) {
    const [testName, setTestName] = useState('');
    const [projectId, setProjectId] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTestName('');
        setLoadingProjects(true);

        // Fetch projects from Supabase
        supabase
            .from('projects')
            .select('id, name')
            .order('name')
            .then(({ data, error }) => {
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
            <div className="bg-[#0C0F1A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white">Salvar Teste Gravado</h2>
                    <button
                        onClick={onCancel}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Nome do teste
                        </label>
                        <input
                            type="text"
                            value={testName}
                            onChange={(e) => setTestName(e.target.value)}
                            placeholder="Ex: Login com credenciais validas"
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand/50"
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Projeto
                        </label>
                        {loadingProjects ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Carregando projetos...
                            </div>
                        ) : (
                            <select
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50"
                            >
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                        <div className="text-xs text-slate-400">
                            <span className="font-bold text-white">{stepCount}</span> passos gravados
                            <span className="mx-2 text-white/20">|</span>
                            <span className="font-bold text-white">{formatDuration(durationSeconds)}</span> de duracao
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            if (!testName.trim()) {
                                alert('Informe o nome do teste');
                                return;
                            }
                            onSave(testName.trim(), projectId);
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
