'use client';

// Importação de casos de teste a partir de uma planilha Google Sheets,
// direto para um sub-fluxo. Reaproveita a integração já configurada na API
// (service account) e, quando o projeto tem um Sync Sheets configurado,
// pré-carrega a planilha e o mapeamento de colunas automaticamente.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2, RefreshCw, Search } from 'lucide-react';

import { ModalShell } from './ModalShell';
import { formatExternalId } from './columns/helpers';
import { createCase, errorMessage } from '@/lib/qa-journey/api';
import {
    fetchSheetPreview,
    fetchSheetTabs,
    listSheetConfigs,
    parseSpreadsheetId,
} from '@/lib/qa-journey/sheet-api';
import { RUN_STATUS_DISPLAY, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { QAJourneySheetConfig, SheetTab } from '@/types/qa-journey-sheet';
import type { CasePriority, CaseRunStatus, QAJourneyCase } from '@/types/qa-journey';

interface ImportCasesModalProps {
    projectId: string;
    subflowId: string;
    subflowTitle: string;
    existingCases: QAJourneyCase[];
    onClose: () => void;
    onImported: (created: QAJourneyCase[]) => void;
}

// Colunas que o usuário pode mapear (título é obrigatório).
type ImportField =
    | 'external_id'
    | 'platform'
    | 'title'
    | 'steps_summary'
    | 'expected_result'
    | 'priority'
    | 'last_run_status'
    | 'last_run_at';
type ImportColumnMap = Record<ImportField, string>;  // '' = não mapeada

// A ordem das chaves define a ordem dos selects na UI — espelha o layout
// recomendado da planilha do QA: ID, Plataforma, Título, Passos/Descrição,
// Resultado esperado, Prioridade, Status, Data.
const FIELD_LABELS: Record<ImportField, string> = {
    external_id: 'ID',
    platform: 'Plataforma',
    title: 'Título *',
    steps_summary: 'Passos / Descrição',
    expected_result: 'Resultado esperado',
    priority: 'Prioridade',
    last_run_status: 'Status',
    last_run_at: 'Data execução',
};

const FIELD_GUESS: Record<ImportField, RegExp> = {
    external_id: /^(id|#)$|c[oó]d|external|ct[-_ ]?\d*/i,
    platform: /plataforma|platform|ambiente|device|canal/i,
    title: /t[ií]tulo|title|caso|cen[aá]rio|nome/i,
    steps_summary: /passo|step|procedimento|descri/i,
    expected_result: /esperado|expected/i,
    priority: /prior/i,
    last_run_status: /^status|situa[cç]|resultado da exec/i,
    last_run_at: /data|date|executad|registro/i,
};

function guessColumnMap(headers: string[], config: QAJourneySheetConfig | null): ImportColumnMap {
    const map: ImportColumnMap = {
        external_id: '', platform: '', title: '', steps_summary: '',
        expected_result: '', priority: '', last_run_status: '', last_run_at: '',
    };
    const fields = Object.keys(FIELD_GUESS) as ImportField[];

    // 1) Mapeamento já salvo no Sync Sheets do projeto tem prioridade
    // (column_map do sync não conhece platform/last_run_at — lookup parcial)
    const configMap = (config?.column_map ?? {}) as Partial<Record<ImportField, string | null>>;
    for (const field of fields) {
        const fromConfig = configMap[field];
        if (fromConfig && headers.includes(fromConfig)) map[field] = fromConfig;
    }
    // 2) Heurística por nome de coluna para o que sobrou
    const taken = new Set(Object.values(map).filter(Boolean));
    for (const field of fields) {
        if (map[field]) continue;
        const hit = headers.find(h => h.trim() && !taken.has(h) && FIELD_GUESS[field].test(h));
        if (hit) {
            map[field] = hit;
            taken.add(hit);
        }
    }
    // 3) Título é obrigatório: cai para a primeira coluna não usada
    if (!map.title) {
        map.title = headers.find(h => h.trim() && !taken.has(h)) || headers[0] || '';
    }
    return map;
}

function normalizePriority(value: string): CasePriority {
    if (/cr[ií]t/i.test(value)) return 'critical';
    if (/alta|high/i.test(value)) return 'high';
    if (/baixa|low/i.test(value)) return 'low';
    return 'medium';
}

// Converte o texto livre da planilha em CaseRunStatus (null = não reconhecido).
function normalizeRunStatus(value: string): CaseRunStatus | null {
    const v = value.trim();
    if (!v) return null;
    if (/pass|aprovad|sucesso|^ok$/i.test(v)) return 'pass';
    if (/fail|falh|reprovad|erro/i.test(v)) return 'fail';
    if (/skip|pulad|bloquead|n\/a/i.test(v)) return 'skipped';
    if (/not[ _]?run|n[aã]o (rodado|executado)|pendente/i.test(v)) return 'not_run';
    return null;
}

// Aceita dd/mm/aaaa (com hora opcional) e ISO aaaa-mm-dd. Retorna ISO ou null.
function parseSheetDate(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (br) {
        const [, d, m, y, hh, mm] = br;
        const year = y.length === 2 ? Number(`20${y}`) : Number(y);
        const date = new Date(year, Number(m) - 1, Number(d), Number(hh || 0), Number(mm || 0));
        return isNaN(date.getTime()) ? null : date.toISOString();
    }
    const parsed = new Date(v);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

interface SheetRow {
    index: number;            // índice na planilha (para mensagens)
    cells: Record<string, string>;  // header -> valor
    duplicate: boolean;       // já existe no sub-fluxo (external_id ou título)
}

export function ImportCasesModal({ projectId, subflowId, subflowTitle, existingCases, onClose, onImported }: ImportCasesModalProps) {
    const [config, setConfig] = useState<QAJourneySheetConfig | null>(null);
    const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
    const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
    const [tabs, setTabs] = useState<SheetTab[]>([]);
    const [sheetName, setSheetName] = useState('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<SheetRow[]>([]);
    const [columnMap, setColumnMap] = useState<ImportColumnMap | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const [loadingTabs, setLoadingTabs] = useState(false);
    const [loadingRows, setLoadingRows] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const loadTabs = useCallback(async (id: string) => {
        setLoadingTabs(true);
        setError(null);
        try {
            const list = await fetchSheetTabs(id);
            setSpreadsheetId(id);
            setTabs(list);
            return list;
        } catch (e) {
            setError(errorMessage(e));
            return [];
        } finally {
            setLoadingTabs(false);
        }
    }, []);

    const loadRows = useCallback(async (id: string, tab: string, cfg: QAJourneySheetConfig | null) => {
        setLoadingRows(true);
        setError(null);
        setRows([]);
        setColumnMap(null);
        try {
            const headerRow = cfg?.sheet_name === tab ? cfg.header_row : 1;
            const preview = await fetchSheetPreview(id, tab, headerRow, 1000);
            const map = guessColumnMap(preview.headers, cfg?.sheet_name === tab ? cfg : null);

            const knownIds = new Set(existingCases.map(c => (c.external_id || '').trim().toLowerCase()).filter(Boolean));
            const knownTitles = new Set(existingCases.map(c => c.title.trim().toLowerCase()));

            const parsed: SheetRow[] = preview.rows.map((cells, i) => {
                const record: Record<string, string> = {};
                preview.headers.forEach((h, col) => { record[h] = (cells[col] || '').trim(); });
                const title = map.title ? record[map.title] : '';
                const extId = map.external_id ? record[map.external_id] : '';
                return {
                    index: i,
                    cells: record,
                    duplicate: Boolean(
                        (extId && knownIds.has(extId.toLowerCase())) ||
                        (title && knownTitles.has(title.toLowerCase())),
                    ),
                };
            }).filter(r => map.title && r.cells[map.title]);

            setHeaders(preview.headers);
            setColumnMap(map);
            setRows(parsed);
            // Pré-seleciona tudo que ainda não existe no sub-fluxo
            setSelected(new Set(parsed.filter(r => !r.duplicate).map(r => r.index)));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setLoadingRows(false);
        }
    }, [existingCases]);

    // Boot: se o projeto tem Sync Sheets configurado, pré-carrega tudo.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const configs = await listSheetConfigs(projectId);
                if (cancelled) return;
                const cfg = configs.find(c => c.is_active) || configs[0] || null;
                if (cfg) {
                    setConfig(cfg);
                    setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}`);
                    const list = await loadTabs(cfg.spreadsheet_id);
                    if (cancelled) return;
                    const tab = list.find(t => t.title === cfg.sheet_name)?.title || list[0]?.title || '';
                    if (tab) {
                        setSheetName(tab);
                        await loadRows(cfg.spreadsheet_id, tab, cfg);
                    }
                }
            } catch {
                // Sem config (ou API offline) — usuário informa a URL manualmente.
            } finally {
                if (!cancelled) setBootstrapping(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const handleLoadTabs = async () => {
        const id = parseSpreadsheetId(spreadsheetUrl);
        if (!id) {
            setError('URL inválida. Cole o link completo da planilha Google ou apenas o ID.');
            return;
        }
        setRows([]);
        setSheetName('');
        const list = await loadTabs(id);
        if (list.length > 0) {
            setSheetName(list[0].title);
            await loadRows(id, list[0].title, config);
        }
    };

    const handleSelectTab = async (tab: string) => {
        setSheetName(tab);
        if (spreadsheetId) await loadRows(spreadsheetId, tab, config);
    };

    const toggleRow = (index: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const allSelected = rows.length > 0 && rows.every(r => selected.has(r.index));
    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(rows.map(r => r.index)));
    };

    const selectedRows = useMemo(() => rows.filter(r => selected.has(r.index)), [rows, selected]);

    const handleImport = async () => {
        if (!columnMap || selectedRows.length === 0) return;
        setImporting(true);
        setProgress(0);
        setError(null);
        const created: QAJourneyCase[] = [];
        try {
            for (const row of selectedRows) {
                const cell = (field: ImportField) => (columnMap[field] ? row.cells[columnMap[field]] || '' : '');
                const status = columnMap.last_run_status ? normalizeRunStatus(cell('last_run_status')) : null;
                const c = await createCase({
                    subflow_id: subflowId,
                    title: cell('title'),
                    external_id: cell('external_id') || null,
                    steps_summary: cell('steps_summary') || null,
                    expected_result: cell('expected_result') || null,
                    priority: columnMap.priority ? normalizePriority(cell('priority')) : 'medium',
                    // platform: undefined quando a coluna não está mapeada —
                    // mantém compatibilidade com banco sem a migration 009.
                    platform: columnMap.platform ? (cell('platform') || null) : undefined,
                    last_run_status: status,
                    last_run_at: columnMap.last_run_at ? parseSheetDate(cell('last_run_at')) : null,
                });
                created.push(c);
                setProgress(created.length);
            }
            onImported(created);
            onClose();
        } catch (e) {
            // Mantém o modal aberto mostrando o que já entrou
            if (created.length > 0) onImported(created);
            const msg = errorMessage(e);
            setError(`Falha após importar ${created.length} de ${selectedRows.length} casos: ${msg}`);
        } finally {
            setImporting(false);
        }
    };

    const canImport = Boolean(columnMap?.title) && selectedRows.length > 0 && !importing && !loadingRows;

    return (
        <ModalShell
            maxWidth="max-w-6xl"
            onClose={onClose}
            title={
                <>
                    <FileSpreadsheet className="w-5 h-5 text-brand" />
                    <span className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                        Importar casos
                        <span className="text-muted-foreground font-normal truncate">
                            para <span className="text-brand font-bold">{subflowTitle}</span>
                        </span>
                    </span>
                </>
            }
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={!canImport}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                        {importing
                            ? `Importando ${progress}/${selectedRows.length}…`
                            : `Importar ${selectedRows.length} ${selectedRows.length === 1 ? 'caso' : 'casos'}`}
                    </button>
                </>
            }
        >
            {bootstrapping ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Procurando planilha configurada do projeto…
                </div>
            ) : (
                <>
                    {/* Fonte: planilha + aba */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                        <div className="flex flex-col gap-1.5">
                            <Label>URL da planilha Google (ou ID)</Label>
                            <input
                                type="text"
                                value={spreadsheetUrl}
                                onChange={e => setSpreadsheetUrl(e.target.value)}
                                placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit"
                                className={inputClass}
                                disabled={loadingTabs || importing}
                            />
                        </div>
                        <button
                            onClick={handleLoadTabs}
                            disabled={loadingTabs || importing || !spreadsheetUrl.trim()}
                            className="bg-foreground/5 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-bold hover:bg-accent disabled:opacity-50 flex items-center gap-2 shrink-0"
                        >
                            {loadingTabs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Carregar abas
                        </button>
                    </div>

                    {tabs.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <Label>Aba da planilha</Label>
                            <select
                                value={sheetName}
                                onChange={e => handleSelectTab(e.target.value)}
                                className={inputClass}
                                disabled={loadingRows || importing}
                            >
                                {tabs.map(t => (
                                    <option key={t.sheetId} value={t.title}>
                                        {t.title} — {t.rowCount} linhas
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {error && (
                        <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger whitespace-pre-wrap break-words leading-relaxed">
                            {error}
                        </div>
                    )}

                    {loadingRows && (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                            Lendo casos da aba…
                        </div>
                    )}

                    {/* Mapeamento de colunas */}
                    {!loadingRows && columnMap && headers.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Mapeamento de colunas</Label>
                                <button
                                    onClick={() => spreadsheetId && sheetName && loadRows(spreadsheetId, sheetName, config)}
                                    disabled={importing}
                                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                    title="Recarregar linhas da planilha"
                                >
                                    <RefreshCw className="w-3 h-3" /> Recarregar
                                </button>
                            </div>
                            <p className="text-[11px] text-danger leading-snug">
                                Recomendável que a planilha do QA tenha as colunas com os mesmos nomes do mapeamento abaixo (ID, Plataforma, Título, Passos/Descrição, Resultado esperado, Prioridade, Status, Data execução) — assim a associação é automática.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {(Object.keys(FIELD_LABELS) as ImportField[]).map(field => (
                                    <div key={field} className="flex flex-col gap-1">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                            {FIELD_LABELS[field]}
                                        </span>
                                        <select
                                            value={columnMap[field]}
                                            onChange={e => setColumnMap({ ...columnMap, [field]: e.target.value })}
                                            className={`${inputClass} text-xs px-2`}
                                            disabled={importing}
                                        >
                                            <option value="">— Nenhuma —</option>
                                            {headers.filter(h => h.trim()).map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Seleção de casos */}
                    {!loadingRows && columnMap && rows.length > 0 && (
                        <div className="border border-border rounded-xl overflow-hidden">
                            <div className="overflow-x-auto custom-scrollbar max-h-[320px] overflow-y-auto">
                                <table className="w-full text-left text-sm text-muted-foreground whitespace-nowrap">
                                    <thead className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest bg-surface-muted/50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleAll}
                                                    className="accent-brand cursor-pointer"
                                                    aria-label="Selecionar todos"
                                                />
                                            </th>
                                            <th className="px-3 py-2 w-12">ID</th>
                                            <th className="px-3 py-2 w-24">Plataforma</th>
                                            <th className="px-3 py-2">Título</th>
                                            <th className="px-3 py-2 w-24">Prioridade</th>
                                            <th className="px-3 py-2 w-28">Status</th>
                                            <th className="px-3 py-2 w-32">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {rows.map(row => {
                                            const cell = (f: ImportField) => (columnMap[f] ? row.cells[columnMap[f]] || '' : '');
                                            const title = cell('title');
                                            const status = normalizeRunStatus(cell('last_run_status'));
                                            const statusColor = status
                                                ? RUN_STATUS_OPTIONS.find(o => o.value === status)?.color || ''
                                                : '';
                                            return (
                                                <tr
                                                    key={row.index}
                                                    className={`hover:bg-accent cursor-pointer ${row.duplicate ? 'opacity-60' : ''}`}
                                                    onClick={() => !importing && toggleRow(row.index)}
                                                >
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.has(row.index)}
                                                            onChange={() => toggleRow(row.index)}
                                                            onClick={e => e.stopPropagation()}
                                                            disabled={importing}
                                                            className="accent-brand cursor-pointer"
                                                            aria-label={`Selecionar ${title}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] font-mono" title={cell('external_id') || undefined}>{formatExternalId(cell('external_id')) || '—'}</td>
                                                    <td className="px-3 py-2 text-[11px]">{cell('platform') || '—'}</td>
                                                    <td className="px-3 py-2 text-foreground max-w-[380px]">
                                                        <span className="flex items-center gap-2">
                                                            <span className="truncate" title={title}>{title}</span>
                                                            {row.duplicate && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-warning/10 text-warning shrink-0">
                                                                    Já existe
                                                                </span>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px]">{cell('priority') || '—'}</td>
                                                    <td className="px-3 py-2">
                                                        {status ? (
                                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>
                                                                {RUN_STATUS_DISPLAY[status]}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px]">{cell('last_run_status') || '—'}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px]">{cell('last_run_at') || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground bg-surface-muted/30">
                                {rows.length} {rows.length === 1 ? 'caso encontrado' : 'casos encontrados'} na aba ·{' '}
                                {selectedRows.length} {selectedRows.length === 1 ? 'selecionado' : 'selecionados'} ·{' '}
                                casos marcados como &quot;já existe&quot; têm o mesmo ID externo ou título de um caso do sub-fluxo
                            </div>
                        </div>
                    )}

                    {!loadingRows && columnMap && rows.length === 0 && !error && (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                            Nenhuma linha com título encontrada nesta aba. Confira o mapeamento de colunas.
                        </div>
                    )}
                </>
            )}
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}
