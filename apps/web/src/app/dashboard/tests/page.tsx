'use client';

import { Plus, Search, Filter, Play } from 'lucide-react';
import Link from 'next/link';

const mockTests = [
    { id: '1', name: 'Fluxo de Login Principal', project: 'App Mobile', type: 'Android', lastRun: 'Hoje, 10:30', status: 'passed' },
    { id: '2', name: 'Cadastro de Usuário', project: 'Web Dashboard', type: 'Web', lastRun: 'Ontem', status: 'failed' },
    { id: '3', name: 'Checkout Completo', project: 'E-commerce', type: 'Web', lastRun: '05/03', status: 'passed' },
];

export default function TestsPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Testes</h1>
                    <p className="text-textSecondary/80 text-sm mt-1">Gerencie e execute seus casos de teste.</p>
                </div>
                <Link href="/dashboard/tests/editor" prefetch={true} className="bg-brand text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2">
                    <Plus className="w-4 h-4" /> NOVO TESTE
                </Link>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-black/5 flex items-center justify-between bg-slate-50/50">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar testes..."
                            className="pl-10 pr-4 py-2 bg-white border border-black/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 w-64 text-slate-900"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-black/5 rounded-lg transition-colors text-slate-500">
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="text-[10px] uppercase bg-slate-50/50 text-slate-400 font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Nome do Teste</th>
                                <th className="px-6 py-4">Projeto</th>
                                <th className="px-6 py-4">Plataforma</th>
                                <th className="px-6 py-4">Última Execução</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {mockTests.map((test) => (
                                <tr key={test.id} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-900">{test.name}</td>
                                    <td className="px-6 py-4">{test.project}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                                            {test.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs">{test.lastRun}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase ${test.status === 'passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {test.status === 'passed' ? 'Sucesso' : 'Falha'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button className="p-2 hover:bg-brand/10 text-brand rounded-lg transition-colors" title="Executar agora">
                                                <Play className="w-4 h-4 fill-current" />
                                            </button>
                                            <Link href={`/dashboard/tests/${test.id}`} className="p-2 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors">
                                                Editar
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
