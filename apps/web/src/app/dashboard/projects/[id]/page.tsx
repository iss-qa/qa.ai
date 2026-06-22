'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, FlaskConical, Loader2, LayoutGrid, Edit2, Trash2, Upload, ScanSearch, Eye, Wand2, MoreVertical, Clapperboard, CalendarClock, Route, Search, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { pickWorkspaceDirectory, testYamlFileName, writeYamlToWorkspace, writeYaml } from '@/lib/workspace';
import { useDeviceStore } from '@/store/deviceStore';
import { type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';
import type { Project, ScanResults, TestStep, TestCase, TestFolder } from './project-types';
import { extractAppIdFromYaml, parseMaestroYamlToSteps, extractElementName, buildTestTree, filterTestTree, batchOutcome } from './project-utils';
import { ImportTestsModal } from './_components/ImportTestsModal';
import { ProjectTestsList } from './_components/ProjectTestsList';
import { BatchProgressModal } from './_components/BatchProgressModal';
import { SchedulesModal } from './_components/SchedulesModal';
import { MoveTestModal } from './_components/MoveTestModal';
import { useProjectTestImport } from './useProjectTestImport';
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
    // Espelha o project em ref para handlers (postMessage) lerem o valor atual
    // sem recriar o listener nem capturar closure stale.
    const projectRef = useRef<Project | null>(null);
    useEffect(() => { projectRef.current = project; }, [project]);
    const [tests, setTests] = useState<TestCase[]>([]);
    const [folders, setFolders] = useState<TestFolder[]>([]);
    const [testSearch, setTestSearch] = useState('');
    // Árvore filtrada pela busca (por nome de teste/pasta).
    const testTree = useMemo(() => {
        const full = buildTestTree(tests, folders);
        return testSearch.trim() ? filterTestTree(full, testSearch) : full;
    }, [tests, folders, testSearch]);
    // Execução MAIS RECENTE do projeto (maior last_run_at). Os cards STATUS e
    // ÚLTIMA EXECUÇÃO derivam daqui — antes o STATUS usava `tests.some(failed)`
    // ("qualquer teste que já falhou"), travando o projeto em "Falha" por causa
    // de uma falha antiga mesmo após um lote recente ter passado.
    const lastRun = useMemo(() => {
        let latest: TestCase | null = null;
        let latestMs = -Infinity;
        for (const t of tests) {
            if (!t.last_run_at) continue;
            const ms = new Date(t.last_run_at).getTime();
            if (!Number.isNaN(ms) && ms > latestMs) { latestMs = ms; latest = t; }
        }
        return latest;
    }, [tests]);
    const [loading, setLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', platform: 'android', status: 'Ativo', workspace_path: '' });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const { connectedDevice } = useDeviceStore();
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
            let workspace = (proj as { workspace_path?: string | null } | null)?.workspace_path || null;
            if (!workspace) {
                // Sem workspace definido (ex.: teste criado pelo gravador antes
                // do projeto ter pasta). Pede a pasta na hora e persiste no
                // projeto para os próximos opens.
                const wants = confirm('Este projeto ainda não tem um workspace (pasta local dos YAMLs). Deseja escolher uma pasta agora? No seletor você também pode criar uma nova.');
                if (!wants) { setShowMaestroStudio(false); return; }
                workspace = await pickWorkspaceDirectory();
                if (!workspace) { setShowMaestroStudio(false); return; }
                await supabase.from('projects').update({ workspace_path: workspace }).eq('id', projectId);
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
            const fileName = testYamlFileName(test.name);

            // Persist the YAML to disk via the daemon. Se a escrita falhar
            // (workspace apontando para um caminho inválido nesta máquina,
            // sem permissão, etc.), oferece escolher outra pasta e re-tenta.
            let writeRes = await writeYamlToWorkspace(workspace, fileName, yamlContent);
            if (!writeRes.success) {
                console.error('Failed to write YAML for studio:', writeRes);
                const retry = confirm(`Falha ao escrever o YAML no workspace "${workspace}" (${writeRes.error || 'erro desconhecido'}).\n\nDeseja escolher outra pasta para o workspace deste projeto?`);
                if (retry) {
                    const newWs = await pickWorkspaceDirectory();
                    if (newWs) {
                        workspace = newWs;
                        await supabase.from('projects').update({ workspace_path: newWs }).eq('id', projectId);
                        writeRes = await writeYamlToWorkspace(newWs, fileName, yamlContent);
                    }
                }
                if (!writeRes.success) {
                    setShowMaestroStudio(false);
                    alert('Falha ao escrever o YAML no workspace. Verifique o caminho e tente novamente.');
                    return;
                }
            }
            const fullPath = writeRes.path!;

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

            // Projeto Nuvem: grava o YAML também no Supabase Storage.
            const proj = projectRef.current;
            if (proj?.workspace_type === 'supabase') {
                const res = await writeYaml({ type: 'supabase', prefix: proj.id }, testYamlFileName(name), saveAsTestData.content);
                if (!res.success) console.error('Storage mirror (save-as-test) failed:', res.error);
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
    // Lote em execução (modal de progresso). null = nenhum.
    const [batchRunId, setBatchRunId] = useState<string | null>(null);
    // Agendamentos: modal aberto + (opcional) testes pré-selecionados p/ criar.
    const [schedulesOpen, setSchedulesOpen] = useState(false);
    const [scheduleTestIds, setScheduleTestIds] = useState<string[] | null>(null);
    // Resumo p/ o card de Agendamentos (qtd ativa + desfecho do último lote).
    const [scheduleCount, setScheduleCount] = useState<number | null>(null);
    const [lastBatch, setLastBatch] = useState<{ status: string; passed_tests?: number; failed_tests?: number; total_tests?: number } | null>(null);
    const loadScheduleSummary = useCallback(async () => {
        const D = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
        try {
            const [sRes, bRes] = await Promise.all([
                fetch(`${D}/api/schedules?project_id=${projectId}`),
                fetch(`${D}/api/batches?project_id=${projectId}`),
            ]);
            const s = await sRes.json().catch(() => []);
            if (sRes.ok && Array.isArray(s)) setScheduleCount(s.filter((x: { is_active?: boolean }) => x.is_active).length);
            const b = await bRes.json().catch(() => []);
            if (bRes.ok && Array.isArray(b) && b.length) setLastBatch(b[0] ?? null);
        } catch { /* daemon offline */ }
    }, [projectId]);

    // Dispara a execução em lote dos testes selecionados na árvore.
    const handleRunBatch = async (testIds: string[]) => {
        if (testIds.length === 0) return;
        const udid = availableDeviceUdid || connectedDevice?.udid || '';
        if (!udid) {
            alert('Nenhum dispositivo conectado. Conecte um device antes de executar o lote.');
            return;
        }
        const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
        try {
            const res = await fetch(`${DAEMON}/api/batches/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    test_ids: testIds,
                    device_udid: udid,
                    name: `Lote de ${testIds.length} teste(s)`,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.batch_run_id) {
                alert(`Falha ao iniciar o lote: ${data?.detail || res.status}`);
                return;
            }
            setBatchRunId(data.batch_run_id);
        } catch (e) {
            alert(`Erro ao iniciar o lote: ${e instanceof Error ? e.message : String(e)}`);
        }
    };
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
        loadScheduleSummary();
    }, [projectId, loadScheduleSummary]);

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

                    // Projeto Nuvem: espelha o YAML salvo no Studio para o
                    // Supabase Storage (workspace na nuvem), além do disco local.
                    const proj = projectRef.current;
                    if (proj?.workspace_type === 'supabase') {
                        const res = await writeYaml({ type: 'supabase', prefix: proj.id }, basename, content);
                        if (!res.success) console.error('Storage mirror (studio save) failed:', res.error);
                    }

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

        // Resolve appId. O launchApp GRAVADO já guarda o pacote real
        // (ex.: br.com.foxbit.foxbitandroid) → usa direto. Só nomes amigáveis
        // passam pela resolução via daemon.
        const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
        const PACKAGE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
        let appId = 'com.app.unknown';
        const launchStep = steps.find((s: TestStep) => (s.action || '').toLowerCase() === 'launchapp');
        if (launchStep) {
            const rawTarget = (launchStep.target || '').trim();
            if (PACKAGE_ID_RE.test(rawTarget)) {
                appId = rawTarget;
            } else {
                try {
                    const udid = connectedDevice?.udid || '';
                    const appHint = extractElementName(rawTarget || test.name);
                    if (udid) {
                        const res = await fetch(`${DAEMON}/api/devices/${udid}/resolve-app?name=${encodeURIComponent(appHint)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.resolved) appId = data.package_id;
                        }
                    }
                } catch { /* use unknown */ }
            }
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
                status: proj.status,
                workspace_path: proj.workspace_path || ''
            });

            // Fetch tests from Supabase only
            const { data: testData } = await supabase
                .from('test_cases')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            setTests(testData || []);

            // Pastas de testes do projeto (migration 018). Best-effort: se a
            // migration ainda não foi aplicada, segue com lista vazia.
            const { data: folderData, error: foldersErr } = await supabase
                .from('test_folders')
                .select('id, project_id, path')
                .eq('project_id', projectId);
            if (!foldersErr) setFolders((folderData || []) as TestFolder[]);
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

    // Importação (arquivos/ZIP), pastas e mover testes — extraído para um hook
    // dedicado (mantém page.tsx dentro do limite de 1.500 linhas).
    const {
        showImportModal, importTargetFolder, importInitialMode, importStatus, importing, importProgress,
        handleImportFiles, handleImportZip, handleCreateFolder,
        requestDeleteFolder, confirmDeleteFolder, deletingFolder, cancelDeleteFolder,
        openImportInto, openCreateFolder, closeImportModal,
        moveTest, setMoveTest, moving, moveStatus, setMoveStatus, confirmMoveTest,
    } = useProjectTestImport({ projectId, projectRef, refresh: fetchProject });

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
                    status: formData.status,
                    workspace_path: formData.workspace_path.trim() || null
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                        lastRun?.status === 'failed' ? 'text-red-400' :
                        lastRun?.status === 'passed' ? 'text-green-400' :
                        'text-muted-foreground'
                    }`}>
                        {lastRun?.status === 'failed' ? 'Falha' :
                         lastRun?.status === 'passed' ? 'Sucesso' :
                         tests.length > 0 ? 'Pendente' : '—'}
                    </p>
                </div>
                <div className="bg-foreground/5 border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ÚLTIMA EXECUÇÃO</p>
                    <p className="text-2xl font-bold text-muted-foreground mt-1">
                        {lastRun?.last_run_at
                            ? new Date(lastRun.last_run_at).toLocaleDateString('pt-BR')
                            : '—'}
                    </p>
                </div>
                {/* Agendamentos / Execuções em lote — clicável */}
                <button
                    onClick={() => { setScheduleTestIds(null); setSchedulesOpen(true); }}
                    className="bg-foreground/5 border border-border rounded-xl p-4 text-left transition-colors hover:border-brand/50 hover:bg-foreground/[0.08] group"
                    title="Ver agendamentos e resultados das execuções em lote"
                >
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" /> AGENDAMENTOS
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">{scheduleCount ?? '—'}</p>
                    <p className="text-[11px] mt-0.5 inline-flex items-center gap-1">
                        {lastBatch ? (() => {
                            const { label, tone } = batchOutcome(lastBatch);
                            const color = tone === 'success' ? 'text-green-400' : tone === 'warning' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : tone === 'running' ? 'text-brand' : 'text-muted-foreground';
                            return <span className={color}>último lote: {label}</span>;
                        })() : (
                            <span className="text-muted-foreground">ver execuções</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                    </p>
                </button>
                {/* Jornadas — atalho para a tela de jornadas deste projeto */}
                <Link
                    href={`/dashboard/qa-journey?project=${projectId}`}
                    className="bg-foreground/5 border border-border rounded-xl p-4 transition-colors hover:border-brand/50 hover:bg-foreground/[0.08] group"
                    title="Abrir as jornadas de QA deste projeto"
                >
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                        <Route className="w-3 h-3" /> JORNADAS
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">Ver</p>
                    <p className="text-[11px] mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                        mapa &amp; cards
                        <ChevronRight className="w-3 h-3 group-hover:text-foreground" />
                    </p>
                </Link>
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
                                        onClick={() => { setShowMoreMenu(false); openImportInto(''); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-amber-300 hover:bg-accent flex items-center gap-2"
                                    >
                                        <Upload className="w-3.5 h-3.5" /> Importar Testes
                                    </button>
                                    <button
                                        onClick={() => { setShowMoreMenu(false); setScheduleTestIds(null); setSchedulesOpen(true); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent flex items-center gap-2"
                                    >
                                        <CalendarClock className="w-3.5 h-3.5 text-brand" /> Agendamentos
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
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={testSearch}
                                onChange={(e) => setTestSearch(e.target.value)}
                                placeholder="Buscar teste…"
                                className="w-36 sm:w-56 bg-background border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
                            />
                            {testSearch && (
                                <button
                                    onClick={() => setTestSearch('')}
                                    title="Limpar busca"
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => openImportInto('')}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/60"
                            title="Importar testes: ZIP, arquivos ou criar pasta"
                        >
                            <Upload className="w-3.5 h-3.5" /> Importar Testes
                        </button>
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

                <ProjectTestsList
                    projectId={projectId}
                    tree={testTree}
                    totalCount={tests.length}
                    forceExpand={!!testSearch.trim()}
                    onDeleteTest={handleDeleteTest}
                    onExportYaml={handleExportYaml}
                    onOpenStudio={openTestInMaestroStudio}
                    onMoveTest={(t) => { setMoveStatus({ type: 'idle', message: '' }); setMoveTest(t); }}
                    onImportIntoFolder={openImportInto}
                    onCreateSubfolder={openCreateFolder}
                    onDeleteFolder={requestDeleteFolder}
                    onRunBatch={handleRunBatch}
                    onScheduleBatch={(ids) => { setScheduleTestIds(ids); setSchedulesOpen(true); }}
                />
            </div>

            {batchRunId && (
                <BatchProgressModal
                    batchRunId={batchRunId}
                    projectId={projectId}
                    onClose={() => { setBatchRunId(null); fetchProject(); loadScheduleSummary(); }}
                />
            )}

            {schedulesOpen && (
                <SchedulesModal
                    projectId={projectId}
                    deviceUdid={availableDeviceUdid || connectedDevice?.udid || null}
                    pendingTestIds={scheduleTestIds}
                    onClose={() => { setSchedulesOpen(false); setScheduleTestIds(null); loadScheduleSummary(); }}
                />
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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

            {/* Excluir Pasta — modal da app (substitui o confirm() nativo) */}
            {deletingFolder && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={cancelDeleteFolder}>
                    <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-foreground mb-2">Excluir pasta?</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            A pasta <span className="font-mono text-foreground">{deletingFolder}/</span> e <span className="font-semibold text-foreground">todos os testes</span> dentro dela serão excluídos permanentemente. Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={cancelDeleteFolder} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                            <button onClick={confirmDeleteFolder} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir pasta</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Tests Modal — ZIP / Arquivos / Criar pasta */}
            {showImportModal && (
                <ImportTestsModal
                    defaultFolder={importTargetFolder}
                    initialMode={importInitialMode}
                    importStatus={importStatus}
                    importing={importing}
                    importProgress={importProgress}
                    onClose={closeImportModal}
                    onImportFiles={handleImportFiles}
                    onImportZip={handleImportZip}
                    onCreateFolder={handleCreateFolder}
                />
            )}

            {/* Mover teste entre pastas */}
            {moveTest && (
                <MoveTestModal
                    test={moveTest}
                    tree={buildTestTree(tests, folders)}
                    moving={moving}
                    status={moveStatus}
                    onClose={() => { setMoveTest(null); setMoveStatus({ type: 'idle', message: '' }); }}
                    onConfirm={confirmMoveTest}
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
