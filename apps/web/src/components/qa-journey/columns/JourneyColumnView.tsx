'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
    ChevronRight, Download, FileCode2, GitBranch, GripVertical, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Plus,
} from 'lucide-react';
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    createCase, createSubflow, removeJourneyCase, reorderJourneys, updateCase, updateSubflow, errorMessage, type TestCaseOption,
} from '@/lib/qa-journey/api';
import type {
    QAJourney, QAJourneyCase, QAJourneyCaseDraft, QAJourneySubflow, QAJourneySubflowDraft,
} from '@/types/qa-journey';
import { SubflowFormModal } from '../SubflowFormModal';
import { ExportModal } from '../ExportModal';
import { CaseFormModal } from '../CaseFormModal';
import { ImportCasesModal } from '../ImportCasesModal';
import { SubflowModal } from '../map/SubflowModal';
import { CaseDetailModal } from '../map/CaseDetailModal';
import { SubflowBlock, type SubflowBlockCallbacks } from './SubflowBlock';
import { DeleteConfirmModal } from '../DeleteConfirmModal';
import { buildSubflowTree, computeMetrics, descendantIds } from './helpers';

interface JourneyColumnViewProps {
    projectId: string;
    projectName: string;
    journeys: QAJourney[];
    subflowsByJourney: Record<string, QAJourneySubflow[]>;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    testCases: TestCaseOption[];
    onReload: () => void;                          // re-busca os dados após mutação
    onOpenJourneyMap: (journeyId: string) => void; // ver SÓ esta jornada no mapa visual
    onCaseUpdated?: (updated: QAJourneyCase) => void;
}

type SubflowFormState = { open: boolean; initial: QAJourneySubflow | null; defaultParentId: string | null };
type CaseFormState = { open: boolean; subflowId: string; initial: QAJourneyCase | null };

function collapseKey(projectName: string) { return `qa-journey-cols-collapsed:${projectName}`; }

export function JourneyColumnView({
    projectId, projectName, journeys, subflowsByJourney, casesBySubflow, testCases,
    onReload, onOpenJourneyMap, onCaseUpdated,
}: JourneyColumnViewProps) {
    const [selectedId, setSelectedId] = useState<string>('');
    const [collapsed, setCollapsed] = useState(false);

    // Ordem local das jornadas (otimista) — sincroniza com as props e é
    // reescrita ao arrastar; a persistência roda em background.
    const [orderedJourneys, setOrderedJourneys] = useState<QAJourney[]>(journeys);
    useEffect(() => { setOrderedJourneys(journeys); }, [journeys]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleJourneyDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setOrderedJourneys(prev => {
            const oldIndex = prev.findIndex(j => j.id === active.id);
            const newIndex = prev.findIndex(j => j.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const next = arrayMove(prev, oldIndex, newIndex);
            // Persiste a nova ordem; em caso de erro, recarrega para reverter.
            reorderJourneys(next.map(j => j.id)).catch(() => onReload());
            return next;
        });
    };

    const [subflowForm, setSubflowForm] = useState<SubflowFormState>({ open: false, initial: null, defaultParentId: null });
    const [caseForm, setCaseForm] = useState<CaseFormState>({ open: false, subflowId: '', initial: null });
    const [importSubflowId, setImportSubflowId] = useState<string | null>(null);
    const [subflowDetailId, setSubflowDetailId] = useState<string | null>(null);
    const [caseDetailId, setCaseDetailId] = useState<string | null>(null);
    const [removeCaseTarget, setRemoveCaseTarget] = useState<QAJourneyCase | null>(null);
    const [removingCase, setRemovingCase] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);

    // Restaura preferência de recolhimento da coluna.
    useEffect(() => {
        try { setCollapsed(localStorage.getItem(collapseKey(projectName)) === '1'); } catch { /* ignore */ }
    }, [projectName]);
    const toggleCollapsed = () => setCollapsed(v => {
        const next = !v;
        try { localStorage.setItem(collapseKey(projectName), next ? '1' : '0'); } catch { /* ignore */ }
        return next;
    });

    // Seleciona a 1ª jornada (ou mantém a atual se ainda existir).
    useEffect(() => {
        setSelectedId(prev => (prev && orderedJourneys.some(j => j.id === prev) ? prev : (orderedJourneys[0]?.id ?? '')));
    }, [orderedJourneys]);

    const selectedJourney = orderedJourneys.find(j => j.id === selectedId) || null;
    const journeySubflows = useMemo(
        () => (selectedId ? subflowsByJourney[selectedId] || [] : []),
        [selectedId, subflowsByJourney],
    );
    const tree = useMemo(() => buildSubflowTree(journeySubflows), [journeySubflows]);
    const metrics = useMemo(() => computeMetrics(journeySubflows, casesBySubflow), [journeySubflows, casesBySubflow]);

    // ── Mutações ──────────────────────────────────────────────────────────
    const saveSubflow = async (draft: QAJourneySubflowDraft) => {
        try {
            if (subflowForm.initial?.id) await updateSubflow(subflowForm.initial.id, draft);
            else await createSubflow(draft);
            setSubflowForm({ open: false, initial: null, defaultParentId: null });
            onReload();
        } catch (e) {
            alert('Erro ao salvar subfluxo: ' + errorMessage(e));
            throw e;
        }
    };
    const saveCase = async (draft: QAJourneyCaseDraft) => {
        try {
            if (caseForm.initial?.id) await updateCase(caseForm.initial.id, draft);
            else await createCase(draft);
            setCaseForm({ open: false, subflowId: '', initial: null });
            onReload();
        } catch (e) {
            alert('Erro ao salvar caso: ' + errorMessage(e));
            throw e;
        }
    };

    const removeCase = async () => {
        if (!removeCaseTarget || removingCase) return;
        setRemovingCase(true);
        try {
            await removeJourneyCase(removeCaseTarget);
            setRemoveCaseTarget(null);
            setCaseDetailId(null);   // fecha o detalhe se a remoção veio de lá
            onReload();
        } catch (e) {
            alert('Erro ao remover caso: ' + errorMessage(e));
        } finally {
            setRemovingCase(false);
        }
    };

    const cb: SubflowBlockCallbacks = {
        onOpenCase: id => setCaseDetailId(id),
        onOpenSubflow: id => setSubflowDetailId(id),
        onAddCase: subflowId => setCaseForm({ open: true, subflowId, initial: null }),
        onAddChild: parentId => setSubflowForm({ open: true, initial: null, defaultParentId: parentId }),
        onAddDocument: subflowId => {
            const sf = journeySubflows.find(s => s.id === subflowId) || null;
            setSubflowForm({ open: true, initial: sf, defaultParentId: sf?.parent_subflow_id ?? null });
        },
        onImportCases: subflowId => setImportSubflowId(subflowId),
        onRemoveCase: case_ => setRemoveCaseTarget(case_),
    };

    const importSubflow = importSubflowId ? journeySubflows.find(s => s.id === importSubflowId) || null : null;

    // Detalhe (drawers) — resolve subfluxo/caso a partir dos ids.
    const detailSubflow = subflowDetailId ? journeySubflows.find(s => s.id === subflowDetailId) || null : null;
    const allCases = useMemo(() => Object.values(casesBySubflow).flat(), [casesBySubflow]);
    const detailCase = caseDetailId ? allCases.find(c => c.id === caseDetailId) || null : null;
    const detailCaseSubflow = detailCase ? journeySubflows.find(s => s.id === detailCase.subflow_id) || null : null;

    // Pai candidato no form: subfluxos da jornada menos a subárvore do que edita.
    const parentOptions = useMemo(() => {
        if (!subflowForm.open) return [];
        const blocked = subflowForm.initial?.id ? descendantIds(journeySubflows, subflowForm.initial.id) : new Set<string>();
        return journeySubflows.filter(s => !blocked.has(s.id));
    }, [subflowForm, journeySubflows]);

    return (
        <div className="flex h-full bg-card border border-border rounded-2xl overflow-hidden">
            {/* ── Coluna de jornadas (recolhível) ─────────────────────────── */}
            <aside className={`shrink-0 border-r border-border flex flex-col transition-all ${collapsed ? 'w-14' : 'w-64 sm:w-72'}`}>
                <div className="flex items-center justify-between px-3 py-3 border-b border-border">
                    {!collapsed && (
                        <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                            <GitBranch className="w-4 h-4 text-brand" /> Jornadas
                            <span className="text-muted-foreground font-normal">{orderedJourneys.length}</span>
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expandir jornadas' : 'Recolher jornadas'}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    >
                        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1.5">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleJourneyDragEnd}>
                        <SortableContext items={orderedJourneys.map(j => j.id)} strategy={verticalListSortingStrategy}>
                            {orderedJourneys.map(j => (
                                <SortableJourneyCard
                                    key={j.id}
                                    journey={j}
                                    collapsed={collapsed}
                                    active={j.id === selectedId}
                                    metrics={computeMetrics(subflowsByJourney[j.id] || [], casesBySubflow)}
                                    onSelect={() => setSelectedId(j.id)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            </aside>

            {/* ── Área principal ──────────────────────────────────────────── */}
            <section className="flex-1 min-w-0 flex flex-col">
                {/* Top bar: métricas + ver esta jornada no mapa visual */}
                <div className="px-4 py-3 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-foreground truncate">{selectedJourney?.title || 'Jornada'}</h2>
                        {selectedJourney?.description && (
                            <p className="text-xs text-muted-foreground truncate">{selectedJourney.description}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <MetricChip label="Cobertura" value={`${metrics.coveragePct}%`} tone="brand" />
                        <MetricChip label="Automatizados" value={metrics.automatedCases} tone="success" />
                        <MetricChip label="Manual" value={metrics.manualCases} tone="muted" />
                        <MetricChip label="Passando" value={metrics.passing} tone="success" />
                        <MetricChip label="Falhando" value={metrics.failing} tone="danger" />
                        <button
                            type="button"
                            onClick={() => setExportOpen(true)}
                            title="Exportar documentação (.md / .html)"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-2 border border-border bg-foreground/5 text-foreground hover:border-brand/50 hover:text-brand transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden lg:inline">Exportar</span>
                        </button>
                        {selectedJourney && (
                            <button
                                type="button"
                                onClick={() => onOpenJourneyMap(selectedJourney.id)}
                                title="Ver esta jornada no mapa visual"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-2 border border-border bg-foreground/5 text-foreground hover:border-brand/50 hover:text-brand transition-colors"
                            >
                                <MapIcon className="w-4 h-4" />
                                <span className="hidden lg:inline">Ver no mapa</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Kanban de subfluxos-raiz */}
                <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">
                    {!selectedJourney ? (
                        <Empty text="Selecione uma jornada na coluna ao lado." />
                    ) : tree.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 h-full text-center">
                            <p className="text-sm text-muted-foreground">Esta jornada ainda não tem subfluxos.</p>
                            <AddRootButton onClick={() => setSubflowForm({ open: true, initial: null, defaultParentId: null })} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5 items-start min-w-min">
                            {tree.map(node => (
                                <SubflowBlock key={node.subflow.id} node={node} casesBySubflow={casesBySubflow} cb={cb} />
                            ))}
                            <div className="w-full sm:w-[18rem]">
                                <AddRootButton onClick={() => setSubflowForm({ open: true, initial: null, defaultParentId: null })} />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Modais / drawers ────────────────────────────────────────── */}
            {subflowForm.open && selectedJourney && (
                <SubflowFormModal
                    journeyId={selectedJourney.id}
                    journeyTitle={selectedJourney.title}
                    initial={subflowForm.initial}
                    defaultSequence={journeySubflows.length}
                    testCases={testCases}
                    parentOptions={parentOptions}
                    defaultParentId={subflowForm.defaultParentId}
                    onClose={() => setSubflowForm({ open: false, initial: null, defaultParentId: null })}
                    onSave={saveSubflow}
                />
            )}

            {exportOpen && (
                <ExportModal
                    journeys={orderedJourneys}
                    subflowsByJourney={subflowsByJourney}
                    casesBySubflow={casesBySubflow}
                    defaultJourneyId={selectedId || null}
                    onClose={() => setExportOpen(false)}
                />
            )}

            {caseForm.open && (
                <CaseFormModal
                    subflowId={caseForm.subflowId}
                    subflowTitle={journeySubflows.find(s => s.id === caseForm.subflowId)?.title}
                    initial={caseForm.initial}
                    testCases={testCases}
                    siblingCount={(casesBySubflow[caseForm.subflowId] || []).length}
                    projectId={projectId}
                    onClose={() => setCaseForm({ open: false, subflowId: '', initial: null })}
                    onSave={saveCase}
                />
            )}

            {importSubflow && (
                <ImportCasesModal
                    projectId={projectId}
                    subflowId={importSubflow.id}
                    subflowTitle={importSubflow.title}
                    existingCases={casesBySubflow[importSubflow.id] || []}
                    onClose={() => setImportSubflowId(null)}
                    onImported={() => { setImportSubflowId(null); onReload(); }}
                />
            )}

            <AnimatePresence>
                {detailSubflow && selectedJourney && (
                    <SubflowModal
                        journey={selectedJourney}
                        subflow={detailSubflow}
                        cases={casesBySubflow[detailSubflow.id] || []}
                        onSelectCase={id => { setSubflowDetailId(null); setCaseDetailId(id); }}
                        onClose={() => setSubflowDetailId(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {detailCase && detailCaseSubflow && (
                    <CaseDetailModal
                        subflow={detailCaseSubflow}
                        case_={detailCase}
                        testCases={testCases}
                        onBack={() => setCaseDetailId(null)}
                        onClose={() => setCaseDetailId(null)}
                        onCaseUpdated={onCaseUpdated}
                        onDelete={() => setRemoveCaseTarget(detailCase)}
                    />
                )}
            </AnimatePresence>

            {removeCaseTarget && (
                <DeleteConfirmModal
                    title="Remover caso da jornada"
                    message={
                        removeCaseTarget.external_id
                            ? `"${removeCaseTarget.title}" veio de uma planilha e será arquivado (some da jornada sem reaparecer no próximo sync).${removeCaseTarget.test_case_id ? ' O teste Maestro vinculado é preservado.' : ''}`
                            : `"${removeCaseTarget.title}" será removido do fluxo.${removeCaseTarget.test_case_id ? ' O teste Maestro vinculado é preservado.' : ''}`
                    }
                    confirmLabel={removingCase ? 'Removendo…' : 'Remover'}
                    onCancel={() => { if (!removingCase) setRemoveCaseTarget(null); }}
                    onConfirm={removeCase}
                />
            )}
        </div>
    );
}

function SortableJourneyCard({
    journey, collapsed, active, metrics, onSelect,
}: {
    journey: QAJourney;
    collapsed: boolean;
    active: boolean;
    metrics: ReturnType<typeof computeMetrics>;
    onSelect: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: journey.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        opacity: isDragging ? 0.85 : 1,
    };
    // Jornada só de documentação (nenhum caso, mas há sub-fluxos-documento):
    // métricas de cobertura/execução não se aplicam — mostra a tag "Documentação".
    const docOnly = metrics.totalCases === 0 && metrics.docCount > 0;

    if (collapsed) {
        return (
            <button
                ref={setNodeRef}
                style={style}
                type="button"
                onClick={onSelect}
                title={journey.title}
                {...attributes}
                {...listeners}
                className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-xs font-bold transition-colors cursor-grab active:cursor-grabbing ${
                    active ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:bg-foreground/5'
                } ${isDragging ? 'ring-2 ring-brand shadow-xl' : ''}`}
            >
                {journey.title.slice(0, 2).toUpperCase()}
            </button>
        );
    }

    return (
        <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={onSelect}
            {...attributes}
            {...listeners}
            className={`group text-left rounded-xl border px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing ${
                docOnly
                    ? (active ? 'border-brand/50 bg-brand/10' : 'border-brand/20 bg-brand/[0.04] hover:border-brand/40')
                    : (active ? 'border-brand/50 bg-brand/[0.06]' : 'border-border hover:border-brand/30 hover:bg-foreground/5')
            } ${isDragging ? 'ring-2 ring-brand shadow-xl' : ''}`}
        >
            <div className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 -ml-1 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                <span className="font-semibold text-sm text-foreground truncate flex-1">{journey.title}</span>
                {!journey.is_published && (
                    <span className="text-[8px] uppercase font-bold text-muted-foreground bg-foreground/10 rounded px-1 py-0.5">Rascunho</span>
                )}
            </div>
            {docOnly ? (
                <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/15 rounded-md px-2 py-0.5">
                        <FileCode2 className="w-3 h-3" />
                        {metrics.docCount === 1 ? 'Documentação' : `Documentação · ${metrics.docCount}`}
                    </span>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${metrics.coveragePct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-brand tabular-nums">{metrics.coveragePct}%</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        <span>{metrics.automatedCases} auto</span>
                        <span>{metrics.manualCases} manual</span>
                        <span className="text-green-500">{metrics.passing} ok</span>
                        <span className="text-red-500">{metrics.failing} falhas</span>
                    </div>
                </>
            )}
        </button>
    );
}

function MetricChip({ label, value, tone }: { label: string; value: string | number; tone: 'brand' | 'muted' | 'success' | 'danger' }) {
    const toneClass = {
        brand: 'text-brand',
        muted: 'text-foreground',
        success: 'text-green-500',
        danger: 'text-red-500',
    }[tone];
    return (
        <div className="flex flex-col items-center px-2.5 py-1 rounded-lg bg-foreground/5 border border-border">
            <span className={`text-sm font-bold tabular-nums leading-none ${toneClass}`}>{value}</span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</span>
        </div>
    );
}

function AddRootButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full border border-dashed border-border rounded-xl px-3 py-3 text-sm text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors inline-flex items-center justify-center gap-1.5"
        >
            <Plus className="w-4 h-4" /> Adicionar subfluxo
        </button>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ChevronRight className="w-4 h-4" /> {text}</span>
        </div>
    );
}
