export interface Project {
    id: string;
    name: string;
    description: string;
    platform: string;
    status: string;
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
}
