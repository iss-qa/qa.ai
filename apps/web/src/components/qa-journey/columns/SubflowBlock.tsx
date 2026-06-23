'use client';

import { useState } from 'react';
import {
    ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock, CornerDownRight, FileCode2, FileSpreadsheet,
    GitBranch, MinusCircle, MoreHorizontal, Plus, Trash2, XCircle,
} from 'lucide-react';
import type { CaseRunStatus, QAJourneyCase } from '@/types/qa-journey';
import { formatRelativeTime, isCaseAutomated, type SubflowTreeNode } from './helpers';

export interface SubflowBlockCallbacks {
    onOpenCase: (caseId: string) => void;
    onOpenSubflow: (subflowId: string) => void;   // abre o detalhe do subfluxo
    onAddCase: (subflowId: string) => void;
    onAddChild: (parentSubflowId: string) => void;
    onAddDocument: (subflowId: string) => void;
    onImportCases: (subflowId: string) => void;    // importar casos de planilha
    onRemoveCase: (case_: QAJourneyCase) => void;   // remover caso da jornada (com confirmação no pai)
}

// Bloco de um subfluxo: cabeçalho + casos + subfluxos filhos (recursivo).
// Raiz é renderizado como "coluna"; filhos aparecem indentados dentro dela.
export function SubflowBlock({
    node,
    casesBySubflow,
    depth = 0,
    parentTitle,
    cb,
}: {
    node: SubflowTreeNode;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    depth?: number;
    // Título do subfluxo pai — exibido no filho ("de [WEB] - Cadastro") para
    // deixar explícito o vínculo de hierarquia.
    parentTitle?: string;
    cb: SubflowBlockCallbacks;
}) {
    const { subflow, children } = node;
    const cases = casesBySubflow[subflow.id] || [];   // casos DIRETOS deste subfluxo
    // Contagem ROLA OS FILHOS: o card do pai reflete os casos do próprio + de
    // todos os descendentes (ex.: pai sem casos diretos, mas com um filho de 2
    // casos, mostra "2 casos"). Badge idem (Auto/Parcial/Manual da subárvore).
    const subtree = subtreeStats(node, casesBySubflow);
    const totalCount = subtree.total;
    const autoCount = subtree.auto;
    const badge = totalCount > 0 && autoCount === totalCount
        ? { label: 'Automatizado', color: 'bg-green-500/20 text-green-500' }
        : autoCount > 0
            ? { label: 'Parcial', color: 'bg-yellow-500/20 text-yellow-500' }
            : { label: 'Manual', color: 'bg-blue-500/20 text-blue-400' };
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = () => setMenuOpen(false);
    // Recolher/expandir o corpo do card (casos ou documento).
    const [collapsed, setCollapsed] = useState(false);
    const isChild = depth > 0;
    const hasChildren = children.length > 0;
    // Sub-fluxo de documento (HTML anexado): sem badge/contagem/casos —
    // o card mostra só o documento.
    const isDoc = Boolean(subflow.html_doc);

    return (
        // Árvore HORIZONTAL: card à esquerda, filhos à direita (desktop) ligados
        // por seta. No mobile vira vertical (card em cima, filhos abaixo com trilho).
        <div className="flex flex-col sm:flex-row sm:items-start">
            {/* SEM overflow-hidden: o menu de ações precisa transbordar o card.
                Chevron + 3 pontinhos ficam no RODAPÉ e o menu abre PARA CIMA
                (bottom-full), então nunca é cortado.
                Raiz: largura DINÂMICA (sm:w-auto entre min 18rem e max 34rem) —
                encolhe para títulos curtos ("[WEB] - Cadastro") e cresce até o
                teto para títulos/casos longos, sem deixar buraco na tela.
                Filho (isChild): borda + leve fundo em brand, largura fixa
                (sm:w-80 lg:w-96) para exibir bem os títulos dos casos. */}
            <div className={`bg-card border rounded-xl flex flex-col min-h-[104px] w-full shrink-0 ${isChild ? 'sm:w-80 lg:w-96' : 'sm:w-auto sm:min-w-[18rem] sm:max-w-[34rem]'} ${isChild ? 'border-brand/30 bg-brand/[0.03]' : 'border-border'}`}>
                {/* Cabeçalho — título em linha própria; badge + contador embaixo. */}
                <div className="px-2.5 pt-2.5 pb-1.5 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        {isChild
                            ? <CornerDownRight className="w-3.5 h-3.5 text-brand shrink-0" />
                            : <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className="font-semibold text-sm text-foreground truncate flex-1">{subflow.title}</span>
                        <button
                            type="button"
                            onClick={() => setCollapsed(v => !v)}
                            title={collapsed ? 'Expandir' : 'Recolher'}
                            aria-label={collapsed ? 'Expandir' : 'Recolher'}
                            aria-expanded={!collapsed}
                            className="p-1 -mr-1 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors shrink-0"
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                        </button>
                    </div>
                    {isChild && parentTitle && (
                        <span className="text-[10px] text-brand/80 pl-[22px] truncate" title={`Subfluxo de ${parentTitle}`}>
                            de {parentTitle}
                        </span>
                    )}
                    <div className="flex items-center gap-2 pl-[22px]">
                        {isDoc ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-brand/15 text-brand">
                                <FileCode2 className="w-2.5 h-2.5" /> Documento
                            </span>
                        ) : (
                            <>
                                <span className={`text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${badge.color}`}>
                                    {badge.label}
                                </span>
                                <span
                                    className="text-[11px] text-muted-foreground tabular-nums"
                                    title={hasChildren ? 'Inclui casos dos subfluxos filhos' : undefined}
                                >
                                    {totalCount} {totalCount === 1 ? 'caso' : 'casos'}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Corpo: documento (modo documento) OU casos do subfluxo.
                    Oculto quando o card está recolhido. */}
                {collapsed ? null : isDoc ? (
                    <div className="px-2.5 pb-2">
                        <button
                            type="button"
                            onClick={() => cb.onOpenSubflow(subflow.id)}
                            className="flex items-center justify-between gap-2 w-full bg-brand/5 border border-brand/20 rounded-lg px-2.5 py-2 text-left hover:border-brand/50 transition-colors group"
                        >
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                                <FileCode2 className="w-3.5 h-3.5 text-brand" /> Documento HTML
                            </span>
                            <span className="text-[10px] text-muted-foreground group-hover:text-brand transition-colors inline-flex items-center gap-0.5">
                                Ver <ChevronRight className="w-3 h-3" />
                            </span>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 px-2.5 pb-2">
                        {cases.map(c => (
                            <CaseRow
                                key={c.id}
                                case_={c}
                                onClick={() => cb.onOpenCase(c.id)}
                                onRemove={() => cb.onRemoveCase(c)}
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
                )}

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

            {/* Subfluxos filhos (recursivo).
                Desktop: seta horizontal em brand saindo do pai → coluna de filhos
                  à direita (mais indentada).
                Mobile: empilha abaixo, com trilho vertical em brand (pl + border-l). */}
            {hasChildren && (
                <div className="flex flex-col sm:flex-row sm:items-stretch mt-2 sm:mt-0">
                    <div className="hidden sm:flex items-center self-stretch px-1.5 text-brand/60" aria-hidden>
                        <ArrowRight className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col gap-2 sm:gap-3 ml-3 sm:ml-0 pl-3 sm:pl-0 border-l-2 sm:border-l-0 border-l-brand/40">
                        {children.map(child => (
                            <SubflowBlock
                                key={child.subflow.id}
                                node={child}
                                casesBySubflow={casesBySubflow}
                                depth={depth + 1}
                                parentTitle={subflow.title}
                                cb={cb}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Soma os casos do subfluxo + de TODOS os descendentes (subárvore).
// `auto` = casos com Maestro vinculado, para derivar o badge do pai.
function subtreeStats(
    node: SubflowTreeNode,
    casesBySubflow: Record<string, QAJourneyCase[]>,
): { total: number; auto: number } {
    const own = casesBySubflow[node.subflow.id] || [];
    let total = own.length;
    let auto = own.filter(isCaseAutomated).length;
    for (const ch of node.children) {
        const s = subtreeStats(ch, casesBySubflow);
        total += s.total;
        auto += s.auto;
    }
    return { total, auto };
}

function CaseRow({ case_, onClick, onRemove }: { case_: QAJourneyCase; onClick: () => void; onRemove: () => void }) {
    const ran = case_.last_run_status && case_.last_run_status !== 'not_run';
    const when = formatRelativeTime(case_.last_run_at);
    const runLabel = RUN_LABEL[case_.last_run_status ?? 'not_run'];
    const isAuto = isCaseAutomated(case_);   // automatizado = Maestro vinculado ou ref Playwright
    // Wrapper relativo: o botão principal abre o detalhe; a lixeira (absoluta,
    // visível no hover) remove o caso — botões irmãos, nunca aninhados.
    return (
        <div className="group relative">
            <button
                type="button"
                onClick={onClick}
                className="w-full text-left bg-background border border-border rounded-lg pl-2.5 pr-8 py-2 flex flex-col gap-1 hover:border-brand/40 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <RunStatusIcon status={case_.last_run_status} />
                    <span className="text-xs text-foreground line-clamp-2 flex-1">{case_.title}</span>
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
            <button
                type="button"
                onClick={onRemove}
                title="Remover caso da jornada"
                aria-label="Remover caso da jornada"
                className="absolute top-1.5 right-1.5 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
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
