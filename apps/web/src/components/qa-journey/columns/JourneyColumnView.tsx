'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
    ChevronRight, GitBranch, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Plus,
} from 'lucide-react';
import {
    createCase, createSubflow, updateCase, updateSubflow, type TestCaseOption,
} from '@/lib/qa-journey/api';
import type {
    QAJourney, QAJourneyCase, QAJourneyCaseDraft, QAJourneySubflow, QAJourneySubflowDraft,
} from '@/types/qa-journey';
import { SubflowFormModal } from '../SubflowFormModal';
import { CaseFormModal } from '../CaseFormModal';
import { ImportCasesModal } from '../ImportCasesModal';
import { SubflowModal } from '../map/SubflowModal';
import { CaseDetailModal } from '../map/CaseDetailModal';
import { SubflowBlock, type SubflowBlockCallbacks } from './SubflowBlock';
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

    const [subflowForm, setSubflowForm] = useState<SubflowFormState>({ open: false, initial: null, defaultParentId: null });
    const [caseForm, setCaseForm] = useState<CaseFormState>({ open: false, subflowId: '', initial: null });
    const [importSubflowId, setImportSubflowId] = useState<string | null>(null);
    const [subflowDetailId, setSubflowDetailId] = useState<string | null>(null);
    const [caseDetailId, setCaseDetailId] = useState<string | null>(null);

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
        setSelectedId(prev => (prev && journeys.some(j => j.id === prev) ? prev : (journeys[0]?.id ?? '')));
    }, [journeys]);

    const selectedJourney = journeys.find(j => j.id === selectedId) || null;
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
            alert('Erro ao salvar subfluxo: ' + (e instanceof Error ? e.message : String(e)));
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
            alert('Erro ao salvar caso: ' + (e instanceof Error ? e.message : String(e)));
            throw e;
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
                            <span className="text-muted-foreground font-normal">{journeys.length}</span>
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
                    {journeys.map(j => {
                        const m = computeMetrics(subflowsByJourney[j.id] || [], casesBySubflow);
                        const active = j.id === selectedId;
                        if (collapsed) {
                            return (
                                <button
                                    key={j.id}
                                    type="button"
                                    onClick={() => setSelectedId(j.id)}
                                    title={j.title}
                                    className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                                        active ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:bg-foreground/5'
                                    }`}
                                >
                                    {j.title.slice(0, 2).toUpperCase()}
                                </button>
                            );
                        }
                        return (
                            <button
                                key={j.id}
                                type="button"
                                onClick={() => setSelectedId(j.id)}
                                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                                    active ? 'border-brand/50 bg-brand/[0.06]' : 'border-border hover:border-brand/30 hover:bg-foreground/5'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-foreground truncate flex-1">{j.title}</span>
                                    {!j.is_published && (
                                        <span className="text-[8px] uppercase font-bold text-muted-foreground bg-foreground/10 rounded px-1 py-0.5">Rascunho</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                                        <div className="h-full rounded-full bg-brand" style={{ width: `${m.coveragePct}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-brand tabular-nums">{m.coveragePct}%</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                                    <span>{m.automatedCases} auto</span>
                                    <span>{m.manualCases} manual</span>
                                    <span className="text-green-500">{m.passing} ok</span>
                                    <span className="text-red-500">{m.failing} falhas</span>
                                </div>
                            </button>
                        );
                    })}
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
                        <div className="flex gap-3 items-start min-w-min">
                            {tree.map(node => (
                                <div key={node.subflow.id} className="w-60 shrink-0 flex flex-col gap-2">
                                    <SubflowBlock node={node} casesBySubflow={casesBySubflow} cb={cb} />
                                </div>
                            ))}
                            <div className="w-60 shrink-0">
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

            {caseForm.open && (
                <CaseFormModal
                    subflowId={caseForm.subflowId}
                    subflowTitle={journeySubflows.find(s => s.id === caseForm.subflowId)?.title}
                    initial={caseForm.initial}
                    testCases={testCases}
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
                    />
                )}
            </AnimatePresence>
        </div>
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
