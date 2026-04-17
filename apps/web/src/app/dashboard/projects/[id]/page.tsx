'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play, Plus, FlaskConical, Loader2, LayoutGrid, Edit2, Trash2, X, Download, Upload, FileUp, AlertTriangle, CheckCircle2, ScanSearch, Monitor, Square, ChevronDown, ChevronRight, MousePointerClick, Eye, Copy, Smartphone, Wand2, RefreshCw, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDeviceStore } from '@/store/deviceStore';
import { DevicePreview, type DevicePreviewHandle, type RecordedInteraction } from '@/components/DevicePreview';

interface Project {
    id: string;
    name: string;
    description: string;
    platform: string;
    status: string;
}

interface TestCase {
    id: string;
    name: string;
    status: string;
    last_run_at: string | null;
    platform: string;
    steps?: any[];
    tags?: string[];
}

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
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
    // Frontend patched: "http://localhost:5050" → "http://localhost:8001/mss"
    // Cache-bust query string ensures updated polyfills/stubs load without hard refresh
    const MAESTRO_STUDIO_EMBED_URL = `/maestro-studio/index.html?v=${maestroReloadKey}`;
    const MAESTRO_STUDIO_API_URL = 'http://localhost:8001/mss';
    // unused in simple flow but kept for cleanup safety

    const openMaestroStudio = () => {
        setMaestroReloadKey(Date.now()); // cache-bust on every open
        setShowMaestroStudio(true);
        setMaestroPhase('ready');
    };

    const reloadMaestroStudio = () => {
        setMaestroReloadKey(Date.now());
        setMaestroPhase('ready');
    };

    // Scanner (Scanear Aplicacao) state
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerPhase, setScannerPhase] = useState<'select_app' | 'scanning' | 'results'>('select_app');
    const [scannerStats, setScannerStats] = useState({ screens_found: 0, elements_found: 0, elapsed_seconds: 0, dumps_completed: 0 });
    const [scannerTimer, setScannerTimer] = useState<ReturnType<typeof setInterval> | null>(null);
    const [hasElementMap, setHasElementMap] = useState(false);
    const [availableDeviceUdid, setAvailableDeviceUdid] = useState<string | null>(null);
    const [scanResults, setScanResults] = useState<any>(null);
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

    // Also update from deviceStore if available
    useEffect(() => {
        if (connectedDevice?.udid) setAvailableDeviceUdid(connectedDevice.udid);
    }, [connectedDevice]);

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

    const getSelectorsFromGroup = (selectorGroup: any): { type: string; strategy: string; command: string }[] => {
        return (selectorGroup?.commands || []).map((cmd: any) => ({
            type: cmd.type || 'tapOn',
            strategy: cmd.strategy || '',
            command: cmd.command || '',
        }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    /**
     * Extract the UI element name from a user description.
     * Removes action verbs and keeps only the element identifier.
     *
     * "Clica em Busque seu produto" -> "Busque seu produto"
     * "Aguarda o elemento Busque seu produto aparecer na tela" -> "Busque seu produto"
     * "Digita o email isaias@gmail.com" -> "isaias@gmail.com"
     * "Valida que feijao e exibido" -> "feijao"
     */
    const extractElementName = (text: string): string => {
        let label = text;

        // 1. If there's quoted text, use it directly
        const quoted = label.match(/"([^"]+)"/);
        if (quoted) return quoted[1];

        // 2. Remove action verb prefixes (order: longest first)
        const actionPrefixes = [
            'Aguarda o elemento ', 'Aguarda que o elemento ', 'Aguarda que ',
            'Aguarda a transicao de tela apos ', 'Aguarda transicao de tela',
            'Aguarda botao ', 'Aguarda o botao ', 'Aguarda campo de ',
            'Aguarda aba ', 'Aguarda o ', 'Aguarda ',
            'Clica no botao ', 'Clica no campo ', 'Clica em ', 'Clica no ', 'Clica na ',
            'Toca no campo de ', 'Toca no campo ', 'Toca no botao ',
            'Toca em ', 'Toca no ', 'Toca na ',
            'Abre o app ', 'Abre o aplicativo ', 'Abre ',
            'Digita o email ', 'Digita a senha ', 'Digita o ', 'Digita a ', 'Digita ',
            'Valida que houve resultado e ', 'Valida que ', 'Valida se ',
            'Verifica que ', 'Verifica se ', 'Confirma que ',
            'Pressiona o botao ', 'Pressiona o ', 'Pressiona ', 'Esconde ',
            'Seleciona o ', 'Seleciona a ', 'Seleciona ',
        ];
        for (const p of actionPrefixes) {
            if (label.startsWith(p)) { label = label.substring(p.length); break; }
        }

        // 3. Remove trailing context phrases
        const contextSuffixes = [
            ' aparecer na tela inicial', ' aparecer na tela', ' aparecer nos resultados',
            ' aparecer', ' apareca', ' na tela inicial', ' na tela',
            ' para garantir que esta selecionada', ' para garantir', ' para confirmar',
            ' para acessar', ' para fazer', ' para iniciar', ' para realizar',
            ' e exibido na aba de produtos', ' e exibido', ' esta visivel',
            ' nos resultados', ' na aba de produtos', ' no campo de busca',
            ' carregar', ' ficar visivel', ' ficar habilitado', ' ficar',
            ' apos tap', ' apos clicar', ' apos digitar',
        ];
        for (const s of contextSuffixes) {
            const idx = label.indexOf(s);
            if (idx > 0) { label = label.substring(0, idx); break; }
        }

        // 4. Remove leftover filler words that are never in UI
        const fillerPrefixes = [
            'botao ', 'o botao ', 'campo ', 'campo de ', 'o campo ',
            'tela ', 'aba ', 'menu ', 'icone ', 'link ',
            'elemento ', 'o elemento ',
        ];
        let labelLower = label.toLowerCase();
        for (const fw of fillerPrefixes) {
            if (labelLower.startsWith(fw)) {
                label = label.substring(fw.length);
                labelLower = label.toLowerCase();
            }
        }

        return label.trim();
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
        const launchStep = steps.find((s: any) => (s.action || '').toLowerCase() === 'launchapp');
        if (launchStep) {
            try {
                const udid = connectedDevice?.udid || '';
                const appHint = extractElementName((launchStep as any).target || test.name);
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
            const cmd = (s as any).maestro_command;
            if (cmd) {
                commands.push(cmd);
                continue;
            }

            const action = ((s as any).action || '').toLowerCase();
            const target = (s as any).target || '';
            const value = (s as any).value || '';
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
        try {
            const { error } = await supabase.from('test_cases').delete().eq('id', deletingTestId);
            if (error) throw error;
            setTests(prev => prev.filter(t => t.id !== deletingTestId));

            // Also delete local file if it exists
            const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';
            try {
                await fetch(`${DAEMON}/api/tests/${deletingTestId}`, { method: 'DELETE' });
            } catch { /* local delete is best-effort */ }
        } catch (error) {
            console.error('Error deleting test:', error);
            alert('Erro ao excluir teste.');
        } finally {
            setDeletingTestId(null);
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
            const steps: any[] = [];
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

            // Save to Supabase
            const testName = file.name.replace('.yaml', '').replace('.yml', '').replace(/_/g, ' ');
            const { error } = await supabase.from('test_cases').insert({
                name: testName,
                description: `Importado de ${file.name} (${steps.length} passos)`,
                steps,
                tags: ['maestro', 'imported'],
                project_id: projectId,
                is_active: true,
                version: 1,
            }).select().single();

            if (error) throw error;

            setImportStatus({ type: 'success', message: `"${testName}" importado com ${steps.length} passos!` });
            // Refresh tests list
            fetchProject();

            // Close modal after 2s
            setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 2000);

        } catch (err: any) {
            console.error('Import failed:', err);
            setImportStatus({ type: 'error', message: `Erro ao importar: ${err.message || err}` });
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
            <div className="p-8 text-center text-slate-400">
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
                    <Link href="/dashboard/projects" className="text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                            <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                            <p className="text-textSecondary/80 text-sm">{project.description}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditModalOpen(true)}
                        className="px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2 border border-white/10"
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
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TOTAL TESTES</p>
                    <p className="text-2xl font-bold text-white mt-1">{tests.length}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PLATAFORMA</p>
                    <p className="text-2xl font-bold text-white mt-1 capitalize">{project.platform}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">STATUS</p>
                    <p className={`text-2xl font-bold mt-1 ${
                        tests.some(t => t.status === 'failed') ? 'text-red-400' :
                        tests.some(t => t.status === 'passed') ? 'text-green-400' :
                        'text-slate-400'
                    }`}>
                        {tests.some(t => t.status === 'failed') ? 'Falha' :
                         tests.some(t => t.status === 'passed') ? 'Sucesso' :
                         tests.length > 0 ? 'Pendente' : '—'}
                    </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ÚLTIMA EXECUÇÃO</p>
                    <p className="text-2xl font-bold text-slate-400 mt-1">
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
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-brand" />
                        Testes do Projeto ({tests.length})
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setShowScannerModal(true); setScannerPhase('select_app'); setScanResults(null); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-cyan-500/30 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50"
                        >
                            <ScanSearch className="w-3.5 h-3.5" /> Scanear Aplicacao
                        </button>
                        {hasElementMap && (
                            <button
                                onClick={async () => {
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
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-cyan-500/20 text-cyan-400/70 bg-cyan-500/5 hover:bg-cyan-500/10"
                            >
                                <Eye className="w-3.5 h-3.5" /> Ver Mapa
                            </button>
                        )}
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all flex items-center gap-1.5"
                        >
                            <Upload className="w-3.5 h-3.5" /> Importar YAML
                        </button>
                        <button
                            onClick={openMaestroStudio}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-violet-500/40 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-500/60"
                            title="Abrir Maestro Studio integrado"
                        >
                            <Wand2 className="w-3.5 h-3.5" /> Novo Teste com Maestro Studio
                        </button>
                        <Link
                            href={`/dashboard/tests/editor?projectId=${projectId}`}
                            className="bg-brand text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90 transition-all flex items-center gap-1.5"
                        >
                            <Plus className="w-3 h-3" /> Novo Teste
                        </Link>
                    </div>
                </div>

                {tests.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FlaskConical className="w-8 h-8 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">Nenhum teste neste projeto</p>
                        <p className="text-xs mt-1 opacity-70">Crie testes no editor e vincule a este projeto</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {tests.map((test) => (
                            <Link
                                key={test.id}
                                href={`/dashboard/tests/editor?projectId=${projectId}&testId=${test.id}`}
                                className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer block"
                            >
                                <div>
                                    <p className="text-sm font-bold text-white">{test.name}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {Array.isArray(test.steps) ? `${test.steps.length} passos` : ''} • {test.last_run_at ? `Ultima exec: ${new Date(test.last_run_at).toLocaleDateString('pt-BR')}` : 'Nunca executado'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${test.status === 'passed' ? 'bg-green-500/20 text-green-400' : test.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                        {test.status === 'passed' ? 'Sucesso' : test.status === 'failed' ? 'Falha' : 'Pendente'}
                                    </span>
                                    <button
                                        onClick={(e) => handleDeleteTest(e, test.id)}
                                        className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                                        title="Excluir teste"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleExportYaml(e, test)}
                                        className="p-2 hover:bg-white/10 text-slate-400 hover:text-amber-400 rounded-lg transition-colors border border-transparent hover:border-white/10"
                                        title="Exportar YAML"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-colors border border-brand/20" title="Abrir no editor">
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span className="text-[11px] font-bold">Abrir</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Projeto?</h3>
                        <p className="text-sm text-slate-400 mb-6">O projeto "{project.name}" será excluído permanentemente.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Test Confirmation */}
            {deletingTestId && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Teste?</h3>
                        <p className="text-sm text-slate-400 mb-6">
                            O teste "{tests.find(t => t.id === deletingTestId)?.name}" sera excluido permanentemente.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeletingTestId(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={confirmDeleteTest} className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 transition-colors">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import YAML Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <Upload className="w-5 h-5 text-brand" />
                                <h2 className="text-lg font-bold text-white">Importar Teste Maestro</h2>
                            </div>
                            <button onClick={() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5">
                            {/* Drop zone */}
                            <div
                                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                                    importDragActive
                                        ? 'border-brand bg-brand/5 scale-[1.02]'
                                        : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
                                }`}
                                onDragOver={(e) => { e.preventDefault(); setImportDragActive(true); }}
                                onDragLeave={() => setImportDragActive(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setImportDragActive(false);
                                    const files = Array.from(e.dataTransfer.files).filter(
                                        f => f.name.endsWith('.yaml') || f.name.endsWith('.yml')
                                    );
                                    if (files.length === 0) {
                                        setImportStatus({ type: 'error', message: 'Apenas arquivos .yaml ou .yml sao aceitos.' });
                                    } else {
                                        files.forEach(f => handleImportFile(f));
                                    }
                                }}
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = '.yaml,.yml';
                                    input.multiple = true;
                                    input.onchange = (e) => {
                                        const files = Array.from((e.target as HTMLInputElement).files || []);
                                        files.forEach(f => handleImportFile(f));
                                    };
                                    input.click();
                                }}
                            >
                                {importing ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-10 h-10 text-brand animate-spin" />
                                        <p className="text-sm text-white font-medium">Importando teste...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${importDragActive ? 'bg-brand/20 text-brand' : 'bg-white/5 text-slate-400'}`}>
                                            <FileUp className="w-7 h-7" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                {importDragActive ? 'Solte os arquivos aqui' : 'Arraste e solte arquivos .yaml'}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">Suporta multiplos arquivos simultaneamente</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Status message */}
                            {importStatus.type !== 'idle' && (
                                <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
                                    importStatus.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
                                    'bg-green-500/10 border border-green-500/20 text-green-400'
                                }`}>
                                    {importStatus.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                                    <span>{importStatus.message}</span>
                                </div>
                            )}

                            {/* Help text */}
                            <div className="mt-4 bg-white/[0.03] rounded-lg p-3">
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    O arquivo deve ser um YAML valido do Maestro com a estrutura:
                                </p>
                                <pre className="text-[10px] text-slate-600 font-mono mt-2 leading-relaxed">
{`appId: com.app.example
---
- launchApp
- tapOn: "Botao"
- inputText: "texto"`}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Scanner Modal (Scanear Aplicacao) — Full screen */}
            {showScannerModal && (
                <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#0A0C14] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                                <ScanSearch className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">
                                    {scannerPhase === 'results' ? 'Resultado do Scan' : scannerPhase === 'scanning' ? `Escaneando — ${scanAppLabel}` : 'Scanear Aplicacao'}
                                </h2>
                                <p className="text-xs text-slate-400">
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
                                onClick={async () => {
                                    if (scannerPhase === 'scanning') await handleStopScanner();
                                    setShowScannerModal(false);
                                    setScanResults(null);
                                    setScannerPhase('select_app');
                                    setScanAppPackage(null);
                                    setDetectingApp(false);
                                }}
                                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
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
                                                <div className="bg-[#0A0C14]/90 border border-cyan-500/30 rounded-xl px-6 py-4 flex items-center gap-3">
                                                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                                                    <span className="text-sm text-white font-medium">Detectando app...</span>
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
                                        <Smartphone className="w-12 h-12 text-red-400" />
                                        <p className="text-sm text-red-400 text-center">Nenhum dispositivo detectado via ADB.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── PHASE 2: SCANNING (side-by-side) ── */}
                        {scannerPhase === 'scanning' && availableDeviceUdid && (
                            <>
                                {/* Left: Device preview */}
                                <div className="w-[360px] shrink-0 border-r border-white/10 relative bg-black">
                                    <DevicePreview
                                        ref={devicePreviewRef}
                                        udid={availableDeviceUdid}
                                    />
                                </div>
                                {/* Right: Live stats + element feed */}
                                <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0C14]">
                                    {/* Stats bar */}
                                    <div className="grid grid-cols-4 gap-2 p-4 border-b border-white/10 shrink-0">
                                        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2.5 text-center">
                                            <p className="text-xl font-bold text-cyan-400">{scannerStats.screens_found}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-bold">Telas</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                                            <p className="text-xl font-bold text-white">{scannerStats.elements_found}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-bold">Elementos</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                                            <p className="text-xl font-bold text-white">{scannerStats.dumps_completed}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-bold">Capturas</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                                            <p className="text-xl font-bold text-white">{Math.floor(scannerStats.elapsed_seconds / 60)}:{String(scannerStats.elapsed_seconds % 60).padStart(2, '0')}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-bold">Tempo</p>
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
                                            <p className="text-white font-bold">Capturando elementos...</p>
                                            <p className="text-xs text-slate-400 mt-2 max-w-xs">Navegue pelo app no celular. Abra telas, menus, preencha campos. Os elementos sao capturados a cada 4 segundos.</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── PHASE 3: RESULTS (side-by-side) ── */}
                        {scannerPhase === 'results' && scanResults && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0C14]">
                                {/* Stats summary */}
                                <div className="grid grid-cols-4 gap-2 p-4 border-b border-white/10 shrink-0">
                                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2.5 text-center">
                                        <p className="text-xl font-bold text-cyan-400">{Object.keys(scanResults.screens || {}).length}</p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold">Telas</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                                        <p className="text-xl font-bold text-white">{scanResults.stats?.elements_found || 0}</p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold">Elementos</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                                        <p className="text-xl font-bold text-white">{scanResults.stats?.dumps_completed || 0}</p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold">Capturas</p>
                                    </div>
                                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2.5 text-center">
                                        <p className="text-xl font-bold text-green-400">
                                            {(() => { let t = 0; Object.values(scanResults.screens || {}).forEach((s: any) => { (s.maestro_selectors || []).forEach((g: any) => { t += (g.commands || []).length; }); }); return t; })()}
                                        </p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold">Seletores</p>
                                    </div>
                                </div>
                                {/* Scrollable results */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {Object.entries(scanResults.screens || {}).map(([screenName, screenData]: [string, any]) => {
                                        const selectorGroups = screenData.maestro_selectors || [];
                                        const screenshot = screenData.screenshot || '';
                                        const activity = screenData.activity || '';
                                        const isExpanded = expandedScreens[screenName] || false;
                                        return (
                                            <div key={screenName} className="border border-white/10 rounded-xl overflow-hidden">
                                                {/* Screen header with thumbnail */}
                                                <button
                                                    onClick={() => setExpandedScreens(prev => ({ ...prev, [screenName]: !prev[screenName] }))}
                                                    className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                                                >
                                                    {/* Screenshot thumbnail */}
                                                    {screenshot ? (
                                                        <img
                                                            src={`data:image/png;base64,${screenshot}`}
                                                            alt={screenName}
                                                            className="w-10 h-[52px] object-cover rounded-md border border-white/10 shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-[52px] rounded-md border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                                                            <Monitor className="w-4 h-4 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 text-left min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                                            <span className="font-bold text-sm text-white truncate">{screenName}</span>
                                                        </div>
                                                        {activity && <p className="text-[10px] text-slate-500 font-mono ml-5.5 truncate">{activity}</p>}
                                                    </div>
                                                    <span className="text-xs text-slate-400 shrink-0">{selectorGroups.length} elementos</span>
                                                </button>

                                                {/* Expanded: screenshot + elements */}
                                                {isExpanded && (
                                                    <div className="border-t border-white/5">
                                                        {/* Large screenshot preview */}
                                                        {screenshot && (
                                                            <div className="p-3 bg-black/30 flex justify-center">
                                                                <img
                                                                    src={`data:image/png;base64,${screenshot}`}
                                                                    alt={screenName}
                                                                    className="max-h-[300px] rounded-lg border border-white/10 object-contain"
                                                                />
                                                            </div>
                                                        )}
                                                        {/* Elements */}
                                                        <div className="max-h-[50vh] overflow-y-auto">
                                                            {selectorGroups.map((group: any, gIdx: number) => {
                                                                const el = group.element || {};
                                                                const selectors = getSelectorsFromGroup(group);
                                                                if (selectors.length === 0) return null;
                                                                return (
                                                                    <div key={gIdx} className="border-b border-white/5 last:border-0">
                                                                        <div className="px-4 py-2 bg-white/[0.02]">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="text-xs font-mono text-slate-500">{el.class?.split('.').pop() || 'View'}</span>
                                                                                {el.id && <span className="text-xs bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded font-mono">id: {el.id}{'index' in el ? ` [${el.index}]` : ''}</span>}
                                                                                {el.text && <span className="text-xs bg-white/5 text-white px-1.5 py-0.5 rounded truncate max-w-[250px]">&quot;{el.text}&quot;</span>}
                                                                                {el.hint && el.hint !== el.text && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded truncate max-w-[200px]">hint: &quot;{el.hint}&quot;</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="px-4 py-1.5 space-y-1">
                                                                            {selectors.map((sel, sIdx) => (
                                                                                <div key={sIdx} className="flex items-center gap-2 group">
                                                                                    <span className={`w-14 text-[10px] font-bold uppercase shrink-0 ${sel.type === 'tapOn' ? 'text-green-400' : 'text-blue-400'}`}>
                                                                                        {sel.type === 'tapOn' ? <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> tap</span> : <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> assert</span>}
                                                                                    </span>
                                                                                    <code className="flex-1 text-xs text-slate-300 font-mono bg-black/30 px-2 py-1 rounded whitespace-pre">{sel.command}</code>
                                                                                    <button onClick={() => copyToClipboard(sel.command)} className="p-1 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Copiar"><Copy className="w-3 h-3" /></button>
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
                                <div className="flex gap-3 p-4 border-t border-white/10 shrink-0">
                                    <button onClick={() => { setScanResults(null); setScannerPhase('select_app'); setScanAppPackage(null); }} className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-bold rounded-xl hover:bg-cyan-400 text-sm flex items-center justify-center gap-2">
                                        <ScanSearch className="w-4 h-4" /> Novo Scan
                                    </button>
                                    <button onClick={() => { setShowScannerModal(false); setScanResults(null); setScannerPhase('select_app'); }} className="flex-1 px-4 py-2.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 text-sm border border-white/10">
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Maestro Studio Webview Modal */}
            {showMaestroStudio && (
                <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#0A0C14] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                                <Wand2 className="w-4 h-4 text-violet-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">Maestro Studio</h2>
                                <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                                    {MAESTRO_STUDIO_API_URL}
                                    {maestroPhase === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={reloadMaestroStudio}
                                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                title="Recarregar"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <a
                                href={MAESTRO_STUDIO_EMBED_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                title="Abrir em nova aba (tela cheia)"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setShowMaestroStudio(false)}
                                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content area */}
                    <div className="flex-1 relative overflow-hidden">

                        {/* ── STARTING: quick ping in progress ── */}
                        {maestroPhase === 'starting' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#0A0C14] z-10">
                                <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-violet-400 animate-spin" />
                            </div>
                        )}

                        {/* ── ERROR: no device connected ── */}
                        {maestroPhase === 'error' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#0A0C14] z-10 p-8">
                                <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <Smartphone className="w-10 h-10 text-amber-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-bold text-xl">Nenhum dispositivo conectado</p>
                                    <p className="text-slate-400 text-sm mt-2">Conecte um dispositivo Android via USB para usar o Maestro Studio</p>
                                </div>
                                <button
                                    onClick={openMaestroStudio}
                                    className="px-8 py-3 bg-violet-500 text-white font-bold rounded-xl hover:bg-violet-600 active:scale-95 transition-all flex items-center gap-2 text-sm"
                                >
                                    <RefreshCw className="w-4 h-4" /> Tentar novamente
                                </button>
                            </div>
                        )}

                        {/* ── READY: render the embedded Maestro Studio frontend ── */}
                        {maestroPhase === 'ready' && (
                            <iframe
                                key={maestroReloadKey}
                                src={MAESTRO_STUDIO_EMBED_URL}
                                className="w-full h-full border-0"
                                allow="clipboard-read; clipboard-write"
                                title="Maestro Studio"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setEditModalOpen(false)} className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                        <div className="p-6 border-b border-white/10">
                            <h2 className="text-xl font-bold text-white">Editar Projeto</h2>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</label>
                                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</label>
                                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50 resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plataforma</label>
                                    <select value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50">
                                        <option value="android">Android</option>
                                        <option value="ios">iOS</option>
                                        <option value="web">Web</option>
                                        <option value="multi">Multi-plataforma</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50">
                                        <option value="Ativo">Ativo</option>
                                        <option value="Arquivado">Arquivado</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 pt-2 flex gap-3 justify-end">
                            <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={handleSaveEdit} disabled={saving || !formData.name.trim()} className="px-5 py-2 bg-brand text-black text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
