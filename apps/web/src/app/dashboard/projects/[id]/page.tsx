'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play, FlaskConical, Loader2, LayoutGrid, Edit2, Trash2, Download, Upload, ScanSearch, Eye, Wand2, MoreVertical, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDeviceStore } from '@/store/deviceStore';
import { type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import type { Project, ScanResults, TestStep, TestCase } from './project-types';
import { extractAppIdFromYaml, parseMaestroYamlToSteps, extractElementName } from './project-utils';
import { ImportYamlModal } from './_components/ImportYamlModal';
import { ScannerModal } from './_components/ScannerModal';
import { MaestroStudioModal } from './_components/MaestroStudioModal';
import { SaveAsTestModal } from './_components/SaveAsTestModal';
import { EditProjectModal } from './_components/EditProjectModal';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tests, setTests] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', platform: 'android', status: 'Ativo' });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const { connectedDevice } = useDeviceStore();
    const [showImportModal, setShowImportModal] = useState(false);
    const [importDragActive, setImportDragActive] = useState(false);
    const [importStatus, setImportStatus] = useState<{ type: 'idle' | 'error' | 'success'; message: string }>({ type: 'idle', message: '' });
    const [importing, setImporting] = useState(false);
    const [deletingTestId, setDeletingTestId] = useState<string | null>(null);

    // Maestro Studio webview
    const [showMaestroStudio, setShowMaestroStudio] = useState(false);
    const [maestroPhase, setMaestroPhase] = useState<'starting' | 'ready' | 'error'>('starting');
    const [maestroReloadKey, setMaestroReloadKey] = useState(0);

    // "Salvar como Teste" — reads the iframe's active file via postMessage bridge
    const maestroIframeRef = useRef<HTMLIFrameElement>(null);
    const [saveAsTestOpen, setSaveAsTestOpen] = useState(false);
    const [saveAsTestPhase, setSaveAsTestPhase] = useState<'loading' | 'review' | 'saving' | 'error' | 'success'>('loading');
    const [saveAsTestData, setSaveAsTestData] = useState<{ path: string; name: string; content: string; steps: TestStep[]; appId: string | null } | null>(null);
    const [saveAsTestName, setSaveAsTestName] = useState('');
    const [saveAsTestError, setSaveAsTestError] = useState('');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    // Frontend patched: "http://localhost:5050" → "http://localhost:8001/mss"
    // Cache-bust query string ensures updated polyfills/stubs load without hard refresh
    const MAESTRO_STUDIO_EMBED_URL = `/maestro-studio/index.html?v=${maestroReloadKey}`;
    const MAESTRO_STUDIO_API_URL = 'http://localhost:8001/mss';
    // unused in simple flow but kept for cleanup safety

    // Open a saved test directly inside the Maestro Studio iframe.
    // Reconstructs the YAML from app_id + maestro_command of each step,
    // writes it to disk in the project's workspace, then opens the iframe
    // with that file pre-opened as the active tab.
    const openTestInMaestroStudio = async (e: React.MouseEvent, test: TestCase) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const { data: proj } = await supabase
                .from('projects')
                .select('workspace_path')
                .eq('id', projectId)
                .single();
            const workspace = (proj as { workspace_path?: string | null } | null)?.workspace_path || null;
            if (!workspace) {
                setShowMaestroStudio(false);  // close pre-opened modal if deep-linked
                alert('Defina um workspace para este projeto antes. Clique em "Criar Teste" e escolha uma pasta no Maestro Studio.');
                return;
            }

            // Resolve YAML content with a 3-step fallback so the Studio always
            // opens with the user's most-faithful version of the test:
            //   1. test_cases.raw_yaml — the exact bytes the user last saved
            //      in the Studio. Preserves comments, blank lines, and any
            //      formatting that the steps[]/app_id parser drops.
            //   2. Regenerate from steps[] + app_id — used for tests that
            //      pre-date the raw_yaml column or were created from the
            //      step editor (no comments to preserve).
            //   3. Inline appId scrape on legacy steps that carry it.
            const t = test;
            const rawYaml: string | null = typeof t.raw_yaml === 'string' && t.raw_yaml.trim() ? t.raw_yaml : null;

            let yamlContent: string;
            let appId: string | null = null;

            if (rawYaml) {
                yamlContent = rawYaml;
                appId = extractAppIdFromYaml(rawYaml) || t.app_id || null;
            } else {
                const appIdRow = t.app_id || null;
                const steps: TestStep[] = Array.isArray(t.steps) ? t.steps : [];
                appId = appIdRow;
                if (!appId) {
                    for (const s of steps) {
                        const m = (s.maestro_command || '').match(/appId\s*:\s*["']?([^"'\n\r]+)["']?/);
                        if (m && m[1]) { appId = m[1].trim(); break; }
                    }
                }
                if (!appId) {
                    setShowMaestroStudio(false);
                    alert('Este teste nao tem appId definido. Re-salve via "Salvar como Teste" ou edite-o e re-salve para gravar o appId.');
                    return;
                }
                // Sanitize each command before joining. A common breakage is
                // a block-form parent line with no children (e.g. `- launchApp:`
                // saved with the trailing colon but no indented body), which
                // Maestro rejects with "Incorrect Command Format". For these
                // we drop the colon so Maestro falls back to the default
                // behavior using the top-level appId.
                const normalizeCommand = (cmd: string): string => {
                    const lines = cmd.split('\n');
                    if (lines.length === 0) return cmd;
                    const head = lines[0].trim();
                    const hasIndentedChild = lines.slice(1).some(l => /^\s+\S/.test(l));
                    // Only the parent line ends with `:` and there's no body — fix it.
                    if (head.endsWith(':') && !hasIndentedChild) {
                        const stripped = head.replace(/:\s*$/, '');
                        return cmd.replace(lines[0], lines[0].replace(head, stripped));
                    }
                    return cmd;
                };
                const commands = steps
                    .map(s => normalizeCommand(s.maestro_command || ''))
                    .filter(Boolean)
                    .join('\n');
                yamlContent = `appId: ${appId}\n---\n${commands}\n`;
            }

            // Filename derived from test name (snake-case, safe chars only).
            const safeName = (test.name || 'teste')
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_-]/g, '')
                .slice(0, 80) || 'teste';
            const fullPath = `${workspace.replace(/\/$/, '')}/${safeName}.yaml`;

            // Persist the YAML to disk via the existing daemon endpoint.
            const writeRes = await fetch(`${DAEMON}/api/maestro-studio/file/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath, content: yamlContent }),
            });
            const writeData = await writeRes.json().catch(() => ({}));
            if (!writeData?.success) {
                console.error('Failed to write YAML for studio:', writeData);
                setShowMaestroStudio(false);
                alert('Falha ao escrever o YAML no workspace. Verifique o caminho e tente novamente.');
                return;
            }

            // Pre-open the file as active tab. localStorage is shared with the
            // iframe (same origin) so the bundle picks this up on next load.
            //
            // `maestro-open-tabs` schema (per the bundle's compiled state):
            //   [{ path, fileType, content, savedContent }]
            // Not a plain array of strings — the bundle does
            // `tabs.some(t => t.path === activeTab)` and would otherwise
            // render "No open files" even with the active tab highlighted
            // in the tree.
            const ext = fullPath.split('.').pop()?.toLowerCase() || '';
            const fileType = ext === 'yaml' ? 'yaml'
                           : ext === 'yml'  ? 'yml'
                           : ext === 'json' ? 'json'
                           : ext === 'js'   ? 'js'
                           : ext === 'ts'   ? 'ts'
                           : ext === 'css'  ? 'css'
                           : ext === 'html' ? 'html'
                           : 'other';
            const tabRecord = { path: fullPath, fileType, content: yamlContent, savedContent: yamlContent };

            localStorage.removeItem('maestro-expanded-folders');
            localStorage.setItem('maestro-workspace-path', JSON.stringify(workspace));
            localStorage.setItem('maestro-open-tabs', JSON.stringify([tabRecord]));
            localStorage.setItem('maestro-active-tab', JSON.stringify(fullPath));

            // Cache-bust and open. We skip the workspace-resolve dance inside
            // openMaestroStudio because we already set the right values above.
            setMaestroReloadKey(Date.now());
            setShowMaestroStudio(true);
            setMaestroPhase('ready');
        } catch (err) {
            console.error('openTestInMaestroStudio failed:', err);
            setShowMaestroStudio(false);
            alert('Erro ao abrir o teste no Maestro Studio.');
        }
    };

    // Maestro Studio bundle keeps workspace + open tabs + tree state in
    // localStorage with global keys. Opening the iframe for a different
    // project would inherit those values — workspace from project A would
    // show up inside project B. We scope the state to this project by
    // (1) loading the saved workspace_path from projects.workspace_path,
    // (2) clearing tab/folder state on every open, and (3) saving back
    // any new workspace the user picks (see useEffect handler below).
    const openMaestroStudio = async () => {
        try {
            const { data } = await supabase
                .from('projects')
                .select('workspace_path')
                .eq('id', projectId)
                .single();
            const ws = (data as { workspace_path?: string | null } | null)?.workspace_path || null;

            // Reset session-specific keys so we don't carry over the
            // previous project's open tabs / tree expansion.
            localStorage.removeItem('maestro-open-tabs');
            localStorage.removeItem('maestro-active-tab');
            localStorage.removeItem('maestro-expanded-folders');

            // Apply this project's workspace (or clear it so the bundle
            // shows the "select workspace" splash).
            if (ws) {
                localStorage.setItem('maestro-workspace-path', JSON.stringify(ws));
            } else {
                localStorage.removeItem('maestro-workspace-path');
            }
        } catch (e) {
            console.warn('Failed to scope iframe state for project:', e);
        }
        setMaestroReloadKey(Date.now()); // cache-bust on every open
        setShowMaestroStudio(true);
        setMaestroPhase('ready');
    };

    const reloadMaestroStudio = () => {
        setMaestroReloadKey(Date.now());
        setMaestroPhase('ready');
    };

    const openSaveAsTest = () => {
        setSaveAsTestOpen(true);
        setSaveAsTestPhase('loading');
        setSaveAsTestError('');
        setSaveAsTestData(null);
        const iframe = maestroIframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            setSaveAsTestPhase('error');
            setSaveAsTestError('Iframe nao acessivel.');
            return;
        }
        const requestId = `req-${Date.now()}`;
        const handler = (e: MessageEvent) => {
            const msg = e.data;
            if (!msg || msg.type !== 'qamind:active-file' || msg.requestId !== requestId) return;
            window.removeEventListener('message', handler);
            const file = msg.file;
            if (!file || !file.path || !file.content) {
                setSaveAsTestPhase('error');
                setSaveAsTestError('Nenhum arquivo aberto no editor.');
                return;
            }
            const steps = parseMaestroYamlToSteps(file.content);
            if (steps.length === 0) {
                setSaveAsTestPhase('error');
                setSaveAsTestError('Arquivo nao contem comandos Maestro validos (precisa de appId + --- + comandos).');
                return;
            }
            const appId = extractAppIdFromYaml(file.content);
            const defaultName = String(file.name || '').replace(/\.(ya?ml)$/i, '').replace(/_/g, ' ');
            setSaveAsTestData({ path: file.path, name: file.name, content: file.content, steps, appId });
            setSaveAsTestName(defaultName);
            setSaveAsTestPhase('review');
        };
        window.addEventListener('message', handler);
        iframe.contentWindow.postMessage({ type: 'qamind:get-active-file', requestId }, '*');
        setTimeout(() => {
            window.removeEventListener('message', handler);
            setSaveAsTestPhase(p => (p === 'loading' ? 'error' : p));
            setSaveAsTestError(prev => prev || 'Tempo esgotado esperando o iframe responder.');
        }, 4000);
    };

    const confirmSaveAsTest = async () => {
        if (!saveAsTestData) return;
        const name = saveAsTestName.trim();
        if (!name) return;
        setSaveAsTestPhase('saving');
        try {
            const baseRow: Record<string, unknown> = {
                name,
                description: `Salvo do Maestro Studio: ${saveAsTestData.name}`,
                steps: saveAsTestData.steps,
                tags: ['maestro', 'studio'],
                project_id: projectId,
                is_active: true,
                app_id: saveAsTestData.appId,
                raw_yaml: saveAsTestData.content,  // preserva comentarios e formatacao
            };

            // Update if a test with this name already exists in the project,
            // otherwise insert. Prevents duplicates from "Salvar como Teste"
            // followed by a same-name save from the editor (or vice versa).
            const { data: existing, error: lookupErr } = await supabase
                .from('test_cases')
                .select('id')
                .eq('project_id', projectId)
                .eq('name', name)
                .order('created_at', { ascending: false })
                .limit(1);
            if (lookupErr) throw lookupErr;

            if (existing && existing.length > 0) {
                const { error } = await supabase
                    .from('test_cases')
                    .update(baseRow)
                    .eq('id', existing[0].id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('test_cases')
                    .insert({ ...baseRow, version: 1 });
                if (error) throw error;
            }
            setSaveAsTestPhase('success');
            fetchProject();
            setTimeout(() => setSaveAsTestOpen(false), 1500);
        } catch (e: unknown) {
            setSaveAsTestPhase('error');
            setSaveAsTestError(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // Scanner (Scanear Aplicacao) state
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerPhase, setScannerPhase] = useState<'select_app' | 'scanning' | 'results'>('select_app');
    const [scannerStats, setScannerStats] = useState({ screens_found: 0, elements_found: 0, elapsed_seconds: 0, dumps_completed: 0 });
    const [scannerTimer, setScannerTimer] = useState<ReturnType<typeof setInterval> | null>(null);
    const [hasElementMap, setHasElementMap] = useState(false);
    const [availableDeviceUdid, setAvailableDeviceUdid] = useState<string | null>(null);
    const [scanResults, setScanResults] = useState<ScanResults | null>(null);
    const [expandedScreens, setExpandedScreens] = useState<Record<string, boolean>>({});
    const [scanAppPackage, setScanAppPackage] = useState<string | null>(null);
    const [scanAppLabel, setScanAppLabel] = useState<string>('');
    const [detectingApp, setDetectingApp] = useState(false);
    const devicePreviewRef = useRef<DevicePreviewHandle>(null);

    const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

    // Check if element map exists + detect ADB device on mount
    useEffect(() => {
        if (projectId) {
            fetch(`${DAEMON}/api/projects/${projectId}/element-map`)
                .then(r => { if (r.ok) setHasElementMap(true); })
                .catch(() => {});
        }
        // Detect device via daemon /devices endpoint (uses ADB directly)
        fetch(`${DAEMON}/devices`)
            .then(r => r.json())
            .then(data => {
                const devs = data.devices || [];
                if (devs.length > 0) setAvailableDeviceUdid(devs[0].udid || devs[0].serial);
            })
            .catch(() => {});
    }, [projectId]);

    // Close kebab menu when clicking outside
    useEffect(() => {
        if (!showMoreMenu) return;
        const handler = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
                setShowMoreMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMoreMenu]);

    // Also update from deviceStore if available
    useEffect(() => {
        if (connectedDevice?.udid) setAvailableDeviceUdid(connectedDevice.udid);
    }, [connectedDevice]);

    // Persist the workspace the user picks inside the iframe so the next
    // time they open Maestro Studio for THIS project, that folder is
    // pre-loaded instead of leaking from another project.
    useEffect(() => {
        const onMessage = async (e: MessageEvent) => {
            const msg = e.data;
            if (!msg || typeof msg !== 'object') return;
            if (msg.type !== 'qamind:workspace-picked') return;
            const path: string = msg.path || '';
            if (!path) return;
            try {
                await supabase.from('projects').update({ workspace_path: path }).eq('id', projectId);
            } catch (err) {
                console.error('workspace_path persist failed:', err);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [projectId]);

    // YAML save sync: when the user saves any file inside the Studio
    // (manual Ctrl+S, autosave, or "Insert & Run" rewrites), parse the
    // new content and re-sync the matching test_cases row's steps[] + app_id.
    // Debounced so a burst of autosaves while typing collapses into one
    // Supabase write at the end (1.2s after the last save event).
    const fileSaveDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const lastSyncedContent = useRef<Record<string, string>>({});
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            const msg = e.data;
            if (!msg || typeof msg !== 'object') return;
            if (msg.type !== 'qamind:file-saved') return;
            const filepath: string = msg.path || '';
            const content: string = msg.content || '';
            if (!filepath || !content) return;
            // Skip if the bundle re-emitted the same content (Monaco fires
            // a save event on focus blur even without changes).
            if (lastSyncedContent.current[filepath] === content) return;

            const prev = fileSaveDebounce.current[filepath];
            if (prev) clearTimeout(prev);

            fileSaveDebounce.current[filepath] = setTimeout(async () => {
                delete fileSaveDebounce.current[filepath];
                lastSyncedContent.current[filepath] = content;

                const basename = filepath.split('/').pop() || '';
                const testName = basename.replace(/\.(ya?ml)$/i, '').replace(/_/g, ' ');
                const steps = parseMaestroYamlToSteps(content);
                if (steps.length === 0) return;
                const appId = extractAppIdFromYaml(content);

                try {
                    const { data, error } = await supabase
                        .from('test_cases')
                        .select('id')
                        .eq('project_id', projectId)
                        .eq('name', testName)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (error) throw error;
                    const row = (data || [])[0];
                    if (!row) return;  // not a saved test, silent no-op

                    await supabase.from('test_cases').update({
                        steps,
                        app_id: appId,
                        raw_yaml: content,  // mantem comentarios e formatacao do Studio
                    }).eq('id', row.id);

                    fetchProject();  // refresh tests list under the iframe
                } catch (err) {
                    console.error('file-saved sync failed:', err);
                }
            }, 1200);
        };
        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', onMessage);
            // Cancel pending debounces on unmount
            for (const t of Object.values(fileSaveDebounce.current)) clearTimeout(t);
            fileSaveDebounce.current = {};
        };
    }, [projectId]);

    // Listen for the bundle iframe's "flow-finished" postMessage so the test
    // list reflects iframe-triggered Run Test results. Match test_cases by
    // file basename within THIS project — we don't store the YAML path on
    // test_cases, so name-based lookup is the only signal we have.
    //
    // We track when each flow STARTED (on `qamind:flow-started`, emitted by
    // the bundle's SSE bridge) so the test_runs row can carry a real
    // duration_ms instead of a 0 fallback.
    const flowStartTimes = useRef<Record<string, number>>({});
    useEffect(() => {
        const onMessage = async (e: MessageEvent) => {
            const msg = e.data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'qamind:flow-started') {
                if (msg.filepath) flowStartTimes.current[msg.filepath] = Date.now();
                return;
            }

            if (msg.type !== 'qamind:flow-finished') return;
            const filepath: string = msg.filepath || '';
            const flowStatus: string = msg.flowStatus;
            const status: string = flowStatus === 'COMPLETED' ? 'passed' : 'failed';
            if (!filepath) return;
            const basename = filepath.split('/').pop() || '';
            const testName = basename.replace(/\.(ya?ml)$/i, '').replace(/_/g, ' ');
            const startedMs = flowStartTimes.current[filepath];
            const endedAt = new Date();
            const startedAt = startedMs ? new Date(startedMs) : endedAt;
            const durationMs = startedMs ? endedAt.getTime() - startedMs : null;
            delete flowStartTimes.current[filepath];

            try {
                const { data, error } = await supabase
                    .from('test_cases')
                    .select('id')
                    .eq('project_id', projectId)
                    .eq('name', testName)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (error) throw error;
                const row = (data || [])[0];
                if (!row) {
                    // No matching test_cases row yet — user ran a workspace YAML
                    // that wasn't saved as a test. Silent no-op.
                    return;
                }

                await supabase.from('test_cases').update({
                    last_run_at: endedAt.toISOString(),
                    status,
                }).eq('id', row.id);

                // History row so the dashboard can compute real metrics.
                let testRunId: string | null = null;
                try {
                    const insertRes = await supabase.from('test_runs').insert({
                        test_case_id: row.id,
                        project_id: projectId,
                        status,
                        started_at: startedAt.toISOString(),
                        ended_at: endedAt.toISOString(),
                        duration_ms: durationMs,
                        device_udid: availableDeviceUdid || null,
                        error_message: msg.error || (status === 'failed' ? 'Flow failed' : null),
                        steps_total: typeof msg.stepCount === 'number' ? msg.stepCount : null,
                        triggered_by: 'maestro_studio',
                    }).select('id').single();
                    testRunId = insertRes.data?.id || null;
                } catch (e) {
                    console.error('test_runs insert failed:', e);
                }

                // Auto-create a bug_report when the iframe Run Test failed,
                // so the Bug Tracker reflects the same incident.
                if (status === 'failed') {
                    try {
                        await supabase.from('bug_reports').insert({
                            title: `Falha em ${testName} — Run Test (Maestro Studio)`,
                            severity: 'medium',
                            description: [
                                `Captura automática durante execução no Maestro Studio.`,
                                ``,
                                `**Erro:** ${msg.error || 'sem mensagem'}`,
                                ``,
                                `**Arquivo:** ${filepath}`,
                                typeof msg.stepCount === 'number' ? `**Passos executados:** ${msg.stepCount}` : '',
                            ].filter(Boolean).join('\n'),
                            project_id: projectId,
                            test_case_id: row.id,
                            test_run_id: testRunId,
                            status: 'open',
                            source: 'automation',
                        });
                    } catch (e) {
                        // bug_reports may not exist yet (migration pending).
                        console.warn('auto bug_report insert failed:', e);
                    }
                }

                fetchProject();  // refresh the table to show new badge + timestamp
            } catch (err) {
                console.error('flow-finished persist failed:', err);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [projectId, availableDeviceUdid]);

    // When user taps on DevicePreview during "select_app" phase,
    // wait for the app to open, then detect the foreground package
    const handleScannerInteraction = useCallback(async (interaction: RecordedInteraction) => {
        if (scannerPhase !== 'select_app' || detectingApp || !availableDeviceUdid) return;
        if (interaction.type !== 'tap') return;

        setDetectingApp(true);
        // Wait for the app to fully launch
        await new Promise(r => setTimeout(r, 2000));

        try {
            const res = await fetch(`${DAEMON}/api/devices/${availableDeviceUdid}/foreground-app`);
            if (res.ok) {
                const data = await res.json();
                if (data.package && !data.package.startsWith('com.android.launcher') &&
                    !data.package.startsWith('com.google.android.apps.nexuslauncher') &&
                    !data.package.startsWith('com.miui.home') &&
                    !data.package.startsWith('com.sec.android.app.launcher')) {
                    // Found an app! Start scanning locked to it
                    setScanAppPackage(data.package);
                    setScanAppLabel(data.label || data.package.split('.').pop() || '');
                    await startScanForApp(data.package);
                } else {
                    // Still on launcher
                    setDetectingApp(false);
                }
            } else {
                setDetectingApp(false);
            }
        } catch (e) {
            console.error('Failed to detect foreground app:', e);
            setDetectingApp(false);
        }
    }, [scannerPhase, detectingApp, availableDeviceUdid]);

    const startScanForApp = async (appPackage: string) => {
        try {
            const res = await fetch(`${DAEMON}/api/scanner/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    udid: availableDeviceUdid,
                    project_id: projectId,
                    project_name: project?.name || '',
                    mode: 'auto',
                    app_package: appPackage,
                }),
            });
            if (res.ok) {
                setScannerPhase('scanning');
                setDetectingApp(false);
                setScannerStats({ screens_found: 0, elements_found: 0, elapsed_seconds: 0, dumps_completed: 0 });
                const interval = setInterval(async () => {
                    try {
                        const statusRes = await fetch(`${DAEMON}/api/scanner/status`);
                        if (statusRes.ok) {
                            const stats = await statusRes.json();
                            setScannerStats(stats);
                        }
                    } catch {}
                }, 2000);
                setScannerTimer(interval);
            }
        } catch (e) {
            console.error('Failed to start scanner:', e);
            setDetectingApp(false);
        }
    };

    const handleStopScanner = async () => {
        if (scannerTimer) {
            clearInterval(scannerTimer);
            setScannerTimer(null);
        }
        try {
            const res = await fetch(`${DAEMON}/api/scanner/stop`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setHasElementMap(true);
                if (data.element_map) {
                    setScanResults(data.element_map);
                    setScannerPhase('results');
                    const screens = Object.keys(data.element_map.screens || {});
                    if (screens.length > 0) {
                        setExpandedScreens({ [screens[0]]: true });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to stop scanner:', e);
        }
    };

    // Export test as .yaml file — calls daemon to resolve appId
    const handleExportYaml = async (e: React.MouseEvent, test: TestCase) => {
        e.preventDefault();
        e.stopPropagation();

        const steps = test.steps || [];
        const commands: string[] = [];

        // Resolve appId via daemon
        const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
        let appId = 'com.app.unknown';
        const launchStep = steps.find((s: TestStep) => (s.action || '').toLowerCase() === 'launchapp');
        if (launchStep) {
            try {
                const udid = connectedDevice?.udid || '';
                const appHint = extractElementName(launchStep.target || test.name);
                if (udid) {
                    const res = await fetch(`${DAEMON}/api/devices/${udid}/resolve-app?name=${encodeURIComponent(appHint)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.resolved) appId = data.package_id;
                    }
                }
            } catch { /* use unknown */ }
        }

        for (const s of steps) {
            const cmd = s.maestro_command;
            if (cmd) {
                commands.push(cmd);
                continue;
            }

            const action = (s.action || '').toLowerCase();
            const target = s.target || '';
            const value = s.value || '';
            const elem = extractElementName(target);

            if (action === 'launchapp') commands.push('- launchApp');
            else if (action === 'clearstate') commands.push('- clearState');
            else if (action === 'tapon') commands.push(`- tapOn: "${elem}"`);
            else if (action === 'inputtext') commands.push(`- inputText: "${value}"`);
            else if (action === 'assertvisible') commands.push(`- assertVisible: "${elem}"`);
            else if (action === 'waitforanimationtoend') commands.push('- waitForAnimationToEnd');
            else if (action === 'extendedwaituntil') commands.push(`- extendedWaitUntil:\n    visible: "${elem}"\n    timeout: ${value || '5000'}`);
            else if (action === 'back') commands.push('- back');
            else if (action === 'hidekeyboard') commands.push('- hideKeyboard');
            else if (action === 'scroll') commands.push('- scroll');
            else commands.push(`# ${action}: ${target}`);
        }

        const yamlContent = `appId: ${appId}\n---\n${commands.join('\n')}\n`;
        const blob = new Blob([yamlContent], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.yaml`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Delete a test case
    const handleDeleteTest = async (e: React.MouseEvent, testId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDeletingTestId(testId);
    };

    const confirmDeleteTest = async () => {
        if (!deletingTestId) return;
        // Capture and close the modal IMMEDIATELY. Otherwise the modal keeps
        // rendering during the async work, and between `setTests` (which drops
        // the row) and `setDeletingTestId(null)` (which closes the modal) the
        // confirmation reads `tests.find(...).name` as undefined and re-paints
        // with an empty title — looks like a second prompt.
        const targetId = deletingTestId;
        setDeletingTestId(null);
        try {
            const { error } = await supabase.from('test_cases').delete().eq('id', targetId);
            if (error) throw error;
            setTests(prev => prev.filter(t => t.id !== targetId));

            // Also delete local file if it exists
            const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
            try {
                await fetch(`${DAEMON}/api/tests/${targetId}`, { method: 'DELETE' });
            } catch { /* local delete is best-effort */ }
        } catch (error) {
            console.error('Error deleting test:', error);
            alert('Erro ao excluir teste.');
        }
    };

    // Import .yaml file
    const handleImportFile = async (file: File) => {
        setImporting(true);
        setImportStatus({ type: 'idle', message: '' });

        try {
            const rawContent = await file.text();

            // Strip comment lines (lines starting with #) before parsing
            // This avoids comment blocks like "### ---" being treated as YAML separators
            const content = rawContent
                .split('\n')
                .filter(line => !line.trimStart().startsWith('#'))
                .join('\n');

            // Validate: must have appId and --- separator
            if (!content.includes('---')) {
                setImportStatus({ type: 'error', message: 'Arquivo invalido: falta o separador "---" entre appId e comandos.' });
                return;
            }

            const parts = content.split('---', 2);
            if (!parts[0].includes('appId')) {
                setImportStatus({ type: 'error', message: 'Arquivo invalido: "appId" nao encontrado no cabecalho.' });
                return;
            }

            // Parse commands into steps
            const commandSection = parts[1].trim();
            const lines = commandSection.split('\n');
            const steps: TestStep[] = [];
            let stepNum = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) continue;

                if (line.startsWith('- ')) {
                    stepNum++;
                    const cmdContent = line.substring(2).trim();

                    // Parse command type
                    let action = '', target = '', value = '';
                    if (cmdContent === 'launchApp') { action = 'launchApp'; target = 'Abre o aplicativo'; }
                    else if (cmdContent === 'clearState') { action = 'clearState'; target = 'Limpa estado do app'; }
                    else if (cmdContent === 'waitForAnimationToEnd') { action = 'waitForAnimationToEnd'; target = 'Aguarda transicao'; }
                    else if (cmdContent === 'hideKeyboard') { action = 'hideKeyboard'; target = 'Esconde teclado'; }
                    else if (cmdContent === 'back') { action = 'back'; target = 'Volta'; }
                    else if (cmdContent === 'scroll') { action = 'scroll'; target = 'Rola a tela'; }
                    else if (cmdContent.startsWith('tapOn:')) {
                        action = 'tapOn';
                        target = cmdContent.replace('tapOn:', '').trim().replace(/^"|"$/g, '');
                    }
                    else if (cmdContent.startsWith('inputText:')) {
                        action = 'inputText';
                        value = cmdContent.replace('inputText:', '').trim().replace(/^"|"$/g, '');
                        target = `Digita: ${value}`;
                    }
                    else if (cmdContent.startsWith('assertVisible:')) {
                        action = 'assertVisible';
                        target = cmdContent.replace('assertVisible:', '').trim().replace(/^"|"$/g, '');
                    }
                    else if (cmdContent.startsWith('extendedWaitUntil:')) {
                        action = 'extendedWaitUntil';
                        // Read next lines for visible/timeout
                        const nextLines: string[] = [];
                        while (i + 1 < lines.length && lines[i + 1].match(/^\s+/)) {
                            i++;
                            nextLines.push(lines[i].trim());
                        }
                        const visMatch = nextLines.find(l => l.startsWith('visible:'));
                        const tmMatch = nextLines.find(l => l.startsWith('timeout:'));
                        target = visMatch ? visMatch.replace('visible:', '').trim().replace(/^"|"$/g, '') : '';
                        value = tmMatch ? tmMatch.replace('timeout:', '').trim() : '5000';
                    }
                    else {
                        action = cmdContent.split(':')[0] || cmdContent;
                        target = cmdContent;
                    }

                    steps.push({
                        id: String(stepNum),
                        num: stepNum,
                        action,
                        target,
                        value,
                        engine: 'maestro',
                        maestro_command: line,
                    });
                }
            }

            if (steps.length === 0) {
                setImportStatus({ type: 'error', message: 'Nenhum comando Maestro encontrado no arquivo.' });
                return;
            }

            // Save to Supabase — upsert by name so re-importing the same YAML
            // refreshes the existing row instead of creating a duplicate entry.
            const testName = file.name.replace('.yaml', '').replace('.yml', '').replace(/_/g, ' ');
            const importedAppId = extractAppIdFromYaml(rawContent);
            const baseRow: Record<string, unknown> = {
                name: testName,
                description: `Importado de ${file.name} (${steps.length} passos)`,
                steps,
                tags: ['maestro', 'imported'],
                project_id: projectId,
                is_active: true,
                app_id: importedAppId,
                raw_yaml: rawContent,
            };
            const { data: existingImport, error: lookupErr } = await supabase
                .from('test_cases')
                .select('id')
                .eq('project_id', projectId)
                .eq('name', testName)
                .order('created_at', { ascending: false })
                .limit(1);
            if (lookupErr) throw lookupErr;

            if (existingImport && existingImport.length > 0) {
                const { error } = await supabase
                    .from('test_cases')
                    .update(baseRow)
                    .eq('id', existingImport[0].id);
                if (error) throw error;
                setImportStatus({ type: 'success', message: `"${testName}" atualizado com ${steps.length} passos!` });
            } else {
                const { error } = await supabase
                    .from('test_cases')
                    .insert({ ...baseRow, version: 1 });
                if (error) throw error;
                setImportStatus({ type: 'success', message: `"${testName}" importado com ${steps.length} passos!` });
            }
            // Refresh tests list
            fetchProject();

            // Close modal after 2s
            setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 2000);

        } catch (err: unknown) {
            console.error('Import failed:', err);
            setImportStatus({ type: 'error', message: `Erro ao importar: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setImporting(false);
        }
    };

    const fetchProject = async () => {
        try {
            const { data: proj, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (error) throw error;
            setProject(proj);
            setFormData({
                name: proj.name,
                description: proj.description,
                platform: proj.platform || 'android',
                status: proj.status
            });

            // Fetch tests from Supabase only
            const { data: testData } = await supabase
                .from('test_cases')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            setTests(testData || []);
        } catch (error) {
            console.error('Error fetching project:', error);
            // Fallback mock data
            setProject({
                id: projectId,
                name: 'Projeto Demo',
                description: 'Projeto de demonstração',
                platform: 'android',
                status: 'Ativo'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProject();
    }, [projectId]);

    // Deep-link from /dashboard/tests: ?openStudioFor=<id>.
    // We split this into two effects so the modal opens INSTANTLY on mount
    // (covers the project page so the user doesn't see it flash), while the
    // actual YAML write + iframe load runs once `tests` is populated.
    const studioAutoOpenedRef = useRef<string | null>(null);

    // (1) On first mount, if the deep-link param is present, raise the modal
    //     in 'starting' phase immediately. The user goes from click in /tests
    //     straight to the Maestro Studio loading spinner — no project-page flash.
    useEffect(() => {
        if (searchParams?.get('openStudioFor')) {
            setShowMaestroStudio(true);
            setMaestroPhase('starting');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // (2) Once tests are loaded, find the target and trigger the real handler.
    useEffect(() => {
        const target = searchParams?.get('openStudioFor');
        if (!target) return;
        if (studioAutoOpenedRef.current === target) return;
        if (!tests || tests.length === 0) return;
        const test = tests.find(t => t.id === target);
        if (!test) {
            // Target id missing from this project — fall back to closing the
            // pre-opened modal so the project page is usable.
            studioAutoOpenedRef.current = target;
            setShowMaestroStudio(false);
            return;
        }
        studioAutoOpenedRef.current = target;
        const fakeEvt = { preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent;
        openTestInMaestroStudio(fakeEvt, test as TestCase);
        // Strip the param so a manual reload doesn't reopen.
        const url = new URL(window.location.href);
        url.searchParams.delete('openStudioFor');
        window.history.replaceState({}, '', url.toString());
    }, [tests, searchParams]);

    const handleSaveEdit = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('projects')
                .update({
                    name: formData.name,
                    description: formData.description,
                    platform: formData.platform,
                    status: formData.status
                })
                .eq('id', projectId);
            if (error) throw error;
            setEditModalOpen(false);
            fetchProject();
        } catch (error) {
            console.error('Error updating project:', error);
            alert('Erro ao atualizar projeto.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            const { error } = await supabase.from('projects').delete().eq('id', projectId);
            if (error) throw error;
            router.push('/dashboard/projects');
        } catch (error) {
            console.error('Error deleting project:', error);
            alert('Erro ao excluir projeto.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <p>Projeto não encontrado.</p>
                <Link href="/dashboard/projects" className="text-brand hover:underline mt-2 inline-block">
                    ← Voltar para Projetos
                </Link>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/projects" className="text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                            <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                            <p className="text-textSecondary/80 text-sm">{project.description}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditModalOpen(true)}
                        className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors flex items-center gap-2 border border-border"
                    >
                        <Edit2 className="w-4 h-4" /> Editar
                    </button>
                    <button
                        onClick={() => setDeleteConfirm(true)}
                        className="px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2 border border-red-500/20"
                    >
                        <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-foreground/5 border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">TOTAL TESTES</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{tests.length}</p>
                </div>
                <div className="bg-foreground/5 border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">PLATAFORMA</p>
                    <p className="text-2xl font-bold text-foreground mt-1 capitalize">{project.platform}</p>
                </div>
                <div className="bg-foreground/5 border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">STATUS</p>
                    <p className={`text-2xl font-bold mt-1 ${
                        tests.some(t => t.status === 'failed') ? 'text-red-400' :
                        tests.some(t => t.status === 'passed') ? 'text-green-400' :
                        'text-muted-foreground'
                    }`}>
                        {tests.some(t => t.status === 'failed') ? 'Falha' :
                         tests.some(t => t.status === 'passed') ? 'Sucesso' :
                         tests.length > 0 ? 'Pendente' : '—'}
                    </p>
                </div>
                <div className="bg-foreground/5 border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ÚLTIMA EXECUÇÃO</p>
                    <p className="text-2xl font-bold text-muted-foreground mt-1">
                        {(() => {
                            const lastRun = tests.find(t => t.last_run_at);
                            return lastRun?.last_run_at
                                ? new Date(lastRun.last_run_at).toLocaleDateString('pt-BR')
                                : '—';
                        })()}
                    </p>
                </div>
            </div>

            {/* Tests List */}
            <div className="bg-foreground/5 border border-border rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Kebab menu (left) — secondary actions: scanner / map / import YAML */}
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                onClick={() => setShowMoreMenu(v => !v)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                title="Mais ações"
                                aria-haspopup="menu"
                                aria-expanded={showMoreMenu}
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>
                            {showMoreMenu && (
                                <div className="absolute left-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-2xl z-30 py-1">
                                    <button
                                        onClick={() => {
                                            setShowMoreMenu(false);
                                            setShowScannerModal(true);
                                            setScannerPhase('select_app');
                                            setScanResults(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-accent flex items-center gap-2"
                                    >
                                        <ScanSearch className="w-3.5 h-3.5" /> Scanear Aplicação
                                    </button>
                                    {hasElementMap && (
                                        <button
                                            onClick={async () => {
                                                setShowMoreMenu(false);
                                                try {
                                                    const res = await fetch(`${DAEMON}/api/projects/${projectId}/element-map`);
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setScanResults(data);
                                                        setScannerPhase('results');
                                                        setShowScannerModal(true);
                                                        const screens = Object.keys(data.screens || {});
                                                        if (screens.length > 0) setExpandedScreens({ [screens[0]]: true });
                                                    }
                                                } catch (e) { console.error('Failed to load element map:', e); }
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-cyan-300/80 hover:bg-accent flex items-center gap-2"
                                        >
                                            <Eye className="w-3.5 h-3.5" /> Ver Mapa
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setShowMoreMenu(false); setShowImportModal(true); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-amber-300 hover:bg-accent flex items-center gap-2"
                                    >
                                        <Upload className="w-3.5 h-3.5" /> Importar YAML
                                    </button>
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-bold text-foreground flex items-center gap-2">
                            <FlaskConical className="w-4 h-4 text-brand" />
                            Testes do Projeto ({tests.length})
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openMaestroStudio}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-violet-500/40 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-500/60"
                            title="Abrir Maestro Studio integrado para criar um novo teste"
                        >
                            <Wand2 className="w-3.5 h-3.5" /> Criar Teste
                        </button>
                        <Link
                            href={`/dashboard/tests/editor?projectId=${projectId}`}
                            className="bg-brand text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90 transition-all flex items-center gap-1.5"
                            title="Abrir o editor de testes para gravar passos"
                        >
                            <Clapperboard className="w-3.5 h-3.5" /> Gravar Teste
                        </Link>
                    </div>
                </div>

                {tests.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">Nenhum teste neste projeto</p>
                        <p className="text-xs mt-1 opacity-70">Crie testes no editor e vincule a este projeto</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {tests.map((test) => (
                            <Link
                                key={test.id}
                                href={`/dashboard/tests/editor?projectId=${projectId}&testId=${test.id}`}
                                className="px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors cursor-pointer block"
                            >
                                <div>
                                    <p className="text-sm font-bold text-foreground">{test.name}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {Array.isArray(test.steps) ? `${test.steps.length} passos` : ''} • {test.last_run_at ? `Ultima exec: ${new Date(test.last_run_at).toLocaleDateString('pt-BR')}` : 'Nunca executado'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${test.status === 'passed' ? 'bg-green-500/20 text-green-400' : test.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-muted-foreground'}`}>
                                        {test.status === 'passed' ? 'Sucesso' : test.status === 'failed' ? 'Falha' : 'Pendente'}
                                    </span>
                                    <button
                                        onClick={(e) => handleDeleteTest(e, test.id)}
                                        className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                                        title="Excluir teste"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleExportYaml(e, test)}
                                        className="p-2 hover:bg-foreground/10 text-muted-foreground hover:text-amber-400 rounded-lg transition-colors border border-transparent hover:border-border"
                                        title="Exportar YAML"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => openTestInMaestroStudio(e, test)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded-lg transition-colors border border-violet-500/20"
                                        title="Abrir no Maestro Studio (edita o YAML com preview do device)"
                                    >
                                        <Wand2 className="w-3.5 h-3.5" />
                                        <span className="text-[11px] font-bold">Studio</span>
                                    </button>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-colors border border-brand/20" title="Abrir no editor de passos">
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span className="text-[11px] font-bold">Editor</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-foreground/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-foreground mb-2">Excluir Projeto?</h3>
                        <p className="text-sm text-muted-foreground mb-6">O projeto &quot;{project.name}&quot; será excluído permanentemente.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                            <button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Test Confirmation */}
            {deletingTestId && (
                <div className="fixed inset-0 bg-foreground/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-foreground mb-2">Excluir Teste?</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            O teste &quot;{tests.find(t => t.id === deletingTestId)?.name}&quot; sera excluido permanentemente.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeletingTestId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                            <button onClick={confirmDeleteTest} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import YAML Modal */}
            {showImportModal && (
                <ImportYamlModal
                    importDragActive={importDragActive}
                    setImportDragActive={setImportDragActive}
                    importStatus={importStatus}
                    setImportStatus={setImportStatus}
                    importing={importing}
                    onClose={() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }}
                    handleImportFile={handleImportFile}
                />
            )}

            {/* Scanner Modal (Scanear Aplicacao) — Full screen */}
            {showScannerModal && (
                <ScannerModal
                    scannerPhase={scannerPhase}
                    setScannerPhase={setScannerPhase}
                    scannerStats={scannerStats}
                    scanResults={scanResults}
                    setScanResults={setScanResults}
                    expandedScreens={expandedScreens}
                    setExpandedScreens={setExpandedScreens}
                    scanAppPackage={scanAppPackage}
                    setScanAppPackage={setScanAppPackage}
                    scanAppLabel={scanAppLabel}
                    detectingApp={detectingApp}
                    availableDeviceUdid={availableDeviceUdid}
                    devicePreviewRef={devicePreviewRef}
                    handleScannerInteraction={handleScannerInteraction}
                    handleStopScanner={handleStopScanner}
                    onCloseFromHeader={async () => {
                        if (scannerPhase === 'scanning') await handleStopScanner();
                        setShowScannerModal(false);
                        setScanResults(null);
                        setScannerPhase('select_app');
                        setScanAppPackage(null);
                        setDetectingApp(false);
                    }}
                    onCloseFromResults={() => { setShowScannerModal(false); setScanResults(null); setScannerPhase('select_app'); }}
                />
            )}

            {/* Maestro Studio Webview Modal */}
            {showMaestroStudio && (
                <MaestroStudioModal
                    maestroPhase={maestroPhase}
                    maestroReloadKey={maestroReloadKey}
                    maestroIframeRef={maestroIframeRef}
                    embedUrl={MAESTRO_STUDIO_EMBED_URL}
                    apiUrl={MAESTRO_STUDIO_API_URL}
                    onSaveAsTest={openSaveAsTest}
                    onReload={reloadMaestroStudio}
                    onRetry={openMaestroStudio}
                    onClose={() => setShowMaestroStudio(false)}
                />
            )}

            {/* "Salvar como Teste" Modal */}
            {saveAsTestOpen && (
                <SaveAsTestModal
                    saveAsTestPhase={saveAsTestPhase}
                    saveAsTestData={saveAsTestData}
                    saveAsTestName={saveAsTestName}
                    setSaveAsTestName={setSaveAsTestName}
                    saveAsTestError={saveAsTestError}
                    onClose={() => setSaveAsTestOpen(false)}
                    onConfirm={confirmSaveAsTest}
                />
            )}

            {/* Edit Modal */}
            {editModalOpen && (
                <EditProjectModal
                    formData={formData}
                    setFormData={setFormData}
                    saving={saving}
                    onClose={() => setEditModalOpen(false)}
                    onSave={handleSaveEdit}
                />
            )}
        </div>
    );
}
