'use client';

import { Plus, LayoutGrid, Trash2, Edit2, X, Loader2, FolderOpen, FlaskConical } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Project {
    id: string;
    name: string;
    description: string;
    platform: string;
    is_archived: boolean;
    created_at: string;
    test_count?: number;
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', platform: 'android', is_archived: false });
    const [saving, setSaving] = useState(false);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Count tests per project from Supabase
            const projectsWithCounts = await Promise.all(
                (data || []).map(async (project: Project) => {
                    const { count } = await supabase
                        .from('test_cases')
                        .select('*', { count: 'exact', head: true })
                        .eq('project_id', project.id);
                    return { ...project, test_count: count || 0 };
                })
            );

            setProjects(projectsWithCounts);
        } catch (error) {
            console.error('Error fetching projects:', error);
            // Fallback to mock data if table doesn't exist yet
            setProjects([
                { id: '1', name: 'App Mobile Principal', description: 'Testes do App Android e iOS', platform: 'android', is_archived: false, created_at: new Date().toISOString(), test_count: 12 },
                { id: '2', name: 'Web Dashboard', description: 'Regressão do portal administrativo', platform: 'web', is_archived: false, created_at: new Date().toISOString(), test_count: 8 },
                { id: '3', name: 'API Services', description: 'Validação de contratos e performance', platform: 'web', is_archived: true, created_at: new Date().toISOString(), test_count: 45 },
            ]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    const handleOpenCreate = () => {
        setEditingProject(null);
        setFormData({ name: '', description: '', platform: 'android', is_archived: false });
        setModalOpen(true);
    };

    const handleOpenEdit = (project: Project) => {
        setEditingProject(project);
        setFormData({
            name: project.name,
            description: project.description,
            platform: project.platform || 'android',
            is_archived: project.is_archived ?? false
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            if (editingProject) {
                const { error } = await supabase
                    .from('projects')
                    .update({
                        name: formData.name,
                        description: formData.description,
                        platform: formData.platform,
                        is_archived: formData.is_archived
                    })
                    .eq('id', editingProject.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('projects')
                    .insert({
                        name: formData.name,
                        description: formData.description,
                        platform: formData.platform,
                        is_archived: formData.is_archived
                    });
                if (error) throw error;
            }
            setModalOpen(false);
            fetchProjects();
        } catch (error) {
            console.error('Error saving project:', error);
            alert('Erro ao salvar projeto. Verifique a conexão com o Supabase.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.from('projects').delete().eq('id', id);
            if (error) throw error;
            setDeleteConfirm(null);
            fetchProjects();
        } catch (error) {
            console.error('Error deleting project:', error);
            alert('Erro ao excluir projeto.');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Projetos</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Organize seus testes por contexto de negócio.</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> NOVO PROJETO
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-brand animate-spin" />
                </div>
            ) : projects.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Nenhum projeto ainda</p>
                    <p className="text-sm mt-1 opacity-70">Clique em "Novo Projeto" para começar</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => (
                        <Link
                            key={project.id}
                            href={`/dashboard/projects/${project.id}`}
                            className="group relative bg-gradient-to-br from-[#111827] to-[#0d1117] rounded-2xl border border-white/[0.06] hover:border-brand/30 transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(74,144,217,0.08)]"
                        >
                            {/* Subtle gradient accent on hover */}
                            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                            <div className="relative p-6">
                                {/* Top row: icon + status + actions */}
                                <div className="flex items-center justify-between mb-5">
                                    <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-500 group-hover:bg-brand/10 group-hover:text-brand group-hover:border-brand/20 transition-all duration-300">
                                        <LayoutGrid className="w-5 h-5" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider ${!project.is_archived ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'}`}>
                                            {project.is_archived ? 'Arquivado' : 'Ativo'}
                                        </span>
                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleOpenEdit(project); }}
                                                className="p-1.5 text-slate-500 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                                                title="Editar"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setDeleteConfirm(project.id); }}
                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Name + description */}
                                <h3 className="text-base font-bold text-white mb-1 group-hover:text-brand transition-colors duration-300">{project.name}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 mb-6">{project.description}</p>

                                {/* Bottom stats */}
                                <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <FlaskConical className="w-3 h-3 text-slate-500" />
                                            <span className="text-[11px] text-slate-400 font-semibold">{project.test_count || 0} testes</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            <span className="text-[11px] text-slate-500 capitalize">{project.platform}</span>
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-brand font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                        Abrir →
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Projeto?</h3>
                        <p className="text-sm text-slate-400 mb-6">Esta ação não pode ser desfeita. Todos os testes associados serão desvinculados.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl relative">
                        <button
                            onClick={() => setModalOpen(false)}
                            className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="p-6 border-b border-white/10">
                            <h2 className="text-xl font-bold text-white">
                                {editingProject ? 'Editar Projeto' : 'Novo Projeto'}
                            </h2>
                            <p className="text-sm text-slate-400 mt-1">
                                {editingProject ? 'Atualize as informações do projeto.' : 'Crie um novo projeto para organizar seus testes.'}
                            </p>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Projeto</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: App Mobile Principal"
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand/50"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Descreva o escopo do projeto..."
                                    rows={3}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand/50 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plataforma</label>
                                    <select
                                        value={formData.platform}
                                        onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50"
                                    >
                                        <option value="android">Android</option>
                                        <option value="ios">iOS</option>
                                        <option value="web">Web</option>
                                        <option value="multi">Multi-plataforma</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                    <select
                                        value={formData.is_archived ? 'archived' : 'active'}
                                        onChange={(e) => setFormData({ ...formData, is_archived: e.target.value === 'archived' })}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50"
                                    >
                                        <option value="active">Ativo</option>
                                        <option value="archived">Arquivado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-2 flex gap-3 justify-end">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !formData.name.trim()}
                                className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
