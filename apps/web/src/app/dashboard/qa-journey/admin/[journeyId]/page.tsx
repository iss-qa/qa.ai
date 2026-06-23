'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Eye,
    FileSpreadsheet,
    FileText,
    GitBranch,
    Link2,
    Loader2,
    Pencil,
    Plus,
    Sparkles,
    Trash2,
} from 'lucide-react';

import { SubflowFormModal } from '@/components/qa-journey/SubflowFormModal';
import { descendantIds, buildSubflowTree, formatExternalId, type SubflowTreeNode } from '@/components/qa-journey/columns/helpers';
import { CaseFormModal } from '@/components/qa-journey/CaseFormModal';
import { ImportCasesModal } from '@/components/qa-journey/ImportCasesModal';
import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';
import { MigrationMissingBanner } from '@/components/qa-journey/MigrationMissingBanner';
import { MaestroImportModal } from '@/components/qa-journey/MaestroImportModal';
import {
    createCase,
    createSubflow,
    deleteCase,
    deleteSubflow,
    errorMessage,
    loadJourneyDetail,
    loadTestCaseOptions,
    updateCase,
    updateSubflow,
} from '@/lib/qa-journey/api';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import { AUTOMATION_STATUS_OPTIONS, PRIORITY_OPTIONS, RUN_STATUS_DISPLAY } from '@/lib/qa-journey/constants';
import type {
    QAJourney,
    QAJourneyCase,
    QAJourneyCaseDraft,
    QAJourneySubflow,
    QAJourneySubflowDraft,
} from '@/types/qa-journey';

interface PageProps {
    params: { journeyId: string };
}

export default function QAJourneyDetailPage({ params }: PageProps) {
    const { journeyId } = params;

    const [journey, setJourney] = useState<QAJourney | null>(null);
    const [subflows, setSubflows] = useState<QAJourneySubflow[]>([]);
    const [cases, setCases] = useState<QAJourneyCase[]>([]);
    const [testCases, setTestCases] = useState<TestCaseOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationMissing, setMigrationMissing] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [subflowDialog, setSubflowDialog] = useState<{ mode: 'create' | 'edit'; subflow: QAJourneySubflow | null }>({ mode: 'create', subflow: null });
    const [subflowDialogOpen, setSubflowDialogOpen] = useState(false);

    const [caseDialog, setCaseDialog] = useState<{ subflowId: string; subject: QAJourneyCase | null } | null>(null);
    const [importDialog, setImportDialog] = useState<{ subflowId: string } | null>(null);

    const [deleteSubflowId, setDeleteSubflowId] = useState<string | null>(null);
    const [deleteCaseId, setDeleteCaseId] = useState<string | null>(null);

    const [maestroOpen, setMaestroOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { journey: j, subflows: s, cases: c, migrationMissing: mm } = await loadJourneyDetail(journeyId);
            if (cancelled) return;
            setJourney(j);
            setSubflows(s);
            setCases(c);
            setMigrationMissing(mm);
            setLoading(false);
            // Expandir todos por padrao para facilitar o cadastro
            setExpanded(new Set(s.map(x => x.id)));
        })();
        return () => { cancelled = true; };
    }, [journeyId]);

    // Test cases sao filtrados pelo projeto da jornada
    useEffect(() => {
        if (!journey?.project_id) return;
        let cancelled = false;
        loadTestCaseOptions(journey.project_id).then(list => {
            if (!cancelled) setTestCases(list);
        });
        return () => { cancelled = true; };
    }, [journey?.project_id]);

    // Lista achatada em ORDEM DE ÁRVORE: cada filho (parent_subflow_id) vem logo
    // após o pai, carregando seu `depth` para indentação. Antes a lista era plana
    // (só ordenada por sequence), então um subfluxo filho aparecia como card de
    // topo em vez de aninhado dentro do pai.
    const orderedSubflows = useMemo(() => {
        const out: { sub: QAJourneySubflow; depth: number }[] = [];
        const walk = (nodes: SubflowTreeNode[], depth: number) => {
            for (const n of nodes) {
                out.push({ sub: n.subflow, depth });
                if (n.children.length) walk(n.children, depth + 1);
            }
        };
        walk(buildSubflowTree(subflows), 0);
        return out;
    }, [subflows]);

    const casesBySubflow = useMemo(() => {
        const map: Record<string, QAJourneyCase[]> = {};
        for (const c of cases) {
            if (!map[c.subflow_id]) map[c.subflow_id] = [];
            map[c.subflow_id].push(c);
        }
        return map;
    }, [cases]);

    // Total de casos da SUBÁRVORE (próprios + de todos os descendentes). O card
    // do sub-fluxo pai soma os filhos — ex.: pai com 0 casos diretos mas filhos
    // com 4+6+3 mostra o total, não "0 casos".
    const subtreeCaseCount = useMemo(() => {
        const childrenOf = new Map<string, string[]>();
        for (const s of subflows) {
            if (s.parent_subflow_id) {
                (childrenOf.get(s.parent_subflow_id) || childrenOf.set(s.parent_subflow_id, []).get(s.parent_subflow_id)!).push(s.id);
            }
        }
        const memo = new Map<string, number>();
        const count = (id: string): number => {
            if (memo.has(id)) return memo.get(id)!;
            memo.set(id, 0);  // guarda contra ciclo
            let total = (casesBySubflow[id] || []).length;
            for (const childId of (childrenOf.get(id) || [])) total += count(childId);
            memo.set(id, total);
            return total;
        };
        const result: Record<string, number> = {};
        for (const s of subflows) result[s.id] = count(s.id);
        return result;
    }, [subflows, casesBySubflow]);

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // --- Subflow handlers ---
    const handleSaveSubflow = async (draft: QAJourneySubflowDraft) => {
        try {
            if (subflowDialog.mode === 'edit' && subflowDialog.subflow) {
                const updated = await updateSubflow(subflowDialog.subflow.id, draft);
                setSubflows(prev => prev.map(s => s.id === updated.id ? updated : s));
            } else {
                const created = await createSubflow(draft);
                setSubflows(prev => [...prev, created]);
                setExpanded(prev => {
                    const next = new Set(prev);
                    next.add(created.id);
                    return next;
                });
            }
            setSubflowDialogOpen(false);
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao salvar Sub-fluxo: ' + msg);
            throw e;
        }
    };

    const handleDeleteSubflow = async () => {
        if (!deleteSubflowId) return;
        const targetId = deleteSubflowId;
        setDeleteSubflowId(null);
        try {
            await deleteSubflow(targetId);
            setSubflows(prev => prev.filter(s => s.id !== targetId));
            setCases(prev => prev.filter(c => c.subflow_id !== targetId));
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao excluir Sub-fluxo: ' + msg);
        }
    };

    // --- Case handlers ---
    const handleSaveCase = async (draft: QAJourneyCaseDraft) => {
        if (!caseDialog) return;
        try {
            if (caseDialog.subject) {
                const updated = await updateCase(caseDialog.subject.id, draft);
                setCases(prev => prev.map(c => c.id === updated.id ? updated : c));
            } else {
                const created = await createCase(draft);
                setCases(prev => [...prev, created]);
            }
            setCaseDialog(null);
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao salvar Caso: ' + msg);
            throw e;
        }
    };

    const handleDeleteCase = async () => {
        if (!deleteCaseId) return;
        const targetId = deleteCaseId;
        setDeleteCaseId(null);
        try {
            await deleteCase(targetId);
            setCases(prev => prev.filter(c => c.id !== targetId));
        } catch (e: unknown) {
            const msg = errorMessage(e);
            alert('Erro ao excluir Caso: ' + msg);
        }
    };

    const deleteSubflowTarget = deleteSubflowId ? subflows.find(s => s.id === deleteSubflowId) : null;
    const deleteCaseTarget = deleteCaseId ? cases.find(c => c.id === deleteCaseId) : null;

    if (loading) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
                <div className="p-8 text-center text-textSecondary text-sm">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Carregando jornada…
                </div>
            </div>
        );
    }

    if (migrationMissing) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6">
                <BackLink />
                <MigrationMissingBanner />
            </div>
        );
    }

    if (!journey) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6">
                <BackLink />
                <div className="bg-card rounded-2xl p-8 text-center text-textSecondary text-sm border border-border">
                    Jornada não encontrada.
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex flex-col gap-3">
                <BackLink />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span
                            className="w-4 h-4 rounded-full border border-border shrink-0"
                            style={{ background: journey.color || '#7c3aed' }}
                        />
                        <h1 className="text-2xl font-bold text-foreground">{journey.title}</h1>
                        <span className="text-xs font-mono text-muted-foreground">/{journey.slug}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                            href={`/dashboard/qa-journey?project=${journey.project_id}&journey=${journey.id}`}
                            className="text-xs font-bold text-brand border border-brand/30 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 hover:bg-brand/10 transition-colors"
                            title="Abrir esta jornada no mapa visual"
                        >
                            <Eye className="w-3.5 h-3.5" /> Ver no mapa
                        </Link>
                        <button
                            onClick={() => setMaestroOpen(true)}
                            disabled={subflows.length === 0}
                            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                            title={subflows.length === 0 ? 'Crie sub-fluxos primeiro' : 'Vincular test cases Maestro aos sub-fluxos'}
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Vincular Maestro
                        </button>
                        <button
                            onClick={() => { setSubflowDialog({ mode: 'create', subflow: null }); setSubflowDialogOpen(true); }}
                            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 transition-all flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Novo Sub-fluxo
                        </button>
                    </div>
                </div>
                {journey.description && (
                    <p className="text-sm text-textSecondary">{journey.description}</p>
                )}
            </div>

            {/* Subflows list */}
            <div className="flex flex-col gap-3">
                {orderedSubflows.length === 0 && (
                    <div className="bg-card rounded-2xl shadow-sm border border-border p-8 text-center text-textSecondary text-sm">
                        Nenhum sub-fluxo cadastrado ainda. Clique em &quot;Novo Sub-fluxo&quot; para adicionar o primeiro.
                    </div>
                )}

                {orderedSubflows.map(({ sub, depth }) => {
                    const subCases = casesBySubflow[sub.id] || [];
                    const totalCases = subtreeCaseCount[sub.id] ?? subCases.length;
                    const statusOpt = AUTOMATION_STATUS_OPTIONS.find(o => o.value === sub.automation_status);
                    const isOpen = expanded.has(sub.id);
                    return (
                        <div
                            key={sub.id}
                            style={depth > 0 ? { marginLeft: depth * 28 } : undefined}
                            className={`bg-card rounded-2xl shadow-sm border overflow-hidden ${depth > 0 ? 'border-l-2 border-l-brand/40 border-border' : 'border-border'}`}
                        >
                            <div className="flex items-center justify-between px-6 py-4 gap-4">
                                <button
                                    onClick={() => toggleExpand(sub.id)}
                                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                                >
                                    {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                                    <GitBranch className="w-4 h-4 text-brand shrink-0" />
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold text-foreground truncate">{sub.title}</span>
                                        {sub.description && (
                                            <span className="text-xs text-muted-foreground truncate">{sub.description}</span>
                                        )}
                                    </div>
                                    {statusOpt && (
                                        <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${statusOpt.color}`}>
                                            {statusOpt.label}
                                        </span>
                                    )}
                                    {sub.test_case_id && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-brand">
                                            <Link2 className="w-3 h-3" /> Maestro
                                        </span>
                                    )}

                                    {/* Ações centralizadas no espaço vazio do header */}
                                    <div className="flex-1 flex items-center justify-center gap-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setImportDialog({ subflowId: sub.id }); }}
                                            className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-foreground/5 transition-colors"
                                            title="Importar casos de uma planilha Google Sheets"
                                        >
                                            <FileSpreadsheet className="w-3.5 h-3.5" /> Importar da planilha
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCaseDialog({ subflowId: sub.id, subject: null }); }}
                                            className="text-xs font-bold text-brand flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-brand/10 transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Adicionar caso
                                        </button>
                                    </div>

                                    <span
                                        className="text-[10px] text-muted-foreground"
                                        title={totalCases !== subCases.length ? 'Inclui casos dos subfluxos filhos' : undefined}
                                    >
                                        {totalCases} {totalCases === 1 ? 'caso' : 'casos'}
                                    </span>
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => { setSubflowDialog({ mode: 'edit', subflow: sub }); setSubflowDialogOpen(true); }}
                                        className="p-2 rounded-lg text-muted-foreground hover:bg-brand/10 hover:text-brand transition-all"
                                        title="Editar sub-fluxo"
                                        aria-label="Editar sub-fluxo"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteSubflowId(sub.id)}
                                        className="p-2 rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger transition-all"
                                        title="Excluir sub-fluxo"
                                        aria-label="Excluir sub-fluxo"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {isOpen && (
                                <div className="border-t border-border bg-surface-muted/30">

                                    {subCases.length === 0 ? (
                                        <div className="px-6 pb-4 text-xs text-muted-foreground">
                                            Nenhum caso cadastrado neste sub-fluxo.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                                            <thead className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">
                                                <tr>
                                                    <th className="px-6 py-2 w-20">ID externo</th>
                                                    <th className="px-6 py-2">Título</th>
                                                    <th className="px-6 py-2 w-28">Plataforma</th>
                                                    <th className="px-6 py-2 w-28">Prioridade</th>
                                                    <th className="px-6 py-2 w-32">Última exec.</th>
                                                    <th className="px-6 py-2 text-right w-32">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {subCases.map(c => {
                                                    const prio = PRIORITY_OPTIONS.find(o => o.value === c.priority);
                                                    const rowTone = c.last_run_status === 'pass'
                                                        ? 'bg-success/10 hover:bg-success/15'
                                                        : c.last_run_status === 'fail'
                                                            ? 'bg-danger/10 hover:bg-danger/15'
                                                            : 'hover:bg-accent';
                                                    return (
                                                        <tr key={c.id} className={`transition-colors ${rowTone}`}>
                                                            <td className="px-6 py-2 text-[11px] font-mono text-muted-foreground w-20" title={c.external_id || undefined}>
                                                                {c.external_id ? formatExternalId(c.external_id) : '—'}
                                                            </td>
                                                            <td className="px-6 py-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                                                    <span className="text-foreground whitespace-normal">{c.title}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-2 text-[11px] text-muted-foreground">
                                                                {c.platform || '—'}
                                                            </td>
                                                            <td className="px-6 py-2">
                                                                {prio && (
                                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${prio.color}`}>
                                                                        {prio.label}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-2 text-[11px]">
                                                                {c.last_run_status ? (
                                                                    <span className={`font-bold uppercase tracking-wide ${
                                                                        c.last_run_status === 'pass'
                                                                            ? 'text-success'
                                                                            : c.last_run_status === 'fail'
                                                                                ? 'text-danger'
                                                                                : 'text-muted-foreground'
                                                                    }`}>
                                                                        {RUN_STATUS_DISPLAY[c.last_run_status]}
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                            <td className="px-6 py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        onClick={() => setCaseDialog({ subflowId: sub.id, subject: c })}
                                                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-brand/10 hover:text-brand transition-all"
                                                                        title="Editar caso"
                                                                        aria-label="Editar caso"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setDeleteCaseId(c.id)}
                                                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger transition-all"
                                                                        title="Excluir caso"
                                                                        aria-label="Excluir caso"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modals */}
            {subflowDialogOpen && (
                <SubflowFormModal
                    journeyId={journey.id}
                    journeyTitle={journey.title}
                    initial={subflowDialog.mode === 'edit' ? subflowDialog.subflow : null}
                    defaultSequence={subflows.length > 0 ? Math.max(...subflows.map(s => s.sequence)) + 1 : 0}
                    testCases={testCases}
                    parentOptions={
                        subflowDialog.mode === 'edit' && subflowDialog.subflow
                            ? (() => { const blocked = descendantIds(subflows, subflowDialog.subflow.id); return subflows.filter(s => !blocked.has(s.id)); })()
                            : subflows
                    }
                    onClose={() => setSubflowDialogOpen(false)}
                    onSave={handleSaveSubflow}
                />
            )}

            {caseDialog && (
                <CaseFormModal
                    subflowId={caseDialog.subflowId}
                    subflowTitle={subflows.find(s => s.id === caseDialog.subflowId)?.title}
                    initial={caseDialog.subject}
                    testCases={testCases}
                    siblingCount={(casesBySubflow[caseDialog.subflowId] || []).length}
                    projectId={journey?.project_id}
                    onClose={() => setCaseDialog(null)}
                    onSave={handleSaveCase}
                />
            )}

            {deleteSubflowTarget && (
                <DeleteConfirmModal
                    title="Excluir Sub-fluxo?"
                    message={`O sub-fluxo "${deleteSubflowTarget.title}" e TODOS os seus casos serão excluídos permanentemente.`}
                    onCancel={() => setDeleteSubflowId(null)}
                    onConfirm={handleDeleteSubflow}
                />
            )}

            {deleteCaseTarget && (
                <DeleteConfirmModal
                    title="Excluir Caso?"
                    message={`O caso "${deleteCaseTarget.title}" será excluído permanentemente.`}
                    onCancel={() => setDeleteCaseId(null)}
                    onConfirm={handleDeleteCase}
                />
            )}

            {importDialog && (
                <ImportCasesModal
                    projectId={journey.project_id}
                    subflowId={importDialog.subflowId}
                    subflowTitle={subflows.find(s => s.id === importDialog.subflowId)?.title || ''}
                    existingCases={cases.filter(c => c.subflow_id === importDialog.subflowId)}
                    onClose={() => setImportDialog(null)}
                    onImported={(created) => {
                        setCases(prev => [...prev, ...created]);
                    }}
                />
            )}

            {maestroOpen && (
                <MaestroImportModal
                    subflows={subflows}
                    testCases={testCases}
                    onClose={() => setMaestroOpen(false)}
                    onSubflowUpdated={(updated) => {
                        setSubflows(prev => prev.map(s => s.id === updated.id ? updated : s));
                    }}
                />
            )}
        </div>
    );
}

function BackLink() {
    return (
        <Link
            href="/dashboard/qa-journey/admin"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
            <ArrowLeft className="w-3 h-3" /> Voltar para Jornadas
        </Link>
    );
}
