'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Play, Plus, FlaskConical, Loader2, LayoutGrid, Edit2, Trash2, X, Download, Upload, FileUp, AlertTriangle, CheckCircle2, ScanSearch, Monitor, Square } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDeviceStore } from '@/store/deviceStore';

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

    // Scanner (Scanear Aplicacao) state
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerRunning, setScannerRunning] = useState(false);
    const [scannerStats, setScannerStats] = useState({ screens_found: 0, elements_found: 0, elapsed_seconds: 0, dumps_completed: 0 });
    const [scannerTimer, setScannerTimer] = useState<ReturnType<typeof setInterval> | null>(null);
    const [hasElementMap, setHasElementMap] = useState(false);
    const [availableDeviceUdid, setAvailableDeviceUdid] = useState<string | null>(null);

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

    const handleStartScanner = async () => {
        if (!availableDeviceUdid) {
            alert('Nenhum dispositivo Android detectado via ADB. Conecte um dispositivo USB ou inicie um emulador.');
            return;
        }

        // 1. Start Maestro Studio (so its device connection is available for hierarchy dumps)
        try {
            await fetch(`${DAEMON}/api/maestro/studio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ udid: availableDeviceUdid }),
            });
        } catch (e) {
            console.warn('Could not start Maestro Studio:', e);
        }

        // 2. Open Maestro Studio in a new browser tab
        window.open('http://localhost:9999', '_blank');

        // 3. Wait a moment for Studio to initialize, then start the element scanner
        await new Promise(r => setTimeout(r, 2000));

        try {
            const res = await fetch(`${DAEMON}/api/scanner/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ udid: availableDeviceUdid, project_id: projectId }),
            });
            if (res.ok) {
                setScannerRunning(true);
                setScannerStats({ screens_found: 0, elements_found: 0, elapsed_seconds: 0, dumps_completed: 0 });
                // Poll stats every 2s
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
                setScannerRunning(false);
                setHasElementMap(true);
            }
        } catch (e) {
            console.error('Failed to stop scanner:', e);
        }
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
            const content = await file.text();

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
                            onClick={() => { setShowScannerModal(true); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 border-cyan-500/30 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50"
                        >
                            <ScanSearch className="w-3.5 h-3.5" /> Scanear Aplicacao
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all flex items-center gap-1.5"
                        >
                            <Upload className="w-3.5 h-3.5" /> Importar YAML
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

            {/* Scanner Modal (Scanear Aplicacao) */}
            {showScannerModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0A0C14] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                                    <ScanSearch className="w-5 h-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Scanear Aplicacao</h2>
                                    <p className="text-xs text-slate-400">Mapeie os elementos do app navegando por ele</p>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    if (scannerRunning) await handleStopScanner();
                                    setShowScannerModal(false);
                                }}
                                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {!scannerRunning ? (
                                /* Pre-start */
                                <div className="flex flex-col items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                                        <Monitor className="w-8 h-8 text-cyan-400" />
                                    </div>
                                    <div className="text-center max-w-sm">
                                        <h3 className="text-lg font-bold text-white mb-3">Como funciona</h3>
                                        <div className="space-y-2.5 text-sm text-slate-300 text-left">
                                            <p><span className="text-cyan-400 font-bold">1.</span> Clique em "Iniciar Scan" — o Maestro Studio abrira em outra aba</p>
                                            <p><span className="text-cyan-400 font-bold">2.</span> Na aba do Maestro Studio, navegue pelo app: abra telas, menus, formularios</p>
                                            <p><span className="text-cyan-400 font-bold">3.</span> Clique em botoes, preencha campos de login, senha, busca...</p>
                                            <p><span className="text-cyan-400 font-bold">4.</span> Em background, capturamos todos os IDs, textos e seletores automaticamente</p>
                                            <p><span className="text-cyan-400 font-bold">5.</span> Volte aqui e clique "Finalizar" — o mapa sera usado pela IA</p>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-3">Navegue por 2-3 minutos para cobrir todas as telas</p>
                                    </div>

                                    {!availableDeviceUdid ? (
                                        <p className="text-sm text-red-400">Nenhum dispositivo detectado via ADB. Conecte um celular USB ou inicie um emulador.</p>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-xs text-green-400">Dispositivo detectado: {availableDeviceUdid}</p>
                                            <button
                                                onClick={handleStartScanner}
                                                className="px-6 py-3 bg-cyan-500 text-black font-bold rounded-xl hover:bg-cyan-400 transition-all flex items-center gap-2"
                                            >
                                                <Play className="w-4 h-4 fill-current" /> Iniciar Scan
                                            </button>
                                        </div>
                                    )}
                                    {hasElementMap && (
                                        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
                                            Este projeto ja possui um mapa de elementos. Scanear novamente ira substituir.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                /* Scanner running */
                                <div className="flex flex-col items-center gap-6">
                                    {/* Animated scan indicator */}
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full border-4 border-cyan-500/20 flex items-center justify-center">
                                            <div className="w-16 h-16 rounded-full border-4 border-transparent border-t-cyan-400 animate-spin" />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <ScanSearch className="w-6 h-6 text-cyan-400" />
                                        </div>
                                    </div>

                                    <div className="text-center">
                                        <p className="text-lg font-bold text-white">Escaneando...</p>
                                        <p className="text-sm text-cyan-400 mt-1">Navegue no Maestro Studio (aba aberta)</p>
                                    </div>

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{scannerStats.screens_found}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Telas</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{scannerStats.elements_found}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Elementos</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{scannerStats.dumps_completed}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Capturas</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{Math.floor(scannerStats.elapsed_seconds / 60)}:{String(scannerStats.elapsed_seconds % 60).padStart(2, '0')}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Tempo</p>
                                        </div>
                                    </div>

                                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 w-full">
                                        <p className="text-xs text-cyan-400 text-center">
                                            Use o Maestro Studio (aba que abriu no navegador) para navegar pelo app. Abra menus, preencha campos, clique em botoes. Quando terminar, clique abaixo.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleStopScanner}
                                        className="px-6 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all flex items-center gap-2"
                                    >
                                        <Square className="w-4 h-4 fill-current" /> Finalizar Scan
                                    </button>
                                </div>
                            )}
                        </div>
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
