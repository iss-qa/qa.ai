'use client';

import { useState } from 'react';
import { X, Loader2, FolderSearch } from 'lucide-react';
import { pickWorkspaceDirectory } from '@/lib/workspace';

interface ProjectFormData {
    name: string;
    description: string;
    platform: string;
    status: string;
    workspace_path: string;
}

interface EditProjectModalProps {
    formData: ProjectFormData;
    setFormData: React.Dispatch<React.SetStateAction<ProjectFormData>>;
    saving: boolean;
    onClose: () => void;
    onSave: () => void;
}

export function EditProjectModal({
    formData,
    setFormData,
    saving,
    onClose,
    onSave,
}: EditProjectModalProps) {
    const [pickingWorkspace, setPickingWorkspace] = useState(false);

    const handlePickWorkspace = async () => {
        setPickingWorkspace(true);
        try {
            const path = await pickWorkspaceDirectory();
            if (path) setFormData(f => ({ ...f, workspace_path: path }));
        } finally {
            setPickingWorkspace(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground">Editar Projeto</h2>
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nome</label>
                        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Descrição</label>
                        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50 resize-none" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Workspace (pasta dos testes YAML)</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={formData.workspace_path}
                                onChange={(e) => setFormData({ ...formData, workspace_path: e.target.value })}
                                placeholder="Ex: /Users/voce/projetos/meu-workspace"
                                className="flex-1 min-w-0 bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 font-mono"
                            />
                            <button
                                type="button"
                                onClick={handlePickWorkspace}
                                disabled={pickingWorkspace}
                                title="Selecionar pasta existente ou criar uma nova"
                                className="px-3 py-2.5 bg-foreground/5 border border-border rounded-lg text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors disabled:opacity-50"
                            >
                                {pickingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Pasta local usada pelo gravador e pelo Maestro Studio para salvar os YAMLs deste projeto.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Plataforma</label>
                            <select value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50">
                                <option value="android">Android</option>
                                <option value="ios">iOS</option>
                                <option value="web">Web</option>
                                <option value="multi">Multi-plataforma</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</label>
                            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="bg-foreground/5 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand/50">
                                <option value="Ativo">Ativo</option>
                                <option value="Arquivado">Arquivado</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="p-6 pt-2 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                    <button onClick={onSave} disabled={saving || !formData.name.trim()} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
    );
}
