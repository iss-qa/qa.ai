'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { SheetWizard } from '@/components/qa-journey/sheet-wizard/SheetWizard';

export default function SheetWizardPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('project') || '';

    if (!projectId) {
        return (
            <div className="p-8 max-w-[1100px] mx-auto flex flex-col gap-3">
                <Link href="/dashboard/qa-journey/admin/sheets" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-3 h-3" /> Voltar
                </Link>
                <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 text-sm text-warning">
                    Selecione um projeto antes de criar um mapeamento.
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-[1200px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-2">
                <Link
                    href={`/dashboard/qa-journey/admin/sheets?project=${projectId}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="w-3 h-3" /> Voltar para mapeamentos
                </Link>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-brand" />
                    Novo mapeamento de planilha
                </h1>
                <p className="text-textSecondary text-sm">
                    5 passos para conectar uma aba do Google Sheets à Jornada do QA deste projeto.
                </p>
            </div>

            <SheetWizard projectId={projectId} />
        </div>
    );
}
