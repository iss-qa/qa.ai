'use client';

// Exporta jornadas/sub-fluxos/casos selecionados para .md ou .html (inverso do
// import de HTML). Árvore com checkboxes tri-state: jornada → sub-fluxos →
// casos. O documento é gerado no client e baixado (sem chamadas externas).

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Download, FileCode2, FileText, GitBranch, Loader2, Minus } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { buildSubflowTree, flattenTree, formatExternalId, type SubflowTreeNode } from './columns/helpers';
import {
    buildHtml, buildMarkdown, downloadTextFile, fetchImagesAsDataUris, slugifyFilename,
    type ExportJourney, type ExportSubflow,
} from '@/lib/qa-journey/export-doc';
import type { QAJourney, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface ExportModalProps {
    journeys: QAJourney[];
    subflowsByJourney: Record<string, QAJourneySubflow[]>;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    defaultJourneyId?: string | null;   // expande/pré-seleciona esta jornada
    onClose: () => void;
}

type Format = 'md' | 'html';
type TriState = 'all' | 'some' | 'none';

export function ExportModal({ journeys, subflowsByJourney, casesBySubflow, defaultJourneyId, onClose }: ExportModalProps) {
    const [format, setFormat] = useState<Format>('md');
    // Seleção: ids de CASOS + ids de sub-fluxos SEM casos (documento) incluídos.
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultJourneyId ? [defaultJourneyId] : []));
    const [exporting, setExporting] = useState(false);

    // Árvore (ordenada) por jornada + lista achatada de sub-fluxos.
    const trees = useMemo(() => {
        const map: Record<string, SubflowTreeNode[]> = {};
        for (const j of journeys) map[j.id] = buildSubflowTree(subflowsByJourney[j.id] || []);
        return map;
    }, [journeys, subflowsByJourney]);

    // Chaves "selecionáveis" de um sub-fluxo: ids dos casos; se não tem casos,
    // o próprio id do sub-fluxo (para incluir sub-fluxo de documento).
    const keysOfSubflow = (s: QAJourneySubflow): string[] => {
        const cs = casesBySubflow[s.id] || [];
        return cs.length > 0 ? cs.map(c => c.id) : [s.id];
    };
    const keysOfJourney = (j: QAJourney): string[] =>
        (trees[j.id] || []).flatMap(n => flattenTree(n)).flatMap(keysOfSubflow);

    const triFor = (keys: string[]): TriState => {
        if (keys.length === 0) return 'none';
        const sel = keys.filter(k => selected.has(k)).length;
        return sel === 0 ? 'none' : sel === keys.length ? 'all' : 'some';
    };

    const toggleKeys = (keys: string[]) => {
        setSelected(prev => {
            const next = new Set(prev);
            const allSel = keys.length > 0 && keys.every(k => next.has(k));
            for (const k of keys) { if (allSel) next.delete(k); else next.add(k); }
            return next;
        });
    };

    const allCaseIds = useMemo(() => {
        const s = new Set<string>();
        for (const list of Object.values(casesBySubflow)) for (const c of list) s.add(c.id);
        return s;
    }, [casesBySubflow]);
    const selectedCaseCount = useMemo(
        () => Array.from(selected).filter(id => allCaseIds.has(id)).length,
        [selected, allCaseIds],
    );

    const toggleExpand = (id: string) =>
        setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });

    const allKeys = useMemo(() => journeys.flatMap(keysOfJourney), [journeys, trees]); // eslint-disable-line react-hooks/exhaustive-deps
    const masterTri = triFor(allKeys);

    // Monta a estrutura de export a partir da seleção e dispara o download.
    const handleExport = async () => {
        setExporting(true);
        try {
            const payload: ExportJourney[] = [];
            for (const journey of journeys) {
                const subflows: ExportSubflow[] = [];
                const walk = (nodes: SubflowTreeNode[], depth: number) => {
                    for (const n of nodes) {
                        const cs = casesBySubflow[n.subflow.id] || [];
                        const picked = cs.filter(c => selected.has(c.id));
                        const includeEmptyDoc = cs.length === 0 && selected.has(n.subflow.id);
                        if (picked.length > 0 || includeEmptyDoc) {
                            subflows.push({ subflow: n.subflow, cases: picked, depth });
                        }
                        if (n.children.length) walk(n.children, depth + 1);
                    }
                };
                walk(trees[journey.id] || [], 0);
                if (subflows.length > 0) payload.push({ journey, subflows });
            }
            if (payload.length === 0) return;

            const single = payload.length === 1 ? payload[0].journey.title : 'jornadas-qamind';
            if (format === 'md') {
                downloadTextFile(`${slugifyFilename(single)}.md`, buildMarkdown(payload), 'text/markdown');
            } else {
                // HTML self-contained: embute as evidências (imagens) como data URI
                // para o documento ficar visual ao reimportar (sem links quebrados).
                const imageUrls = payload.flatMap(j => j.subflows).flatMap(s => s.cases)
                    .filter(c => c.evidence_type === 'image' && c.evidence_url)
                    .map(c => c.evidence_url as string);
                const imageMap = imageUrls.length ? await fetchImagesAsDataUris(imageUrls) : {};
                downloadTextFile(`${slugifyFilename(single)}.html`, buildHtml(payload, { imageMap }), 'text/html');
            }
            onClose();
        } finally {
            setExporting(false);
        }
    };

    return (
        <ModalShell
            title={<><Download className="w-5 h-5 text-brand" /> Exportar documentação</>}
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => void handleExport()}
                        disabled={selected.size === 0 || exporting}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Exportar {selectedCaseCount > 0 && `(${selectedCaseCount} ${selectedCaseCount === 1 ? 'caso' : 'casos'})`}
                    </button>
                </>
            }
        >
            {/* Formato */}
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Formato</span>
                <div className="flex gap-2">
                    <FormatButton active={format === 'md'} onClick={() => setFormat('md')} icon={<FileText className="w-4 h-4" />} label="Markdown (.md)" hint="Ideal p/ reimportar no Outline" />
                    <FormatButton active={format === 'html'} onClick={() => setFormat('html')} icon={<FileCode2 className="w-4 h-4" />} label="HTML (.html)" hint="Estilizado p/ leitura/print" />
                </div>
            </div>

            {/* Seleção */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">O que exportar</span>
                    <button
                        type="button"
                        onClick={() => toggleKeys(allKeys)}
                        className="text-[11px] font-semibold text-brand hover:underline"
                    >
                        {masterTri === 'all' ? 'Limpar seleção' : 'Selecionar tudo'}
                    </button>
                </div>

                <div className="border border-border rounded-xl divide-y divide-border max-h-[46vh] overflow-y-auto custom-scrollbar">
                    {journeys.length === 0 && (
                        <p className="text-xs text-muted-foreground italic p-3">Nenhuma jornada neste projeto.</p>
                    )}
                    {journeys.map(j => {
                        const jKeys = keysOfJourney(j);
                        const isOpen = expanded.has(j.id);
                        const roots = trees[j.id] || [];
                        return (
                            <div key={j.id}>
                                <Row indent={0}>
                                    <Checkbox state={triFor(jKeys)} onClick={() => toggleKeys(jKeys)} disabled={jKeys.length === 0} />
                                    <button type="button" onClick={() => toggleExpand(j.id)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                                        {roots.length > 0
                                            ? (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)
                                            : <span className="w-3.5 shrink-0" />}
                                        <GitBranch className="w-3.5 h-3.5 text-brand shrink-0" />
                                        <span className="text-sm font-bold text-foreground truncate">{j.title}</span>
                                    </button>
                                </Row>
                                {isOpen && roots.map(node => (
                                    <SubflowRows
                                        key={node.subflow.id}
                                        node={node}
                                        depth={1}
                                        casesBySubflow={casesBySubflow}
                                        selected={selected}
                                        expanded={expanded}
                                        triFor={triFor}
                                        keysOfSubflow={keysOfSubflow}
                                        onToggleKeys={toggleKeys}
                                        onToggleExpand={toggleExpand}
                                        onToggleCase={id => toggleKeys([id])}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                    Selecione jornadas, sub-fluxos ou casos específicos. Sub-fluxos de documento (sem casos) entram com título e descrição.
                </p>
            </div>
        </ModalShell>
    );
}

// Linhas recursivas de sub-fluxo + casos.
function SubflowRows({
    node, depth, casesBySubflow, selected, expanded, triFor, keysOfSubflow, onToggleKeys, onToggleExpand, onToggleCase,
}: {
    node: SubflowTreeNode;
    depth: number;
    casesBySubflow: Record<string, QAJourneyCase[]>;
    selected: Set<string>;
    expanded: Set<string>;
    triFor: (keys: string[]) => TriState;
    keysOfSubflow: (s: QAJourneySubflow) => string[];
    onToggleKeys: (keys: string[]) => void;
    onToggleExpand: (id: string) => void;
    onToggleCase: (id: string) => void;
}) {
    const { subflow, children } = node;
    const cases = casesBySubflow[subflow.id] || [];
    const keys = keysOfSubflow(subflow);
    const expandable = cases.length > 0 || children.length > 0;
    const isOpen = expanded.has(subflow.id);

    return (
        <>
            <Row indent={depth}>
                <Checkbox state={triFor(keys)} onClick={() => onToggleKeys(keys)} />
                <button type="button" onClick={() => expandable && onToggleExpand(subflow.id)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                    {expandable
                        ? (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)
                        : <span className="w-3.5 shrink-0" />}
                    <span className="text-[13px] font-semibold text-foreground truncate">{subflow.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                        {cases.length > 0 ? `${cases.length} ${cases.length === 1 ? 'caso' : 'casos'}` : (subflow.html_doc ? 'documento' : 'sem casos')}
                    </span>
                </button>
            </Row>
            {isOpen && cases.map(c => (
                <Row key={c.id} indent={depth + 1}>
                    <Checkbox state={selected.has(c.id) ? 'all' : 'none'} onClick={() => onToggleCase(c.id)} />
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                        {c.external_id && <span className="text-[10px] font-mono text-muted-foreground shrink-0" title={c.external_id}>{formatExternalId(c.external_id)}</span>}
                        <span className="text-xs text-foreground truncate">{c.title}</span>
                    </span>
                </Row>
            ))}
            {isOpen && children.map(child => (
                <SubflowRows
                    key={child.subflow.id}
                    node={child}
                    depth={depth + 1}
                    casesBySubflow={casesBySubflow}
                    selected={selected}
                    expanded={expanded}
                    triFor={triFor}
                    keysOfSubflow={keysOfSubflow}
                    onToggleKeys={onToggleKeys}
                    onToggleExpand={onToggleExpand}
                    onToggleCase={onToggleCase}
                />
            ))}
        </>
    );
}

function Row({ indent, children }: { indent: number; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/[0.03]" style={{ paddingLeft: 12 + indent * 18 }}>
            {children}
        </div>
    );
}

function Checkbox({ state, onClick, disabled }: { state: TriState; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors disabled:opacity-30 ${
                state === 'none' ? 'border-border bg-transparent hover:border-brand/50' : 'border-brand bg-brand text-white'
            }`}
            aria-checked={state === 'all'}
            role="checkbox"
        >
            {state === 'all' && <Check className="w-3 h-3" strokeWidth={3} />}
            {state === 'some' && <Minus className="w-3 h-3" strokeWidth={3} />}
        </button>
    );
}

function FormatButton({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex-1 flex flex-col gap-0.5 items-start rounded-lg border px-3 py-2 transition-colors ${
                active ? 'border-brand bg-brand/10' : 'border-border hover:border-brand/40'
            }`}
        >
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${active ? 'text-brand' : 'text-foreground'}`}>
                {icon} {label}
            </span>
            <span className="text-[10px] text-muted-foreground">{hint}</span>
        </button>
    );
}
