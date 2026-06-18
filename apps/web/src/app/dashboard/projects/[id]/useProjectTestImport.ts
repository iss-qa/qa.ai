'use client';

import { useState, type MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';
import { testYamlPath, writeYaml, deleteYaml, workspaceRefFromProject } from '@/lib/workspace';
import { extractAppIdFromYaml, parseMaestroYamlToSteps, normalizeFolderPath } from './project-utils';
import type { Project, TestCase } from './project-types';

type ImportStatus = { type: 'idle' | 'error' | 'success'; message: string };
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
        const testName = fileName.replace(/\.(ya?ml|json|js|ts)$/i, '').replace(/_/g, ' ').trim() || fileName;
        const isYaml = /\.(ya?ml)$/i.test(fileName);
        const steps = isYaml ? parseMaestroYamlToSteps(rawContent) : [];
        if (isYaml && steps.length === 0) {
            return { ok: false, name: testName, error: 'YAML inválido ou sem comandos Maestro' };
        }
        const folder = normalizeFolderPath(folderPath) || null;
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

        // Espelha no workspace (Storage ou disco via daemon) preservando a pasta.
        try {
            const proj = projectRef.current;
            const ref = proj ? workspaceRefFromProject(proj) : null;
            if (ref) await writeYaml(ref, testYamlPath(folder, testName), rawContent);
        } catch { /* mirror é best-effort */ }

        return { ok: true, name: testName };
    };

    // Importa um ou vários arquivos de teste numa pasta (vazia = raiz).
    const handleImportFiles = async (files: File[], folderPath: string) => {
        if (files.length === 0) return;
        setImporting(true);
        setImportStatus({ type: 'idle', message: '' });
        try {
            const folder = normalizeFolderPath(folderPath);
            if (folder) await ensureFolders([folder]);
            const results: { ok: boolean; name: string; error?: string }[] = [];
            for (const file of files) {
                const content = await file.text();
                results.push(await importTestContent(file.name, content, folder));
            }
            const okCount = results.filter(r => r.ok).length;
            const failed = results.filter(r => !r.ok);
            await refresh();
            if (failed.length === 0) {
                setImportStatus({ type: 'success', message: `${okCount} teste(s) importado(s) com sucesso!` });
                setTimeout(() => { setShowImportModal(false); setImportStatus({ type: 'idle', message: '' }); }, 1500);
            } else {
                setImportStatus({
                    type: 'error',
                    message: `${okCount} importado(s), ${failed.length} falhou(aram): ${failed.map(f => f.name).join(', ')}`,
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
        setImportStatus({ type: 'idle', message: '' });
        try {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(await file.arrayBuffer());
            const entries = Object.values(zip.files).filter(e => !e.dir && /\.(ya?ml|json|js|ts)$/i.test(e.name));
            if (entries.length === 0) {
                setImportStatus({ type: 'error', message: 'Nenhum arquivo de teste (.yaml/.json/.js/.ts) encontrado no ZIP.' });
                return;
            }
            // Pré-cria todas as pastas presentes no ZIP (inclusive vazias).
            const allDirs = Object.values(zip.files)
                .filter(e => e.dir)
                .map(e => normalizeFolderPath(e.name))
                .filter(Boolean);
            const entryDirs = entries.map(e => normalizeFolderPath(e.name.split('/').slice(0, -1).join('/'))).filter(Boolean);
            await ensureFolders([...allDirs, ...entryDirs]);

            const results: { ok: boolean; name: string; error?: string }[] = [];
            for (const entry of entries) {
                const content = await entry.async('string');
                const parts = entry.name.split('/');
                const baseName = parts[parts.length - 1];
                const folder = normalizeFolderPath(parts.slice(0, -1).join('/'));
                results.push(await importTestContent(baseName, content, folder));
            }
            const okCount = results.filter(r => r.ok).length;
            const failed = results.filter(r => !r.ok);
            await refresh();
            if (failed.length === 0) {
                setImportStatus({ type: 'success', message: `ZIP importado: ${okCount} teste(s) e estrutura de pastas recriada!` });
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

    // Exclui uma pasta e tudo dentro dela (sub-pastas + testes).
    const handleDeleteFolder = async (path: string) => {
        const norm = normalizeFolderPath(path);
        if (!norm) return;
        if (!confirm(`Excluir a pasta "${norm}/" e todos os testes dentro dela? Esta ação não pode ser desfeita.`)) return;
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

            const { error } = await supabase
                .from('test_cases')
                .update({ folder_path: dest || null })
                .eq('id', test.id);
            if (error) throw error;

            // Migra o YAML espelhado: grava no novo caminho e apaga o antigo
            // (best-effort — o banco é a fonte da verdade).
            try {
                const proj = projectRef.current;
                const ref = proj ? workspaceRefFromProject(proj) : null;
                if (ref && typeof test.raw_yaml === 'string' && test.raw_yaml.trim()) {
                    await writeYaml(ref, testYamlPath(dest || null, test.name), test.raw_yaml);
                    if (testYamlPath(from || null, test.name) !== testYamlPath(dest || null, test.name)) {
                        await deleteYaml(ref, testYamlPath(from || null, test.name));
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
        showImportModal, setShowImportModal, importTargetFolder, importInitialMode, importStatus, importing,
        handleImportFiles, handleImportZip, handleCreateFolder, handleDeleteFolder,
        openImportInto, openCreateFolder, closeImportModal,
        // mover
        moveTest, setMoveTest, moving, moveStatus, setMoveStatus, confirmMoveTest,
    };
}
