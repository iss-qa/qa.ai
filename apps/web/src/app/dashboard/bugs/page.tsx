'use client';

import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    getFilteredRowModel,
    getPaginationRowModel
} from '@tanstack/react-table';
import { FileText, Bug, Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { useState } from 'react';

type BugReportRow = {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    project: string;
    testName: string;
    runId: string;
    date: string;
    pdfUrl: string;
};

const mockBugs: BugReportRow[] = [
    { id: 'b1', severity: 'critical', title: 'Falha completa no login com biometria', project: 'BancoX Mobile', testName: 'Login Biometria', runId: '102', date: 'Hoje, 09:12', pdfUrl: '#' },
    { id: 'b2', severity: 'high', title: 'Botão de login ausente após preenchimento', project: 'BancoX Web', testName: 'Login Padrão', runId: '47', date: 'Hoje, 14:32', pdfUrl: '#' },
    { id: 'b3', severity: 'medium', title: 'Tooltip cortado em resoluções menores', project: 'BancoX Web', testName: 'Onboarding PF', runId: '80', date: 'Ontem', pdfUrl: '#' },
    { id: 'b4', severity: 'low', title: 'Cor incorreta no ícone de sucesso', project: 'BancoX Mobile', testName: 'Pix Transferência', runId: '99', date: '04/03', pdfUrl: '#' },
    { id: 'b5', severity: 'high', title: 'Timeout carregando saldo na home', project: 'BancoX Mobile', testName: 'Ver Saldo Inicial', runId: '22', date: '01/03', pdfUrl: '#' },
];

const severityColors = {
    critical: 'bg-red-500/20 text-red-500',
    high: 'bg-orange-500/20 text-orange-500',
    medium: 'bg-yellow-500/20 text-yellow-500',
    low: 'bg-green-500/20 text-green-500'
};

const columnHelper = createColumnHelper<BugReportRow>();

const columns = [
    columnHelper.accessor('severity', {
        header: 'Severidade',
        cell: info => (
            <span className={`inline-flex items-center px-2 py-1 mx-2 rounded-md text-xs font-bold uppercase tracking-wide ${severityColors[info.getValue()]}`}>
                {info.getValue()}
            </span>
        )
    }),
    columnHelper.accessor('title', {
        header: 'Título',
        cell: info => <span className="font-bold text-slate-900">{info.getValue()}</span>
    }),
    columnHelper.accessor('project', { header: 'Projeto' }),
    columnHelper.accessor('testName', {
        header: 'Teste',
        cell: info => <span className="text-brand font-medium">{info.getValue()}</span>
    }),
    columnHelper.accessor('date', { header: 'Data' }),
    columnHelper.display({
        id: 'actions',
        header: 'Ações',
        cell: ({ row }) => (
            <div className="flex gap-4">
                <a href={row.original.pdfUrl} className="text-slate-400 hover:text-brand flex items-center gap-1 text-xs font-bold transition-colors">
                    <FileText className="w-4 h-4" /> PDF
                </a>
                <Link href={`/dashboard/runs/${row.original.runId}`} className="text-brand hover:text-brandLight text-xs font-bold hover:underline">
                    Ver Run →
                </Link>
            </div>
        )
    }),
];

export default function BugTrackerPage() {
    const [globalFilter, setGlobalFilter] = useQueryState('q', { defaultValue: '' });
    const [severityFilter, setSeverityFilter] = useQueryState('severity', { defaultValue: 'all' });

    // Filtro derivado manual para o MVP local
    const filteredData = mockBugs.filter(bug => {
        const matchesQuery = bug.title.toLowerCase().includes(globalFilter.toLowerCase()) ||
            bug.testName.toLowerCase().includes(globalFilter.toLowerCase());
        const matchesSeverity = severityFilter === 'all' || bug.severity === severityFilter;
        return matchesQuery && matchesSeverity;
    });

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    return (
        <div className="p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Bug className="w-6 h-6 text-brand" /> Bug Tracker
                    </h1>
                    <p className="text-textSecondary mt-1">Todos os bugs reportados automaticamente pela IA.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar bugs..."
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="bg-white border border-black/5 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 w-[250px]"
                        />
                    </div>

                    <div className="relative">
                        <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="bg-white border border-black/5 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 appearance-none min-w-[160px]"
                        >
                            <option value="all">Todas Severidades</option>
                            <option value="critical">Crítico</option>
                            <option value="high">Alta</option>
                            <option value="medium">Média</option>
                            <option value="low">Baixa</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="text-[10px] uppercase bg-slate-50/50 text-slate-400 font-bold tracking-widest border-b border-black/[0.03]">
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} className="px-6 py-4">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-black/[0.03]">
                            {table.getRowModel().rows.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="px-6 py-4">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Empty state */}
                {filteredData.length === 0 && (
                    <div className="p-8 text-center text-textSecondary">
                        Nenhum bug encontrado com os filtros atuais.
                    </div>
                )}
            </div>

        </div>
    );
}
