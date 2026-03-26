'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { DAEMON_URL } from '@/lib/constants';
import {
    FileText, FolderOpen, Download, Search, Filter,
    RefreshCw, ChevronRight, AlertCircle, Info, Cpu,
    Play, Pause, ChevronsDown, Copy, Check, Layers,
} from 'lucide-react';

interface LogFile {
    category: string;
    filename: string;
    path: string;
    size_bytes: number;
    modified: string;
    compressed: boolean;
}

interface LogContent {
    lines: string[];
    total_lines: number;
    offset: number;
    limit: number;
    filename: string;
    error?: string;
}

const CATEGORIES = [
    { key: 'all', label: 'Todos', icon: FolderOpen },
    { key: 'builds', label: 'Montagem', icon: Layers },
    { key: 'executions', label: 'Execuções', icon: Play },
    { key: 'sessions', label: 'Sessões', icon: FileText },
    { key: 'recordings', label: 'Gravações', icon: FileText },
    { key: 'device', label: 'Device', icon: Cpu },
    { key: 'errors', label: 'Erros', icon: AlertCircle },
];

const LEVEL_FILTERS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'EVENT'];
const AUTO_REFRESH_OPTIONS = [
    { label: 'OFF', value: 0 },
    { label: '3s', value: 3000 },
    { label: '5s', value: 5000 },
    { label: '15s', value: 15000 },
];

// Parse a log line into parts for structured rendering
function parseLine(line: string): { timestamp: string; context: string; level: string; message: string } {
    // Format: [2026-03-26 12:10:22.819] [RUN:save] [INFO] Test saved...
    const m = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);
    if (m) {
        return { timestamp: m[1], context: m[2], level: m[3], message: m[4] };
    }
    return { timestamp: '', context: '', level: '', message: line };
}

function getLineStyle(line: string): { color: string; bg: string; border: string } {
    // Level-based colors
    if (line.includes('[ERROR]')) return { color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-l-red-500/40' };
    if (line.includes('[WARN]')) return { color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-l-yellow-500/40' };
    if (line.includes('[EVENT]')) return { color: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-l-blue-500/40' };
    if (line.includes('[DEBUG]')) return { color: 'text-slate-500', bg: '', border: 'border-l-transparent' };

    // Special tag colors inside the message (override INFO color when relevant)
    if (line.includes('[SMART_RETRY]')) return { color: 'text-purple-300', bg: 'bg-purple-500/5', border: 'border-l-purple-500/40' };
    if (line.includes('[IA]')) return { color: 'text-cyan-300', bg: 'bg-cyan-500/5', border: 'border-l-cyan-500/40' };
    if (line.includes('[MAESTRO]')) return { color: 'text-orange-300', bg: '', border: 'border-l-orange-500/20' };
    if (line.includes('[INFRA]')) return { color: 'text-slate-400', bg: '', border: 'border-l-transparent' };
    if (line.includes('[IMAGENS]')) return { color: 'text-pink-300', bg: 'bg-pink-500/5', border: 'border-l-pink-500/30' };
    if (line.includes('[XML]')) return { color: 'text-lime-300', bg: '', border: 'border-l-lime-500/20' };
    if (line.includes('[ELEMENT_MAP]')) return { color: 'text-teal-300', bg: 'bg-teal-500/5', border: 'border-l-teal-500/30' };
    if (line.includes('✓')) return { color: 'text-emerald-300', bg: '', border: 'border-l-transparent' };
    if (line.includes('✗')) return { color: 'text-slate-400', bg: '', border: 'border-l-transparent' };
    if (line.includes('═══') || line.includes('───')) return { color: 'text-slate-500', bg: '', border: 'border-l-transparent' };

    if (line.includes('[INFO]')) return { color: 'text-emerald-400', bg: '', border: 'border-l-transparent' };
    return { color: 'text-slate-300', bg: '', border: 'border-l-transparent' };
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<LogFile | null>(null);
    const [content, setContent] = useState<LogContent | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingContent, setLoadingContent] = useState(false);
    const [category, setCategory] = useState('all');
    const [levelFilter, setLevelFilter] = useState('ALL');
    const [searchText, setSearchText] = useState('');
    const [fileSearch, setFileSearch] = useState('');
    const [autoRefreshMs, setAutoRefreshMs] = useState(0);
    const [liveTail, setLiveTail] = useState(false);
    const [copied, setCopied] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
    const selectedFileRef = useRef<LogFile | null>(null);

    // Keep ref in sync
    useEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const cat = category === 'all' ? '' : `?category=${category}`;
            const res = await fetch(`${DAEMON_URL}/api/logs${cat}`);
            const data = await res.json();
            setLogs(data.logs || []);
        } catch {
            setLogs([]);
        }
        setLoading(false);
    }, [category]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const fetchContent = useCallback(async (file: LogFile) => {
        setSelectedFile(file);
        setLoadingContent(true);
        try {
            const res = await fetch(
                `${DAEMON_URL}/api/logs/read?path=${encodeURIComponent(file.path)}&limit=8000`
            );
            const data = await res.json();
            setContent(data);
        } catch {
            setContent({ lines: ['Erro ao carregar arquivo'], total_lines: 0, offset: 0, limit: 0, filename: file.filename });
        }
        setLoadingContent(false);
    }, []);

    const refreshContent = useCallback(async () => {
        const file = selectedFileRef.current;
        if (!file) return;
        try {
            const res = await fetch(
                `${DAEMON_URL}/api/logs/read?path=${encodeURIComponent(file.path)}&limit=8000`
            );
            const data = await res.json();
            setContent(data);
        } catch { /* silent */ }
    }, []);

    // Auto-refresh
    useEffect(() => {
        if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
        if (autoRefreshMs > 0) {
            autoRefreshRef.current = setInterval(refreshContent, autoRefreshMs);
        }
        return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
    }, [autoRefreshMs, refreshContent]);

    // Live tail — scroll to bottom when content changes
    useEffect(() => {
        if (liveTail && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [content, liveTail]);

    const downloadFile = (file: LogFile) => {
        window.open(`${DAEMON_URL}/api/logs/download?path=${encodeURIComponent(file.path)}`, '_blank');
    };

    const copyAll = async () => {
        if (!filteredLines.length) return;
        await navigator.clipboard.writeText(filteredLines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const scrollToBottom = () => {
        if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
    };

    // Filtered lines
    const filteredLines = useMemo(() => {
        return (content?.lines || []).filter(line => {
            if (levelFilter !== 'ALL' && !line.includes(`[${levelFilter}]`)) return false;
            if (searchText && !line.toLowerCase().includes(searchText.toLowerCase())) return false;
            return true;
        });
    }, [content, levelFilter, searchText]);

    // Stats
    const stats = useMemo(() => {
        const s = { ERROR: 0, WARN: 0, INFO: 0, EVENT: 0, DEBUG: 0, MAESTRO: 0, SMART_RETRY: 0 };
        for (const line of content?.lines || []) {
            if (line.includes('[ERROR]')) s.ERROR++;
            else if (line.includes('[WARN]')) s.WARN++;
            else if (line.includes('[EVENT]')) s.EVENT++;
            else if (line.includes('[DEBUG]')) s.DEBUG++;
            else if (line.includes('[INFO]')) s.INFO++;
            if (line.includes('[MAESTRO]')) s.MAESTRO++;
            if (line.includes('[SMART_RETRY]')) s.SMART_RETRY++;
        }
        return s;
    }, [content]);

    const filteredFiles = useMemo(() =>
        logs.filter(f => f.filename.toLowerCase().includes(fileSearch.toLowerCase())),
        [logs, fileSearch]
    );

    const categoryBadge = (cat: string) => {
        const colors: Record<string, string> = {
            sessions: 'bg-blue-500/20 text-blue-400',
            recordings: 'bg-purple-500/20 text-purple-400',
            executions: 'bg-emerald-500/20 text-emerald-400',
            builds: 'bg-teal-500/20 text-teal-400',
            device: 'bg-amber-500/20 text-amber-400',
            errors: 'bg-red-500/20 text-red-400',
        };
        return colors[cat] || 'bg-slate-500/20 text-slate-400';
    };

    return (
        <div className="p-6 max-w-[1800px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold">Logs</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Montagem de testes, execuções, sessões, device e erros
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Auto-refresh selector */}
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${autoRefreshMs > 0 ? 'animate-spin' : ''}`} />
                        <span className="text-slate-400">Auto:</span>
                        {AUTO_REFRESH_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setAutoRefreshMs(opt.value)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    autoRefreshMs === opt.value
                                        ? 'bg-brand/20 text-brand'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        onClick={() => { setCategory(cat.key); setSelectedFile(null); setContent(null); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                            category === cat.key
                                ? 'bg-brand/10 text-brand border border-brand/30'
                                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
                        }`}
                    >
                        <cat.icon className="w-4 h-4" />
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="flex gap-4 h-[calc(100vh-230px)]">
                {/* File List */}
                <div className="w-72 shrink-0 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-white/5">
                        <div className="relative">
                            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filtrar arquivos..."
                                value={fileSearch}
                                onChange={e => setFileSearch(e.target.value)}
                                className="w-full pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand/30"
                            />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1.5 px-1">
                            {filteredFiles.length} de {logs.length} arquivos
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {filteredFiles.length === 0 && !loading && (
                            <div className="p-4 text-sm text-slate-500 text-center">
                                Nenhum log encontrado
                            </div>
                        )}
                        {filteredFiles.map((file) => (
                            <button
                                key={file.path}
                                onClick={() => fetchContent(file)}
                                className={`w-full text-left p-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                                    selectedFile?.path === file.path ? 'bg-brand/5 border-l-2 border-l-brand' : ''
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${categoryBadge(file.category)}`}>
                                        {file.category}
                                    </span>
                                    {file.compressed && (
                                        <span className="text-[10px] text-slate-500">.gz</span>
                                    )}
                                </div>
                                <div className="text-xs font-mono text-slate-300 truncate">
                                    {file.filename}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                                    <span>{formatFileSize(file.size_bytes)}</span>
                                    <span>{formatDate(file.modified)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Log Viewer */}
                <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col min-w-0">
                    {selectedFile ? (
                        <>
                            {/* Viewer Header */}
                            <div className="p-3 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-sm min-w-0">
                                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-mono text-slate-300 truncate">{selectedFile.filename}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                                    <span className="text-slate-500 shrink-0">
                                        {filteredLines.length} linhas
                                        {content && filteredLines.length !== content.total_lines && (
                                            <span> / {content.total_lines} total</span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Live tail toggle */}
                                    <button
                                        onClick={() => { setLiveTail(!liveTail); if (!liveTail) scrollToBottom(); }}
                                        title="Live tail (auto-scroll)"
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                            liveTail
                                                ? 'bg-brand/20 border-brand/40 text-brand'
                                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <ChevronsDown className="w-3 h-3" />
                                        Tail
                                    </button>
                                    {/* Copy */}
                                    <button
                                        onClick={copyAll}
                                        title="Copiar linhas filtradas"
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors text-slate-400"
                                    >
                                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                    {/* Refresh content */}
                                    <button
                                        onClick={refreshContent}
                                        title="Recarregar arquivo"
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors text-slate-400"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </button>
                                    {/* Download */}
                                    <button
                                        onClick={() => downloadFile(selectedFile)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors"
                                    >
                                        <Download className="w-3 h-3" />
                                        Download
                                    </button>
                                </div>
                            </div>

                            {/* Stats bar */}
                            {content && (
                                <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-3 flex-wrap">
                                    {stats.ERROR > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-mono">
                                            {stats.ERROR} ERROR
                                        </span>
                                    )}
                                    {stats.WARN > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-mono">
                                            {stats.WARN} WARN
                                        </span>
                                    )}
                                    {stats.EVENT > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono">
                                            {stats.EVENT} EVENT
                                        </span>
                                    )}
                                    {stats.INFO > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono">
                                            {stats.INFO} INFO
                                        </span>
                                    )}
                                    {stats.MAESTRO > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono">
                                            {stats.MAESTRO} MAESTRO
                                        </span>
                                    )}
                                    {stats.SMART_RETRY > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">
                                            {stats.SMART_RETRY} RETRY
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-600 ml-auto">
                                        {content.total_lines} linhas totais
                                    </span>
                                </div>
                            )}

                            {/* Filters */}
                            <div className="p-2.5 border-b border-white/5 flex items-center gap-3">
                                <div className="flex items-center gap-1 text-xs">
                                    <Filter className="w-3 h-3 text-slate-400" />
                                    {LEVEL_FILTERS.map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setLevelFilter(level)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                                levelFilter === level
                                                    ? level === 'ERROR' ? 'bg-red-500/20 text-red-400'
                                                    : level === 'WARN' ? 'bg-yellow-500/20 text-yellow-400'
                                                    : level === 'EVENT' ? 'bg-blue-500/20 text-blue-400'
                                                    : level === 'INFO' ? 'bg-emerald-500/20 text-emerald-400'
                                                    : level === 'DEBUG' ? 'bg-slate-500/20 text-slate-400'
                                                    : 'bg-brand/20 text-brand'
                                                    : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-1 relative">
                                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Buscar no log... (ex: SMART_RETRY, element_map, YAML)"
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand/30"
                                    />
                                </div>
                            </div>

                            {/* Content */}
                            <div
                                ref={contentRef}
                                className="flex-1 overflow-y-auto font-mono text-xs leading-5 p-1"
                            >
                                {loadingContent ? (
                                    <div className="flex items-center justify-center h-full text-slate-500">
                                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                        Carregando...
                                    </div>
                                ) : filteredLines.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                                        Nenhuma linha encontrada
                                        {(levelFilter !== 'ALL' || searchText) && ' com os filtros aplicados'}
                                    </div>
                                ) : (
                                    filteredLines.map((line, i) => {
                                        const { color, bg, border } = getLineStyle(line);
                                        const parsed = parseLine(line);
                                        return (
                                            <div
                                                key={i}
                                                className={`px-3 py-px hover:bg-white/[0.04] border-l-2 ${border} ${bg} flex gap-2 group`}
                                            >
                                                <span className="text-slate-700 select-none w-8 shrink-0 text-right">
                                                    {i + 1}
                                                </span>
                                                {parsed.timestamp ? (
                                                    <span className={`${color} flex gap-2 min-w-0 flex-1`}>
                                                        <span className="text-slate-600 shrink-0 hidden xl:inline">
                                                            {parsed.timestamp}
                                                        </span>
                                                        {parsed.context && (
                                                            <span className="text-slate-500 shrink-0 hidden lg:inline">
                                                                [{parsed.context}]
                                                            </span>
                                                        )}
                                                        {parsed.level && (
                                                            <span className={`shrink-0 font-bold ${
                                                                parsed.level === 'ERROR' ? 'text-red-400' :
                                                                parsed.level === 'WARN' ? 'text-yellow-400' :
                                                                parsed.level === 'EVENT' ? 'text-blue-400' :
                                                                parsed.level === 'DEBUG' ? 'text-slate-600' :
                                                                'text-emerald-500'
                                                            }`}>
                                                                [{parsed.level}]
                                                            </span>
                                                        )}
                                                        <span className="min-w-0 break-all">
                                                            {highlightSearch(parsed.message, searchText)}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className={`${color} min-w-0 break-all flex-1`}>
                                                        {highlightSearch(line, searchText)}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500">
                            <div className="text-center">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">Selecione um arquivo para visualizar</p>
                                <p className="text-xs mt-1 text-slate-600">
                                    Use a aba <span className="text-teal-400">Montagem</span> para ver logs de geração de testes
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function highlightSearch(text: string, search: string): React.ReactNode {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${escapeRegex(search)})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === search.toLowerCase() ? (
                    <mark key={i} className="bg-brand/30 text-white rounded-sm px-0.5">
                        {part}
                    </mark>
                ) : part
            )}
        </>
    );
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
