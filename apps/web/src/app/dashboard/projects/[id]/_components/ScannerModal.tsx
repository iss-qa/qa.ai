'use client';

import { type RefObject } from 'react';
import { ScanSearch, X, Square, Loader2, Smartphone, Monitor, ChevronDown, ChevronRight, MousePointerClick, Eye, Copy } from 'lucide-react';
import { DevicePreview, type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import type { ScanResults, ScanScreen, ScanSelectorGroup, ScanElement } from '../project-types';
import { getSelectorsFromGroup, copyToClipboard } from '../project-utils';

interface ScannerStats {
    screens_found: number;
    elements_found: number;
    elapsed_seconds: number;
    dumps_completed: number;
}

interface ScannerModalProps {
    scannerPhase: 'select_app' | 'scanning' | 'results';
    setScannerPhase: (phase: 'select_app' | 'scanning' | 'results') => void;
    scannerStats: ScannerStats;
    scanResults: ScanResults | null;
    setScanResults: (results: ScanResults | null) => void;
    expandedScreens: Record<string, boolean>;
    setExpandedScreens: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    scanAppPackage: string | null;
    setScanAppPackage: (pkg: string | null) => void;
    scanAppLabel: string;
    detectingApp: boolean;
    availableDeviceUdid: string | null;
    devicePreviewRef: RefObject<DevicePreviewHandle>;
    handleScannerInteraction: (interaction: RecordedInteraction) => void;
    handleStopScanner: () => Promise<void>;
    onCloseFromHeader: () => void;
    onCloseFromResults: () => void;
}

export function ScannerModal({
    scannerPhase,
    setScannerPhase,
    scannerStats,
    scanResults,
    setScanResults,
    expandedScreens,
    setExpandedScreens,
    scanAppPackage,
    setScanAppPackage,
    scanAppLabel,
    detectingApp,
    availableDeviceUdid,
    devicePreviewRef,
    handleScannerInteraction,
    handleStopScanner,
    onCloseFromHeader,
    onCloseFromResults,
}: ScannerModalProps) {
    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        <ScanSearch className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-foreground">
                            {scannerPhase === 'results' ? 'Resultado do Scan' : scannerPhase === 'scanning' ? `Escaneando — ${scanAppLabel}` : 'Scanear Aplicacao'}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {scannerPhase === 'results'
                                ? `${Object.keys(scanResults?.screens || {}).length} telas | ${scanResults?.stats?.elements_found || 0} elementos | ${scanResults?.app_package || ''}`
                                : scannerPhase === 'scanning'
                                    ? `${scanAppPackage} | ${scannerStats.screens_found} telas | ${scannerStats.elements_found} elementos`
                                    : 'Toque no app que deseja escanear'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {scannerPhase === 'scanning' && (
                        <button
                            onClick={handleStopScanner}
                            className="px-5 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all text-sm flex items-center gap-2"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" /> Finalizar Scan
                        </button>
                    )}
                    <button
                        onClick={onCloseFromHeader}
                        className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── PHASE 1: SELECT APP ── */}
                {scannerPhase === 'select_app' && (
                    <div className="flex-1 flex items-center justify-center">
                        {availableDeviceUdid ? (
                            <div className="relative h-full w-full max-w-[400px]">
                                <DevicePreview
                                    ref={devicePreviewRef}
                                    udid={availableDeviceUdid}
                                    onInteraction={handleScannerInteraction}
                                />
                                {detectingApp ? (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
                                        <div className="bg-card/90 border border-cyan-500/30 rounded-xl px-6 py-4 flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                                            <span className="text-sm text-foreground font-medium">Detectando app...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                                        <div className="bg-cyan-500 text-black rounded-xl px-4 py-3 text-center shadow-lg">
                                            <p className="text-sm font-bold">Toque no app que deseja escanear</p>
                                            <p className="text-xs opacity-70 mt-0.5">O app abrira e o scan comecara automaticamente</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 p-10">
                                <Smartphone className="w-12 h-12 text-danger" />
                                <p className="text-sm text-danger text-center">Nenhum dispositivo detectado via ADB.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── PHASE 2: SCANNING (side-by-side) ── */}
                {scannerPhase === 'scanning' && availableDeviceUdid && (
                    <>
                        {/* Left: Device preview */}
                        <div className="w-[360px] shrink-0 border-r border-border relative bg-black">
                            <DevicePreview
                                ref={devicePreviewRef}
                                udid={availableDeviceUdid}
                            />
                        </div>
                        {/* Right: Live stats + element feed */}
                        <div className="flex-1 flex flex-col overflow-hidden bg-card">
                            {/* Stats bar */}
                            <div className="grid grid-cols-4 gap-2 p-4 border-b border-border shrink-0">
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2.5 text-center">
                                    <p className="text-xl font-bold text-cyan-400">{scannerStats.screens_found}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Telas</p>
                                </div>
                                <div className="bg-foreground/5 border border-border rounded-lg p-2.5 text-center">
                                    <p className="text-xl font-bold text-foreground">{scannerStats.elements_found}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Elementos</p>
                                </div>
                                <div className="bg-foreground/5 border border-border rounded-lg p-2.5 text-center">
                                    <p className="text-xl font-bold text-foreground">{scannerStats.dumps_completed}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Capturas</p>
                                </div>
                                <div className="bg-foreground/5 border border-border rounded-lg p-2.5 text-center">
                                    <p className="text-xl font-bold text-foreground">{Math.floor(scannerStats.elapsed_seconds / 60)}:{String(scannerStats.elapsed_seconds % 60).padStart(2, '0')}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Tempo</p>
                                </div>
                            </div>
                            {/* Live feed area */}
                            <div className="flex-1 flex items-center justify-center p-6">
                                <div className="text-center">
                                    <div className="relative inline-block mb-4">
                                        <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-cyan-400 animate-spin" />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <ScanSearch className="w-5 h-5 text-cyan-400" />
                                        </div>
                                    </div>
                                    <p className="text-foreground font-bold">Capturando elementos...</p>
                                    <p className="text-xs text-muted-foreground mt-2 max-w-xs">Navegue pelo app no celular. Abra telas, menus, preencha campos. Os elementos sao capturados a cada 4 segundos.</p>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ── PHASE 3: RESULTS (side-by-side) ── */}
                {scannerPhase === 'results' && scanResults && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-card">
                        {/* Stats summary */}
                        <div className="grid grid-cols-4 gap-2 p-4 border-b border-border shrink-0">
                            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2.5 text-center">
                                <p className="text-xl font-bold text-cyan-400">{Object.keys(scanResults.screens || {}).length}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Telas</p>
                            </div>
                            <div className="bg-foreground/5 border border-border rounded-lg p-2.5 text-center">
                                <p className="text-xl font-bold text-foreground">{scanResults.stats?.elements_found || 0}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Elementos</p>
                            </div>
                            <div className="bg-foreground/5 border border-border rounded-lg p-2.5 text-center">
                                <p className="text-xl font-bold text-foreground">{scanResults.stats?.dumps_completed || 0}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Capturas</p>
                            </div>
                            <div className="bg-success/5 border border-success/20 rounded-lg p-2.5 text-center">
                                <p className="text-xl font-bold text-success">
                                    {(() => { let t = 0; Object.values(scanResults.screens || {}).forEach((s: ScanScreen) => { (s.maestro_selectors || []).forEach((g: ScanSelectorGroup) => { t += (g.commands || []).length; }); }); return t; })()}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Seletores</p>
                            </div>
                        </div>
                        {/* Scrollable results */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {Object.entries(scanResults.screens || {}).map(([screenName, screenData]: [string, ScanScreen]) => {
                                const selectorGroups = screenData.maestro_selectors || [];
                                const screenshot = screenData.screenshot || '';
                                const activity = screenData.activity || '';
                                const isExpanded = expandedScreens[screenName] || false;
                                return (
                                    <div key={screenName} className="border border-border rounded-xl overflow-hidden">
                                        {/* Screen header with thumbnail */}
                                        <button
                                            onClick={() => setExpandedScreens(prev => ({ ...prev, [screenName]: !prev[screenName] }))}
                                            className="w-full flex items-center gap-3 px-4 py-3 bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors"
                                        >
                                            {/* Screenshot thumbnail */}
                                            {screenshot ? (
                                                <img
                                                    src={`data:image/png;base64,${screenshot}`}
                                                    alt={screenName}
                                                    className="w-10 h-[52px] object-cover rounded-md border border-border shrink-0"
                                                />
                                            ) : (
                                                <div className="w-10 h-[52px] rounded-md border border-border bg-foreground/5 flex items-center justify-center shrink-0">
                                                    <Monitor className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                            )}
                                            <div className="flex-1 text-left min-w-0">
                                                <div className="flex items-center gap-2">
                                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                                    <span className="font-bold text-sm text-foreground truncate">{screenName}</span>
                                                </div>
                                                {activity && <p className="text-[10px] text-muted-foreground font-mono ml-5.5 truncate">{activity}</p>}
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0">{selectorGroups.length} elementos</span>
                                        </button>

                                        {/* Expanded: screenshot + elements */}
                                        {isExpanded && (
                                            <div className="border-t border-border">
                                                {/* Large screenshot preview */}
                                                {screenshot && (
                                                    <div className="p-3 bg-black/30 flex justify-center">
                                                        <img
                                                            src={`data:image/png;base64,${screenshot}`}
                                                            alt={screenName}
                                                            className="max-h-[300px] rounded-lg border border-border object-contain"
                                                        />
                                                    </div>
                                                )}
                                                {/* Elements */}
                                                <div className="max-h-[50vh] overflow-y-auto">
                                                    {selectorGroups.map((group: ScanSelectorGroup, gIdx: number) => {
                                                        const el: ScanElement = group.element || {};
                                                        const selectors = getSelectorsFromGroup(group);
                                                        if (selectors.length === 0) return null;
                                                        return (
                                                            <div key={gIdx} className="border-b border-border last:border-0">
                                                                <div className="px-4 py-2 bg-foreground/[0.02]">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-xs font-mono text-muted-foreground">{el.class?.split('.').pop() || 'View'}</span>
                                                                        {el.id && <span className="text-xs bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded font-mono">id: {el.id}{'index' in el ? ` [${el.index}]` : ''}</span>}
                                                                        {el.text && <span className="text-xs bg-foreground/5 text-foreground px-1.5 py-0.5 rounded truncate max-w-[250px]">&quot;{el.text}&quot;</span>}
                                                                        {el.hint && el.hint !== el.text && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded truncate max-w-[200px]">hint: &quot;{el.hint}&quot;</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="px-4 py-1.5 space-y-1">
                                                                    {selectors.map((sel, sIdx) => (
                                                                        <div key={sIdx} className="flex items-center gap-2 group">
                                                                            <span className={`w-14 text-[10px] font-bold uppercase shrink-0 ${sel.type === 'tapOn' ? 'text-success' : 'text-blue-400'}`}>
                                                                                {sel.type === 'tapOn' ? <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> tap</span> : <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> assert</span>}
                                                                            </span>
                                                                            <code className="flex-1 text-xs text-muted-foreground font-mono bg-black/30 px-2 py-1 rounded whitespace-pre">{sel.command}</code>
                                                                            <button onClick={() => copyToClipboard(sel.command)} className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" title="Copiar"><Copy className="w-3 h-3" /></button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* Bottom actions */}
                        <div className="flex gap-3 p-4 border-t border-border shrink-0">
                            <button onClick={() => { setScanResults(null); setScannerPhase('select_app'); setScanAppPackage(null); }} className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-bold rounded-xl hover:bg-cyan-400 text-sm flex items-center justify-center gap-2">
                                <ScanSearch className="w-4 h-4" /> Novo Scan
                            </button>
                            <button onClick={onCloseFromResults} className="flex-1 px-4 py-2.5 bg-foreground/5 text-foreground font-bold rounded-xl hover:bg-foreground/10 text-sm border border-border">
                                Fechar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
