'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Play, Plus, FlaskConical, Loader2, LayoutGrid, Edit2, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Project {
    id: string;
    name: string;
    description: string;
    platform: string;
    status: string;
}

interface TestCase {
    id: string;
    name: string;
    status: string;
    last_run_at: string | null;
    platform: string;
}

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tests, setTests] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', platform: 'android', status: 'Ativo' });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const fetchProject = async () => {
        try {
            const { data: proj, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (error) throw error;
            setProject(proj);
            setFormData({
                name: proj.name,
                description: proj.description,
                platform: proj.platform || 'android',
                status: proj.status
            });

            const { data: testData } = await supabase
                .from('test_cases')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            setTests(testData || []);
        } catch (error) {
            console.error('Error fetching project:', error);
            // Fallback mock data
            setProject({
                id: projectId,
                name: 'Projeto Demo',
                description: 'Projeto de demonstração',
                platform: 'android',
                status: 'Ativo'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProject();
    }, [projectId]);

    const handleSaveEdit = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('projects')
                .update({
                    name: formData.name,
                    description: formData.description,
                    platform: formData.platform,
                    status: formData.status
                })
                .eq('id', projectId);
            if (error) throw error;
            setEditModalOpen(false);
            fetchProject();
        } catch (error) {
            console.error('Error updating project:', error);
            alert('Erro ao atualizar projeto.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            const { error } = await supabase.from('projects').delete().eq('id', projectId);
            if (error) throw error;
            router.push('/dashboard/projects');
        } catch (error) {
            console.error('Error deleting project:', error);
            alert('Erro ao excluir projeto.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="p-8 text-center text-slate-400">
                <p>Projeto não encontrado.</p>
                <Link href="/dashboard/projects" className="text-brand hover:underline mt-2 inline-block">
                    ← Voltar para Projetos
                </Link>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/projects" className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                            <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                            <p className="text-textSecondary/80 text-sm">{project.description}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditModalOpen(true)}
                        className="px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2 border border-white/10"
                    >
                        <Edit2 className="w-4 h-4" /> Editar
                    </button>
                    <button
                        onClick={() => setDeleteConfirm(true)}
                        className="px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2 border border-red-500/20"
                    >
                        <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TOTAL TESTES</p>
                    <p className="text-2xl font-bold text-white mt-1">{tests.length}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PLATAFORMA</p>
                    <p className="text-2xl font-bold text-white mt-1 capitalize">{project.platform}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">STATUS</p>
                    <p className={`text-2xl font-bold mt-1 ${project.status === 'Ativo' ? 'text-green-400' : 'text-slate-400'}`}>{project.status}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ÚLTIMA EXECUÇÃO</p>
                    <p className="text-2xl font-bold text-slate-400 mt-1">—</p>
                </div>
            </div>

            {/* Tests List */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-brand" />
                        Testes do Projeto ({tests.length})
                    </span>
                    <Link
                        href={`/dashboard/tests/editor?projectId=${projectId}`}
                        className="bg-brand text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90 transition-all flex items-center gap-1.5"
                    >
                        <Plus className="w-3 h-3" /> Novo Teste
                    </Link>
                </div>

                {tests.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">Nenhum teste neste projeto</p>
                        <p className="text-xs mt-1 opacity-70">Crie testes no editor e vincule a este projeto</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {tests.map((test) => (
                            <div key={test.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                                <div>
                                    <p className="text-sm font-bold text-white">{test.name}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{test.platform} • {test.last_run_at ? `Última exec: ${test.last_run_at}` : 'Nunca executado'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${test.status === 'passed' ? 'bg-green-500/20 text-green-400' : test.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                        {test.status === 'passed' ? 'Sucesso' : test.status === 'failed' ? 'Falha' : 'Pendente'}
                                    </span>
                                    <button className="p-1.5 hover:bg-brand/10 text-brand rounded transition-colors" title="Executar">
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Projeto?</h3>
                        <p className="text-sm text-slate-400 mb-6">O projeto "{project.name}" será excluído permanentemente.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setEditModalOpen(false)} className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                        <div className="p-6 border-b border-white/10">
                            <h2 className="text-xl font-bold text-white">Editar Projeto</h2>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</label>
                                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</label>
                                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50 resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plataforma</label>
                                    <select value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50">
                                        <option value="android">Android</option>
                                        <option value="ios">iOS</option>
                                        <option value="web">Web</option>
                                        <option value="multi">Multi-plataforma</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50">
                                        <option value="Ativo">Ativo</option>
                                        <option value="Arquivado">Arquivado</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 pt-2 flex gap-3 justify-end">
                            <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={handleSaveEdit} disabled={saving || !formData.name.trim()} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
