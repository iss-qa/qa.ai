'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { DAEMON_URL } from '@/lib/constants';
import type { RecorderConfigState } from '../editor-types';

export function RecorderConfigModal({
    recorderConfig,
    setRecorderConfig,
    appIdSuggestions,
    deviceUdid,
    onConfirm,
}: {
    recorderConfig: RecorderConfigState;
    setRecorderConfig: React.Dispatch<React.SetStateAction<RecorderConfigState>>;
    appIdSuggestions: string[];
    deviceUdid?: string | null;
    onConfirm: () => void;
}) {
    // Apps instalados no device (pm list packages -3) — alimenta a busca e o
    // dropdown do App ID. Sugestões do projeto vêm primeiro na lista.
    const [devicePackages, setDevicePackages] = useState<string[]>([]);
    const [loadingApps, setLoadingApps] = useState(false);
    const [appSearch, setAppSearch] = useState('');

    useEffect(() => {
        if (!recorderConfig.open) return;
        let cancelled = false;
        setLoadingApps(true);
        const url = new URL(`${DAEMON_URL}/mss/api/apps/installed`);
        if (deviceUdid) url.searchParams.set('udid', deviceUdid);
        fetch(url.toString())
            .then(r => r.json())
            .then(data => {
                if (!cancelled) setDevicePackages((data?.packages as string[]) || []);
            })
            .catch(() => { /* daemon offline — segue só com sugestões */ })
            .finally(() => { if (!cancelled) setLoadingApps(false); });
        return () => { cancelled = true; };
    }, [recorderConfig.open, deviceUdid]);

    const allApps = useMemo(
        () => Array.from(new Set([...appIdSuggestions, ...devicePackages])),
        [appIdSuggestions, devicePackages],
    );

    // Busca por nome: "foxbit" casa com br.com.foxbit.foxbitandroid.
    const searchMatches = useMemo(() => {
        const q = appSearch.trim().toLowerCase();
        if (!q) return [];
        return allApps.filter(p => p.toLowerCase().includes(q)).slice(0, 12);
    }, [appSearch, allApps]);

    // Um único match → App ID preenchido automaticamente.
    useEffect(() => {
        if (appSearch.trim() && searchMatches.length === 1) {
            setRecorderConfig(prev =>
                prev.appId === searchMatches[0] ? prev : { ...prev, appId: searchMatches[0] },
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchMatches, appSearch]);

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
                // Close on backdrop click; also closes the appId menu on body click.
                if (e.target === e.currentTarget) {
                    setRecorderConfig(prev => ({ ...prev, open: false }));
                }
            }}
        >
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
                <div className="px-6 pt-6 pb-4">
                    <h3 className="text-base font-bold text-foreground">Choose a template</h3>
                </div>

                {/* Template type tabs — keep the four-button row from the bundle's
                    own modal for visual continuity. Only Mobile Test is supported
                    right now; the others are visible but disabled so users see
                    what's on the roadmap without breaking the layout. */}
                <div className="px-6 pb-4">
                    <div className="inline-flex bg-foreground/5 border border-border rounded-lg p-1 gap-1">
                        <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-foreground/10 text-foreground"
                        >
                            Mobile Test
                        </button>
                        <button
                            type="button"
                            disabled
                            title="Em breve"
                            className="px-3 py-1.5 text-xs font-semibold rounded-md text-zinc-500 cursor-not-allowed hover:text-muted-foreground"
                        >
                            Web Test
                        </button>
                        <button
                            type="button"
                            disabled
                            title="Em breve"
                            className="px-3 py-1.5 text-xs font-semibold rounded-md text-zinc-500 cursor-not-allowed"
                        >
                            Javascript File
                        </button>
                        <button
                            type="button"
                            disabled
                            title="Em breve"
                            className="px-3 py-1.5 text-xs font-semibold rounded-md text-zinc-500 cursor-not-allowed"
                        >
                            Text File
                        </button>
                    </div>
                </div>

                <div className="px-6 pb-2 flex flex-col gap-4">
                    {/* Name with `.yaml` suffix shown inside the input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Name</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={recorderConfig.testName}
                                onChange={(e) => setRecorderConfig(prev => ({ ...prev, testName: e.target.value }))}
                                placeholder="e.g. signup_flow"
                                autoFocus
                                className="w-full bg-foreground/5 border border-border rounded-lg pl-3 pr-14 py-2 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-brand/50 font-mono"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono pointer-events-none">
                                .yaml
                            </span>
                        </div>
                    </div>

                    {/* Busca por nome do app — preenche o App ID automaticamente */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                            Buscar app no dispositivo
                            {loadingApps && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                        </label>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={appSearch}
                                onChange={(e) => setAppSearch(e.target.value)}
                                placeholder='ex: "foxbit" — acha o App ID sozinho'
                                className="w-full bg-foreground/5 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-brand/50"
                            />
                            {appSearch.trim() && searchMatches.length > 1 && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-20 max-h-44 overflow-auto">
                                    {searchMatches.map(s => (
                                        <button
                                            type="button"
                                            key={s}
                                            onClick={() => {
                                                setRecorderConfig(prev => ({ ...prev, appId: s, showAppIdMenu: false }));
                                                setAppSearch('');
                                            }}
                                            className="block w-full text-left px-3 py-2 text-xs font-mono text-foreground hover:bg-foreground/5"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {appSearch.trim() && !loadingApps && searchMatches.length === 0 && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-20 px-3 py-2 text-xs text-zinc-500 italic">
                                    Nenhum app encontrado — confira o device conectado.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* App ID combobox — todos os apps do device + sugestões do projeto */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">App ID</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={recorderConfig.appId}
                                onChange={(e) => setRecorderConfig(prev => ({ ...prev, appId: e.target.value, showAppIdMenu: true }))}
                                onFocus={() => setRecorderConfig(prev => ({ ...prev, showAppIdMenu: allApps.length > 0 }))}
                                onBlur={() => {
                                    // delay so click on a suggestion fires before blur closes the menu
                                    setTimeout(() => setRecorderConfig(prev => ({ ...prev, showAppIdMenu: false })), 150);
                                }}
                                placeholder="e.g. com.example.app"
                                className="w-full bg-foreground/5 border border-border rounded-lg pl-3 pr-9 py-2 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-brand/50 font-mono"
                            />
                            {allApps.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setRecorderConfig(prev => ({ ...prev, showAppIdMenu: !prev.showAppIdMenu }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                                    tabIndex={-1}
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                            )}
                            {recorderConfig.showAppIdMenu && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-10 max-h-44 overflow-auto">
                                    {allApps
                                        .filter(s => s.toLowerCase().includes(recorderConfig.appId.toLowerCase()))
                                        .slice(0, 50)
                                        .map(s => (
                                            <button
                                                type="button"
                                                key={s}
                                                onClick={() => setRecorderConfig(prev => ({ ...prev, appId: s, showAppIdMenu: false }))}
                                                className="block w-full text-left px-3 py-2 text-xs font-mono text-foreground hover:bg-foreground/5"
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    {allApps.filter(s => s.toLowerCase().includes(recorderConfig.appId.toLowerCase())).length === 0 && (
                                        <div className="px-3 py-2 text-xs text-zinc-500 italic">
                                            {loadingApps ? 'Carregando apps do device…' : 'Nenhum app encontrado. Digite manualmente.'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tags — optional */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Tags</label>
                        <input
                            type="text"
                            value={recorderConfig.tags}
                            onChange={(e) => setRecorderConfig(prev => ({ ...prev, tags: e.target.value }))}
                            placeholder="(Optional) Separate with commas"
                            className="bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-brand/50"
                        />
                    </div>

                    {/* clearState — kept because the bundle's modal doesn't have it
                        and the recording really benefits from a clean app state. */}
                    <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                        <input
                            type="checkbox"
                            checked={recorderConfig.clearState}
                            onChange={(e) => setRecorderConfig(prev => ({ ...prev, clearState: e.target.checked }))}
                            className="w-4 h-4 rounded bg-foreground/5 border-border text-brand focus:ring-brand/30"
                        />
                        <span className="text-xs text-muted-foreground">
                            Limpar estado do app antes de iniciar (<code className="text-purple-400 text-[11px]">clearState: true</code>)
                        </span>
                    </label>
                </div>

                <div className="px-6 py-4 flex gap-3 justify-end">
                    <button
                        onClick={() => setRecorderConfig(prev => ({ ...prev, open: false }))}
                        className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!recorderConfig.appId.trim()}
                        className="px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-foreground/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-all"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
