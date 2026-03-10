'use client';

import { Plus, LayoutGrid, List } from 'lucide-react';

const mockProjects = [
    { id: '1', name: 'App Mobile Principal', description: 'Testes do App Android e iOS', tests: 12, status: 'Ativo' },
    { id: '2', name: 'Web Dashboard', description: 'Regressão do portal administrativo', tests: 8, status: 'Ativo' },
    { id: '3', name: 'API Services', description: 'Validação de contratos e performance', tests: 45, status: 'Arquivado' },
];

export default function ProjectsPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Projetos</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Organize seus testes por contexto de negócio.</p>
                </div>
                <button className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2">
                    <Plus className="w-4 h-4" /> NOVO PROJETO
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mockProjects.map((project) => (
                    <div key={project.id} className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 group hover:border-brand/20 transition-all">
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                                <LayoutGrid className="w-5 h-5" />
                            </div>
                            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${project.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                {project.status}
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">{project.name}</h3>
                        <p className="text-slate-500 text-xs mb-6 line-clamp-2">{project.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-black/[0.03]">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{project.tests} Testes</span>
                            <button className="text-brand text-xs font-bold hover:underline">Gerenciar →</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
