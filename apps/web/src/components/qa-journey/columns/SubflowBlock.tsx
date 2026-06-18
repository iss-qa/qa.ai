'use client';

import { useState } from 'react';
import {
    CheckCircle2, ChevronRight, Circle, Clock, FileCode2, FileSpreadsheet,
    GitBranch, MinusCircle, MoreHorizontal, Plus, XCircle,
} from 'lucide-react';
import type { CaseRunStatus, QAJourneyCase } from '@/types/qa-journey';
import { formatRelativeTime, type SubflowTreeNode } from './helpers';

export interface SubflowBlockCallbacks {
    onOpenCase: (caseId: string) => void;
    onOpenSubflow: (subflowId: string) => void;   // abre o detalhe do subfluxo
    onAddCase: (subflowId: string) => void;
    onAddChild: (parentSubflowId: string) => void;
    onAddDocument: (subflowId: string) => void;
    onImportCases: (subflowId: string) => void;    // importar casos de planilha
}

// Bloco de um subfluxo: cabeçalho + casos + subfluxos filhos (recursivo).
// Raiz é renderizado como "coluna"; filhos aparecem indentados dentro dela.
export function SubflowBlock({
    node,
    casesBySubflow,
    depth = 0,
    cb,
}: {
    node: SubflowTreeNode;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    depth?: number;
    cb: SubflowBlockCallbacks;
}) {
    const { subflow, children } = node;
    const cases = casesBySubflow[subflow.id] || [];
    // Tipo do subfluxo derivado dos casos: automatizado = caso com Maestro
    // vinculado. Todos auto = "Automatizado"; alguns = "Parcial"; nenhum = "Manual".
    const autoCount = cases.filter(c => c.test_case_id).length;
    const badge = cases.length > 0 && autoCount === cases.length
        ? { label: 'Automatizado', color: 'bg-green-500/20 text-green-500' }
        : autoCount > 0
            ? { label: 'Parcial', color: 'bg-yellow-500/20 text-yellow-500' }
            : { label: 'Manual', color: 'bg-blue-500/20 text-blue-400' };
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = () => setMenuOpen(false);

    return (
        <div className={depth > 0 ? 'border-l-2 border-border/70 pl-3' : ''}>
            {/* SEM overflow-hidden: o menu de ações precisa transbordar o card.
                Chevron + 3 pontinhos ficam no RODAPÉ e o menu abre PARA CIMA
                (bottom-full), então nunca é cortado. */}
            <div className="bg-card border border-border rounded-xl flex flex-col min-h-[104px]">
                {/* Cabeçalho — título em linha própria; badge + contador embaixo. */}
                <div className="px-2.5 pt-2.5 pb-1.5 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm text-foreground truncate flex-1">{subflow.title}</span>
                    </div>
                    <div className="flex items-center gap-2 pl-[22px]">
                        <span className={`text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${badge.color}`}>
                            {badge.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                            {cases.length} {cases.length === 1 ? 'caso' : 'casos'}
                        </span>
                    </div>
                </div>

                {/* Casos do subfluxo */}
                <div className="flex flex-col gap-1.5 px-2.5 pb-2">
                    {cases.map(c => (
                        <CaseRow
                            key={c.id}
                            case_={c}
                            onClick={() => cb.onOpenCase(c.id)}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={() => cb.onAddCase(subflow.id)}
                        className="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand transition-colors pt-0.5"
                    >
                        <Plus className="w-3 h-3" /> Adicionar caso
                    </button>
                </div>

                {/* Rodapé: ver detalhe (seta) + menu de ações (3 pontinhos). */}
                <div className="mt-auto px-2.5 py-2 border-t border-border flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => cb.onOpenSubflow(subflow.id)}
                        title="Ver detalhe do subfluxo"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Ver detalhe <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setMenuOpen(v => !v)}
                            title="Ações do subfluxo"
                            className="p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={closeMenu} />
                                <div className="absolute right-0 bottom-full mb-1 z-30 w-48 bg-popover border border-border rounded-lg shadow-xl py-1">
                                    <MenuItem icon={<Plus className="w-3.5 h-3.5" />} label="Adicionar caso" onClick={() => { closeMenu(); cb.onAddCase(subflow.id); }} />
                                    <MenuItem icon={<GitBranch className="w-3.5 h-3.5" />} label="Adicionar subfluxo" onClick={() => { closeMenu(); cb.onAddChild(subflow.id); }} />
                                    <MenuItem icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Importar da planilha" onClick={() => { closeMenu(); cb.onImportCases(subflow.id); }} />
                                    <MenuItem
                                        icon={<FileCode2 className="w-3.5 h-3.5" />}
                                        label={subflow.html_doc ? 'Editar documento' : 'Adicionar documento'}
                                        onClick={() => { closeMenu(); cb.onAddDocument(subflow.id); }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Subfluxos filhos (recursivo) */}
            {children.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                    {children.map(child => (
                        <SubflowBlock
                            key={child.subflow.id}
                            node={child}
                            casesBySubflow={casesBySubflow}
                            depth={depth + 1}
                            cb={cb}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function CaseRow({ case_, onClick }: { case_: QAJourneyCase; onClick: () => void }) {
    const ran = case_.last_run_status && case_.last_run_status !== 'not_run';
    const when = formatRelativeTime(case_.last_run_at);
    const runLabel = RUN_LABEL[case_.last_run_status ?? 'not_run'];
    const isAuto = Boolean(case_.test_case_id);   // automatizado = caso com Maestro vinculado
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left bg-background border border-border rounded-lg px-2.5 py-2 flex flex-col gap-1 hover:border-brand/40 transition-colors"
        >
            <div className="flex items-center gap-2">
                <RunStatusIcon status={case_.last_run_status} />
                <span className="text-xs text-foreground truncate flex-1">{case_.title}</span>
                <span className={`text-[8px] font-bold uppercase rounded px-1 py-0.5 ${isAuto ? 'bg-green-500/15 text-green-500' : 'bg-blue-500/15 text-blue-400'}`}>
                    {isAuto ? 'Auto' : 'Manual'}
                </span>
            </div>
            {ran && (
                <div className="flex items-center gap-2 pl-[22px] text-[10px]">
                    <span className={`font-semibold ${runLabel.color}`}>{runLabel.text}</span>
                    {when && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" /> {when}
                        </span>
                    )}
                </div>
            )}
        </button>
    );
}

// Rótulo + cor (só texto) por status de execução, para a linha de resultado.
const RUN_LABEL: Record<CaseRunStatus, { text: string; color: string }> = {
    pass: { text: 'Passou', color: 'text-green-500' },
    fail: { text: 'Falhou', color: 'text-red-500' },
    skipped: { text: 'Pulado', color: 'text-muted-foreground' },
    not_run: { text: 'Não rodado', color: 'text-muted-foreground' },
};

function RunStatusIcon({ status }: { status: CaseRunStatus | null }) {
    if (status === 'pass') return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
    if (status === 'fail') return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    if (status === 'skipped') return <MinusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
    return <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />;
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors text-left"
        >
            <span className="text-muted-foreground">{icon}</span>
            {label}
        </button>
    );
}
