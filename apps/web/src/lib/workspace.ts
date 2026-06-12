// Helpers de workspace Maestro — pasta local onde os YAMLs de teste do
// projeto são gravados. O daemon expõe o seletor nativo de pastas e a
// escrita em disco; o front nunca toca o filesystem diretamente.

const DAEMON = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

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

export interface WorkspaceWriteResult {
    success: boolean;
    path?: string;
    error?: string;
}

/** Grava (ou sobrescreve) um YAML dentro do workspace via daemon. */
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
