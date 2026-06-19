export interface Project {
    id: string;
    name: string;
    description: string;
    platform: string;
    status: string;
    workspace_type?: 'local' | 'supabase' | null;
    workspace_path?: string | null;
}

export interface ScanElement {
    class?: string;
    id?: string;
    index?: number;
    text?: string;
    hint?: string;
    [key: string]: unknown;
}

export interface ScanSelectorCommand {
    type?: string;
    strategy?: string;
    command?: string;
}

export interface ScanSelectorGroup {
    element?: ScanElement;
    commands?: ScanSelectorCommand[];
}

export interface ScanScreen {
    maestro_selectors?: ScanSelectorGroup[];
    screenshot?: string;
    activity?: string;
}

export interface ScanResults {
    screens?: Record<string, ScanScreen>;
    stats?: { elements_found?: number; dumps_completed?: number };
    app_package?: string;
}

export interface TestStep {
    id?: string;
    num?: number;
    action?: string;
    target?: string;
    value?: string;
    engine?: string;
    maestro_command?: string;
}

export interface TestCase {
    id: string;
    name: string;
    status: string;
    last_run_at: string | null;
    platform: string;
    steps?: TestStep[];
    tags?: string[];
    raw_yaml?: string | null;
    app_id?: string | null;
    // Pasta relativa do teste dentro do projeto (migration 018). NULL/'' = raiz.
    folder_path?: string | null;
    // Caminho relativo exato do arquivo no workspace (migration 019), ex.:
    // 'tests/home/inicio.yaml'. Usado p/ materializar a árvore e resolver
    // runFlow/runScript na execução. NULL = derivar de folder_path + nome.
    workspace_path?: string | null;
}

// Pasta de testes do projeto (migration 018). Persiste pastas vazias.
export interface TestFolder {
    id: string;
    project_id: string;
    path: string;
}

// Nó da árvore de testes do projeto: uma pasta com sub-pastas e testes.
export interface TestTreeNode {
    name: string;        // nome da pasta (último segmento do path)
    path: string;        // path completo da pasta (ex.: tests/basic)
    folders: TestTreeNode[];
    tests: TestCase[];
}
