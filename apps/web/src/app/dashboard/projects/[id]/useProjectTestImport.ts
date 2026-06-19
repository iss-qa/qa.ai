'use client';

import { useState, type MutableRefObject } from 'react';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { testYamlPath, writeFile, deleteYaml, workspaceRefFromProject } from '@/lib/workspace';
import { extractAppIdFromYaml, parseMaestroYamlToSteps, normalizeFolderPath } from './project-utils';
import type { Project, TestCase } from './project-types';

type ImportStatus = { type: 'idle' | 'error' | 'success'; message: string };

// Caminhos a ignorar SEMPRE na importação: pastas de dependências/build,
// metadados do macOS e qualquer pasta/arquivo oculto (.git, .vscode, .maestro…).
function isJunkPath(relPath: string): boolean {
    const segments = relPath.split('/').filter(Boolean);
    return segments.some(seg =>
        seg === 'node_modules'
        || seg === '__MACOSX'
        || seg.startsWith('.'));   // dotfiles/dotfolders (._*, .DS_Store, .git, .vscode…)
}
type MoveStatus = { type: 'idle' | 'error'; message: string };

interface UseProjectTestImportOpts {
    projectId: string;
    projectRef: MutableRefObject<Project | null>;
    refresh: () => Promise<void>;
}

/**
 * Toda a lógica de importação (arquivos / ZIP), pastas (criar / excluir) e
 * mover testes entre pastas da página de projeto. Extraído de page.tsx para
 * respeitar o limite de 1.500 linhas por arquivo.
 *
 * O vínculo da Jornada é por ID (qa_journey_cases.test_case_id → test_cases.id),
 * então mover um teste só muda `folder_path`: nenhuma referência quebra.
 */
export function useProjectTestImport({ projectId, projectRef, refresh }: UseProjectTestImportOpts) {
    const [showImportModal, setShowImportModal] = useState(false);
    // Pasta-alvo da importação (preenchida quando aberta a partir de uma pasta).
    const [importTargetFolder, setImportTargetFolder] = useState('');
    // Aba inicial do modal: 'files' ao importar, 'folder' ao criar subpasta.
    const [importInitialMode, setImportInitialMode] = useState<'zip' | 'files' | 'folder'>('files');
    const [importStatus, setImportStatus] = useState<ImportStatus>({ type: 'idle', message: '' });
    const [importing, setImporting] = useState(false);
    // Progresso da importação (0–100) para a barra animada no modal.
    const [importProgress, setImportProgress] = useState(0);
    // Pasta aguardando confirmação de exclusão (modal da app, não confirm()).
    const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
    // Mover teste entre pastas
    const [moveTest, setMoveTest] = useState<TestCase | null>(null);
    const [moving, setMoving] = useState(false);
    const [moveStatus, setMoveStatus] = useState<MoveStatus>({ type: 'idle', message: '' });

    // Garante que as pastas (e ancestrais) existam em test_folders. Idempotente.
    const ensureFolders = async (paths: string[]) => {
        const set = new Set<string>();
        for (const raw of paths) {
            const norm = normalizeFolderPath(raw);
            if (!norm) continue;
            // Registra o path e todos os ancestrais (tests/basic -> tests, tests/basic).
            const segs = norm.split('/');
            let acc = '';
            for (const seg of segs) { acc = acc ? `${acc}/${seg}` : seg; set.add(acc); }
        }
        if (set.size === 0) return;
        const rows = Array.from(set).map(path => ({ project_id: projectId, path }));
        // onConflict (project_id, path) — idempotente.
        await supabase.from('test_folders').upsert(rows, { onConflict: 'project_id,path', ignoreDuplicates: true });
    };

    // Importa o conteúdo de um arquivo de teste para o projeto numa pasta.
    // Faz upsert por (nome, pasta) e espelha o YAML no workspace (best-effort).
    const importTestContent = async (
        fileName: string,
        rawContent: string,
        folderPath: string,
    ): Promise<{ ok: boolean; name: string; error?: string }> => {
        // Import é estrito: SÓ arquivos YAML viram testes. Qualquer outro
        // formato (.js/.ts/.json/etc.) é ignorado pelos chamadores, mas
        // mantemos a guarda aqui por segurança.
        if (!/\.(ya?ml)$/i.test(fileName)) {
            return { ok: false, name: fileName, error: 'Ignorado (não é YAML)' };
        }
        const testName = fileName.replace(/\.(ya?ml)$/i, '').replace(/_/g, ' ').trim() || fileName;
        const folder = normalizeFolderPath(folderPath) || null;
        // Caminho relativo EXATO no workspace, preservando o basename original
        // (ex.: 'tests/home/inicio.yaml'). É o que o Maestro espera para
        // resolver runFlow na execução.
        const exactRelPath = folder ? `${folder}/${fileName}` : fileName;
        const proj = projectRef.current;
        const ref = proj ? workspaceRefFromProject(proj) : null;

        const steps = parseMaestroYamlToSteps(rawContent);
        if (steps.length === 0) {
            return { ok: false, name: testName, error: 'YAML inválido ou sem comandos Maestro' };
        }
        const importedAppId = extractAppIdFromYaml(rawContent);
        const baseRow: Record<string, unknown> = {
            name: testName,
            description: `Importado de ${fileName} (${steps.length} passos)`,
            steps,
            tags: ['maestro', 'imported'],
            project_id: projectId,
            is_active: true,
            app_id: importedAppId,
            raw_yaml: rawContent,
            folder_path: folder,
            workspace_path: exactRelPath,
        };
        // Upsert por (nome, pasta): re-importar atualiza em vez de duplicar.
        let lookup = supabase
            .from('test_cases')
            .select('id')
            .eq('project_id', projectId)
            .eq('name', testName);
        lookup = folder ? lookup.eq('folder_path', folder) : lookup.is('folder_path', null);
        const { data: existing, error: lookupErr } = await lookup
            .order('created_at', { ascending: false })
            .limit(1);
        if (lookupErr) return { ok: false, name: testName, error: lookupErr.message };

        if (existing && existing.length > 0) {
            const { error } = await supabase.from('test_cases').update(baseRow).eq('id', existing[0].id);
            if (error) return { ok: false, name: testName, error: error.message };
        } else {
            const { error } = await supabase.from('test_cases').insert({ ...baseRow, version: 1 });
            if (error) return { ok: false, name: testName, error: error.message };
        }

        // Espelha no workspace no caminho EXATO (basename original preservado),
        // para runFlow "tc_x.yaml" casar com o arquivo materializado.
        try {
            if (ref) await writeFile(ref, exactRelPath, rawContent);
        } catch { /* mirror é best-effort */ }

        return { ok: true, name: testName };
    };

    // Importa um ou vários arquivos de teste numa pasta (vazia = raiz).
    const handleImportFiles = async (files: File[], folderPath: string) => {
        if (files.length === 0) return;
        setImporting(true);
        setImportProgress(0);
        setImportStatus({ type: 'idle', message: '' });
        try {
            const folder = normalizeFolderPath(folderPath);
            // Import estrito: só arquivos .yaml/.yml. O resto é ignorado.
            const yamlFiles = files.filter(f => /\.(ya?ml)$/i.test(f.name));
            const ignored = files.length - yamlFiles.length;
            if (yamlFiles.length === 0) {
                setImportStatus({ type: 'error', message: 'Nenhum arquivo .yaml selecionado. Apenas testes YAML são importados.' });
                return;
            }
            if (folder) await ensureFolders([folder]);
            const results: { ok: boolean; name: string; error?: string }[] = [];
            let done = 0;
            for (const file of yamlFiles) {
                const content = await file.text();
                results.push(await importTestContent(file.name, content, folder));
                done++;
                setImportProgress(Math.round((done / yamlFiles.length) * 100));
            }
            const okCount = results.filter(r => r.ok).length;
            const failed = results.filter(r => !r.ok);
            const ignoredMsg = ignored > 0 ? ` (${ignored} não-YAML ignorado(s))` : '';
            await refresh();
            if (failed.length === 0) {
                setImportStatus({ type: 'success', message: `${okCount} teste(s) importado(s) com sucesso!${ignoredMsg}` });
                setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 1500);
            } else {
                setImportStatus({
                    type: 'error',
                    message: `${okCount} importado(s), ${failed.length} falhou(aram)${ignoredMsg}: ${failed.map(f => f.name).join(', ')}`,
                });
            }
        } catch (err: unknown) {
            setImportStatus({ type: 'error', message: `Erro ao importar: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setImporting(false);
        }
    };

    // Importa um ZIP recriando a estrutura de pastas (parse client-side).
    const handleImportZip = async (file: File) => {
        setImporting(true);
        setImportProgress(0);
        setImportStatus({ type: 'idle', message: '' });
        try {
            const zip = await JSZip.loadAsync(await file.arrayBuffer());
            const all = Object.values(zip.files).filter(e => !e.dir && !isJunkPath(e.name));
            // TESTES = só .yaml/.yml (aparecem na lista do projeto).
            const testEntries = all.filter(e => /\.(ya?ml)$/i.test(e.name));
            // ASSETS = scripts de apoio (.js/.ts) referenciados por runScript.
            // Vão para o workspace (Storage) mas NÃO viram teste na lista.
            const assetEntries = all.filter(e => /\.(js|ts)$/i.test(e.name));
            if (testEntries.length === 0) {
                setImportStatus({ type: 'error', message: 'Nenhum arquivo .yaml encontrado no ZIP. Apenas testes YAML são importados.' });
                return;
            }
            // Cria APENAS as pastas que contêm um YAML (ignora pastas-lixo vazias).
            const entryDirs = testEntries.map(e => normalizeFolderPath(e.name.split('/').slice(0, -1).join('/'))).filter(Boolean);
            await ensureFolders(entryDirs);

            const proj = projectRef.current;
            const ref = proj ? workspaceRefFromProject(proj) : null;
            const total = testEntries.length + assetEntries.length;
            let done = 0;
            const bump = () => { done++; setImportProgress(Math.round((done / total) * 100)); };

            // 1. Testes YAML → test_cases + espelho no workspace.
            const results: { ok: boolean; name: string; error?: string }[] = [];
            for (const entry of testEntries) {
                const content = await entry.async('string');
                const parts = entry.name.split('/');
                const baseName = parts[parts.length - 1];
                const folder = normalizeFolderPath(parts.slice(0, -1).join('/'));
                results.push(await importTestContent(baseName, content, folder));
                bump();
            }

            // 2. Scripts de apoio → só espelho no workspace (caminho exato).
            for (const entry of assetEntries) {
                try {
                    const content = await entry.async('string');
                    if (ref) await writeFile(ref, normalizeFolderPath(entry.name), content);
                } catch { /* best-effort */ }
                bump();
            }

            setImportProgress(100);
            const okCount = results.filter(r => r.ok).length;
            const failed = results.filter(r => !r.ok);
            const assetMsg = assetEntries.length > 0 ? ` + ${assetEntries.length} script(s) de apoio` : '';
            await refresh();
            if (failed.length === 0) {
                setImportStatus({ type: 'success', message: `ZIP importado: ${okCount} teste(s)${assetMsg} e estrutura de pastas recriada!` });
                setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 1800);
            } else {
                setImportStatus({
                    type: 'error',
                    message: `${okCount} importado(s), ${failed.length} ignorado(s): ${failed.map(f => f.name).join(', ')}`,
                });
            }
        } catch (err: unknown) {
            console.error('ZIP import failed:', err);
            setImportStatus({ type: 'error', message: `Erro ao importar ZIP: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setImporting(false);
        }
    };

    // Cria uma pasta vazia (e ancestrais) — destacada na lista de testes.
    const handleCreateFolder = async (path: string) => {
        const norm = normalizeFolderPath(path);
        if (!norm) return;
        setImporting(true);
        setImportStatus({ type: 'idle', message: '' });
        try {
            await ensureFolders([norm]);
            await refresh();
            setImportStatus({ type: 'success', message: `Pasta "${norm}/" criada!` });
            setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 1200);
        } catch (err: unknown) {
            setImportStatus({ type: 'error', message: `Erro ao criar pasta: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setImporting(false);
        }
    };

    // Exclui uma pasta e tudo dentro dela — confirmação via modal nativo da app
    // (DeleteConfirmModal), não o confirm() do navegador.
    // requestDeleteFolder apenas abre o modal; confirmDeleteFolder executa.
    const requestDeleteFolder = (path: string) => {
        const norm = normalizeFolderPath(path);
        if (norm) setDeletingFolder(norm);
    };

    const confirmDeleteFolder = async () => {
        const norm = deletingFolder;
        if (!norm) return;
        setDeletingFolder(null);
        try {
            // Testes na pasta ou em sub-pastas. Dentro de .or(), o wildcard do
            // like é '*' (PostgREST), não '%'.
            await supabase
                .from('test_cases')
                .delete()
                .eq('project_id', projectId)
                .or(`folder_path.eq.${norm},folder_path.like.${norm}/*`);
            // Registros de pasta (a própria + sub-pastas).
            await supabase
                .from('test_folders')
                .delete()
                .eq('project_id', projectId)
                .or(`path.eq.${norm},path.like.${norm}/*`);
            await refresh();
        } catch (err) {
            console.error('Delete folder failed:', err);
            alert('Erro ao excluir pasta.');
        }
    };

    // Abre o modal de importação já apontando para uma pasta (aba "Arquivos").
    const openImportInto = (folderPath: string) => {
        setImportTargetFolder(folderPath);
        setImportInitialMode('files');
        setImportStatus({ type: 'idle', message: '' });
        setShowImportModal(true);
    };

    // Abre o modal na aba "Criar pasta" com o caminho do pai pré-preenchido
    // (parent vazio = criar na raiz).
    const openCreateFolder = (parentPath: string) => {
        setImportTargetFolder(parentPath);
        setImportInitialMode('folder');
        setImportStatus({ type: 'idle', message: '' });
        setShowImportModal(true);
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setImportStatus({ type: 'idle', message: '' });
        setImportTargetFolder('');
        setImportInitialMode('files');
    };

    // Move um teste para outra pasta. Colisão de nome no destino é bloqueada.
    const confirmMoveTest = async (destFolder: string) => {
        const test = moveTest;
        if (!test) return;
        const dest = normalizeFolderPath(destFolder);
        const from = normalizeFolderPath(test.folder_path);
        if (dest === from) { setMoveTest(null); return; }

        setMoving(true);
        setMoveStatus({ type: 'idle', message: '' });
        try {
            // Bloqueio de colisão: teste de mesmo nome já na pasta destino.
            let clashQ = supabase
                .from('test_cases')
                .select('id')
                .eq('project_id', projectId)
                .eq('name', test.name)
                .neq('id', test.id);
            clashQ = dest ? clashQ.eq('folder_path', dest) : clashQ.is('folder_path', null);
            const { data: clash, error: clashErr } = await clashQ.limit(1);
            if (clashErr) throw clashErr;
            if (clash && clash.length > 0) {
                setMoveStatus({
                    type: 'error',
                    message: `Já existe um teste "${test.name}" ${dest ? `na pasta "${dest}/"` : 'na raiz'}. Renomeie-o ou escolha outra pasta.`,
                });
                setMoving(false);
                return;
            }

            if (dest) await ensureFolders([dest]);

            // Preserva o basename exato (workspace_path antigo) ao trocar de pasta;
            // cai para o nome sanitizado quando o teste não tem workspace_path.
            const baseName = (test.workspace_path?.split('/').pop()) || testYamlPath(null, test.name);
            const newWorkspacePath = dest ? `${dest}/${baseName}` : baseName;
            const oldWorkspacePath = test.workspace_path
                || testYamlPath(from || null, test.name);

            const { error } = await supabase
                .from('test_cases')
                .update({ folder_path: dest || null, workspace_path: newWorkspacePath })
                .eq('id', test.id);
            if (error) throw error;

            // Migra o arquivo espelhado: grava no novo caminho e apaga o antigo
            // (best-effort — o banco é a fonte da verdade).
            try {
                const proj = projectRef.current;
                const ref = proj ? workspaceRefFromProject(proj) : null;
                if (ref && typeof test.raw_yaml === 'string' && test.raw_yaml.trim()) {
                    await writeFile(ref, newWorkspacePath, test.raw_yaml);
                    if (oldWorkspacePath !== newWorkspacePath) {
                        await deleteYaml(ref, oldWorkspacePath);
                    }
                }
            } catch { /* mirror é best-effort */ }

            await refresh();
            setMoveTest(null);
        } catch (err: unknown) {
            setMoveStatus({ type: 'error', message: `Erro ao mover: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setMoving(false);
        }
    };

    return {
        // import / pastas
        showImportModal, setShowImportModal, importTargetFolder, importInitialMode, importStatus, importing, importProgress,
        handleImportFiles, handleImportZip, handleCreateFolder,
        // exclusão de pasta via modal da app
        requestDeleteFolder, confirmDeleteFolder, deletingFolder, cancelDeleteFolder: () => setDeletingFolder(null),
        openImportInto, openCreateFolder, closeImportModal,
        // mover
        moveTest, setMoveTest, moving, moveStatus, setMoveStatus, confirmMoveTest,
    };
}
