// Helpers de workspace Maestro — pasta local onde os YAMLs de teste do
// projeto são gravados. O daemon expõe o seletor nativo de pastas e a
// escrita em disco; o front nunca toca o filesystem diretamente.

import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

// Bucket do Supabase Storage onde os YAMLs vivem (workspace na nuvem).
const WORKSPACE_BUCKET = 'workspaces';

// Cliente SSR (cookie-based) — carrega a sessao do usuario logado, entao o
// role e 'authenticated' e as policies do bucket 'workspaces' liberam o upload.
// O client anon de '@/lib/supabase' nao carrega a sessao -> RLS barra o INSERT
// com "new row violates row-level security policy". So roda no browser.
let _storageClient: SupabaseClient | null = null;
function storageClient(): SupabaseClient {
    if (!_storageClient) _storageClient = createClient();
    return _storageClient;
}

// Tipo de workspace por projeto:
//   'local'    -> daemon (filesystem da maquina com o device)
//   'supabase' -> Supabase Storage (bucket 'workspaces', prefixo = id do projeto)
// O dispatcher (writeYaml/readYaml) roteia conforme o tipo.
export type WorkspaceRef =
    | { type: 'local'; path: string }
    | { type: 'supabase'; prefix: string };

/** Deriva o WorkspaceRef de um projeto (campos vindos do Supabase). */
export function workspaceRefFromProject(p: {
    id?: string;
    workspace_type?: string | null;
    workspace_path?: string | null;
}): WorkspaceRef | null {
    if (p.workspace_type === 'supabase') {
        return p.id ? { type: 'supabase', prefix: p.id } : null;
    }
    return p.workspace_path ? { type: 'local', path: p.workspace_path } : null;
}

/**
 * Abre o seletor nativo de pastas (via daemon). O diálogo do SO permite
 * criar uma nova pasta, então cobre tanto "abrir workspace existente"
 * quanto "criar novo workspace".
 * Retorna o path absoluto, ou null se o usuário cancelar / daemon offline.
 */
export async function pickWorkspaceDirectory(): Promise<string | null> {
    try {
        const res = await fetch(`${DAEMON}/api/maestro-studio/pick-directory`);
        const data = await res.json().catch(() => null);
        return (data?.path as string) || null;
    } catch {
        return null;
    }
}

/** Nome de arquivo seguro derivado do nome do teste (snake-case). */
export function testYamlFileName(testName: string): string {
    const safe = (testName || 'teste')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 80) || 'teste';
    return `${safe}.yaml`;
}

/**
 * Caminho do YAML dentro do workspace respeitando a pasta do teste.
 * `folderPath` é o caminho relativo da pasta (ex.: 'tests/basic') ou vazio
 * para a raiz. Retorna algo como 'tests/basic/login.yaml'. Os segmentos da
 * pasta são preservados (já vêm normalizados); só o nome do arquivo é
 * sanitizado por testYamlFileName.
 */
export function testYamlPath(folderPath: string | null | undefined, testName: string): string {
    const file = testYamlFileName(testName);
    const folder = (folderPath || '').replace(/^\/+|\/+$/g, '');
    return folder ? `${folder}/${file}` : file;
}

export interface WorkspaceWriteResult {
    success: boolean;
    path?: string;
    error?: string;
}

/** Grava (ou sobrescreve) um YAML dentro do workspace local via daemon. */
export async function writeYamlToWorkspace(
    workspace: string,
    fileName: string,
    content: string,
): Promise<WorkspaceWriteResult> {
    const fullPath = `${workspace.replace(/\/$/, '')}/${fileName}`;
    try {
        const res = await fetch(`${DAEMON}/api/maestro-studio/file/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath, content }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.success) return { success: true, path: fullPath };
        return { success: false, path: fullPath, error: data?.error || 'unknown error' };
    } catch (e) {
        return { success: false, path: fullPath, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Grava (ou sobrescreve) um YAML no Supabase Storage (bucket 'workspaces'). */
export async function writeYamlToSupabase(
    prefix: string,
    fileName: string,
    content: string,
    contentType = 'text/yaml',
): Promise<WorkspaceWriteResult> {
    const path = `${prefix}/${fileName}`;
    try {
        const { error } = await storageClient().storage
            .from(WORKSPACE_BUCKET)
            .upload(path, new Blob([content], { type: contentType }), { upsert: true, contentType });
        if (error) return { success: false, error: error.message };
        return { success: true, path: `supabase:${WORKSPACE_BUCKET}/${path}` };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

// Tipo MIME a partir da extensão — preserva scripts (.js/.ts) corretamente.
function contentTypeFor(relPath: string): string {
    const ext = relPath.split('.').pop()?.toLowerCase();
    if (ext === 'js') return 'application/javascript';
    if (ext === 'ts') return 'application/typescript';
    if (ext === 'json') return 'application/json';
    return 'text/yaml';
}

/**
 * Grava um arquivo no workspace preservando o caminho relativo EXATO (com
 * extensão original). Diferente de writeYaml, NÃO força `.yaml` — usado no
 * import para espelhar scripts (pages/*.js, common/*.yaml) tal como vieram, de
 * modo que runFlow/runScript resolvam na execução.
 */
export async function writeFile(
    ref: WorkspaceRef,
    relPath: string,
    content: string,
): Promise<WorkspaceWriteResult> {
    if (ref.type === 'supabase') return writeYamlToSupabase(ref.prefix, relPath, content, contentTypeFor(relPath));
    return writeYamlToWorkspace(ref.path, relPath, content);
}

/**
 * Dispatcher: grava o YAML no destino certo conforme o tipo do workspace.
 * Os chamadores passam o WorkspaceRef do projeto (workspaceRefFromProject)
 * em vez de saber se e local ou Supabase.
 */
export async function writeYaml(
    ref: WorkspaceRef,
    fileName: string,
    content: string,
): Promise<WorkspaceWriteResult> {
    if (ref.type === 'supabase') return writeYamlToSupabase(ref.prefix, fileName, content);
    return writeYamlToWorkspace(ref.path, fileName, content);
}

/**
 * Apaga um YAML do workspace (local via daemon, ou Supabase Storage).
 * Best-effort: usado ao mover um teste para outra pasta (remove o arquivo
 * antigo após gravar no novo caminho). `relPath` pode conter subpastas.
 */
export async function deleteYaml(ref: WorkspaceRef, relPath: string): Promise<WorkspaceWriteResult> {
    try {
        if (ref.type === 'supabase') {
            const { error } = await storageClient().storage.from(WORKSPACE_BUCKET).remove([`${ref.prefix}/${relPath}`]);
            if (error) return { success: false, error: error.message };
            return { success: true };
        }
        const fullPath = `${ref.path.replace(/\/$/, '')}/${relPath}`;
        const res = await fetch(`${DAEMON}/api/maestro-studio/file/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath }),
        });
        const data = await res.json().catch(() => ({}));
        return data?.success ? { success: true, path: fullPath } : { success: false, error: data?.error || 'unknown error' };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Le um YAML do workspace (local via daemon, ou Supabase Storage). */
export async function readYaml(ref: WorkspaceRef, fileName: string): Promise<string | null> {
    try {
        if (ref.type === 'supabase') {
            const { data, error } = await storageClient().storage.from(WORKSPACE_BUCKET).download(`${ref.prefix}/${fileName}`);
            if (error || !data) return null;
            return await data.text();
        }
        const fullPath = `${ref.path.replace(/\/$/, '')}/${fileName}`;
        const res = await fetch(`${DAEMON}/api/maestro-studio/file/read?path=${encodeURIComponent(fullPath)}`);
        const data = await res.json().catch(() => ({}));
        return data?.success ? (data.content as string) : null;
    } catch {
        return null;
    }
}
