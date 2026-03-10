'use client';

import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper
} from '@tanstack/react-table';
import { ChevronLeft, FileText, Play } from 'lucide-react';
import Link from 'next/link';

type RunHistoryRow = {
    id: string;
    run_number: number;
    status: 'passed' | 'failed' | 'running' | 'cancelled';
    device: string;
    duration: string;
    steps_passed: number;
    steps_total: number;
    created_at: string;
    has_bug_report: boolean;
};

const mockHistory: RunHistoryRow[] = [
    { id: '101', run_number: 47, status: 'failed', device: 'Pixel 7 Pro (Android 13)', duration: '42s', steps_passed: 5, steps_total: 6, created_at: 'Hoje, 14:32', has_bug_report: true },
    { id: '102', run_number: 46, status: 'passed', device: 'Galaxy S23 (Android 14)', duration: '12s', steps_passed: 6, steps_total: 6, created_at: 'Ontem, 09:15', has_bug_report: false },
    { id: '103', run_number: 45, status: 'passed', device: 'Pixel 7 Pro (Android 13)', duration: '11s', steps_passed: 6, steps_total: 6, created_at: 'Ontem, 09:10', has_bug_report: false },
];

const columnHelper = createColumnHelper<RunHistoryRow>();

const columns = [
    columnHelper.accessor('run_number', {
        header: '#',
        cell: info => <span className="text-textSecondary font-mono">#{info.getValue()}</span>,
    }),
    columnHelper.accessor('status', {
        header: 'Status',
        cell: info => {
            const status = info.getValue();
            return (
                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${status === 'passed' ? 'bg-green-500/10 text-green-400' :
                        status === 'failed' ? 'bg-red-500/10 text-red-400' :
                            status === 'running' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
                                'bg-white/5 text-textSecondary'
                    }`}>
                    {status === 'passed' ? 'Passou' : status === 'failed' ? 'Falhou' : status === 'running' ? 'Executando' : 'Cancelado'}
                </span>
            );
        }
    }),
    columnHelper.accessor('device', { header: 'Dispositivo' }),
    columnHelper.accessor('duration', { header: 'Duração' }),
    columnHelper.accessor(row => `${row.steps_passed}/${row.steps_total}`, {
        id: 'steps',
        header: 'Steps',
        cell: info => <span className="text-white bg-white/5 px-2 py-1 rounded text-xs">{info.getValue()}</span>
    }),
    columnHelper.accessor('created_at', { header: 'Data' }),
    columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
            <div className="flex justify-end gap-3 text-textSecondary">
                {row.original.has_bug_report && (
                    <button className="hover:text-red-400" title="Ver Bug Report PDF">
                        <FileText className="w-4 h-4" />
                    </button>
                )}
                <button className="hover:text-brandLight" title="Re-executar">
                    <Play className="w-4 h-4" />
                </button>
                <Link href={`/runs/${row.original.id}`} className="text-brand hover:text-brandLight text-xs font-medium hover:underline ml-2">
                    Ver Detalhes →
                </Link>
            </div>
        )
    }),
];

export default function TestHistoryPage({ params }: { params: { id: string } }) {
    const table = useReactTable({
        data: mockHistory,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                <Link href="/dashboard" className="p-2 -ml-2 text-textSecondary hover:text-white rounded-lg transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-white">Histórico de Execuções</h1>
                    <p className="text-textSecondary mt-1">Teste: Login Checkout BancoX ({params.id})</p>
                </div>
            </div>

            <div className="bg-bgSecondary border border-white/5 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-textSecondary">
                    <thead className="text-xs uppercase bg-black/20 text-textSecondary border-b border-white/5">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th key={header.id} className="px-6 py-4 font-medium">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {table.getRowModel().rows.map(row => (
                            <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
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
        </div>
    );
}
