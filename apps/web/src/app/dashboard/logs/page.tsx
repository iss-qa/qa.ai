'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DAEMON_URL } from '@/lib/constants';
import {
    FileText, FolderOpen, Download, Search, Filter,
    RefreshCw, ChevronRight, AlertCircle, Info, AlertTriangle, Zap
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
    { key: 'sessions', label: 'Sessões', icon: FileText },
    { key: 'recordings', label: 'Gravações', icon: FileText },
    { key: 'executions', label: 'Execuções', icon: FileText },
    { key: 'device', label: 'Device', icon: FileText },
    { key: 'errors', label: 'Erros', icon: AlertCircle },
];

const LEVEL_FILTERS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'EVENT'];

function getLevelColor(line: string): string {
    if (line.includes('[ERROR]')) return 'text-red-400';
    if (line.includes('[WARN]')) return 'text-yellow-400';
    if (line.includes('[EVENT]')) return 'text-blue-400';
    if (line.includes('[DEBUG]')) return 'text-slate-500';
    if (line.includes('[INFO]')) return 'text-emerald-400';
    return 'text-slate-300';
}

function getLevelBg(line: string): string {
    if (line.includes('[ERROR]')) return 'bg-red-500/5';
    if (line.includes('[WARN]')) return 'bg-yellow-500/5';
    if (line.includes('[EVENT]')) return 'bg-blue-500/5';
    return '';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
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
    const contentRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const fetchContent = async (file: LogFile) => {
        setSelectedFile(file);
        setLoadingContent(true);
        try {
            const res = await fetch(
                `${DAEMON_URL}/api/logs/read?path=${encodeURIComponent(file.path)}&limit=5000`
            );
            const data = await res.json();
            setContent(data);
        } catch {
            setContent({ lines: ['Erro ao carregar arquivo'], total_lines: 0, offset: 0, limit: 0, filename: file.filename });
        }
        setLoadingContent(false);
    };

    const downloadFile = (file: LogFile) => {
        window.open(`${DAEMON_URL}/api/logs/download?path=${encodeURIComponent(file.path)}`, '_blank');
    };

    // Filter lines
    const filteredLines = content?.lines.filter(line => {
        if (levelFilter !== 'ALL') {
            if (!line.includes(`[${levelFilter}]`)) return false;
        }
        if (searchText) {
            if (!line.toLowerCase().includes(searchText.toLowerCase())) return false;
        }
        return true;
    }) || [];

    const categoryBadge = (cat: string) => {
        const colors: Record<string, string> = {
            sessions: 'bg-blue-500/20 text-blue-400',
            recordings: 'bg-purple-500/20 text-purple-400',
            executions: 'bg-emerald-500/20 text-emerald-400',
            device: 'bg-amber-500/20 text-amber-400',
            errors: 'bg-red-500/20 text-red-400',
        };
        return colors[cat] || 'bg-slate-500/20 text-slate-400';
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Logs</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Visualize logs de sessão, gravação, execução, device e erros
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </button>
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

            <div className="flex gap-4 h-[calc(100vh-220px)]">
                {/* File List */}
                <div className="w-80 shrink-0 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-white/5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Arquivos ({logs.length})
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {logs.length === 0 && !loading && (
                            <div className="p-4 text-sm text-slate-500 text-center">
                                Nenhum log encontrado
                            </div>
                        )}
                        {logs.map((file) => (
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
                <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
                    {selectedFile ? (
                        <>
                            {/* Viewer Header */}
                            <div className="p-3 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                    <FileText className="w-4 h-4 text-slate-400" />
                                    <span className="font-mono text-slate-300">{selectedFile.filename}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-600" />
                                    <span className="text-slate-500">
                                        {filteredLines.length} linhas
                                        {content && filteredLines.length !== content.total_lines && (
                                            <span> / {content.total_lines} total</span>
                                        )}
                                    </span>
                                </div>
                                <button
                                    onClick={() => downloadFile(selectedFile)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors"
                                >
                                    <Download className="w-3 h-3" />
                                    Download
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="p-3 border-b border-white/5 flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs">
                                    <Filter className="w-3.5 h-3.5 text-slate-400" />
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
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Buscar no log..."
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
                                        Carregando...
                                    </div>
                                ) : (
                                    filteredLines.map((line, i) => (
                                        <div
                                            key={i}
                                            className={`px-3 py-0.5 hover:bg-white/5 ${getLevelBg(line)} flex`}
                                        >
                                            <span className="text-slate-600 select-none w-10 shrink-0 text-right mr-3">
                                                {i + 1}
                                            </span>
                                            <span className={getLevelColor(line)}>
                                                {highlightSearch(line, searchText)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500">
                            <div className="text-center">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">Selecione um arquivo para visualizar</p>
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
                ) : (
                    part
                )
            )}
        </>
    );
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
