export interface TestStep {
    id: string;
    action: string;
    target: string;
    status: string;
    value?: string;
    error_message?: string;
    strategies_log?: { name: string; result: string }[];
    suggestion?: string;
    engine?: 'uiautomator2' | 'maestro';
    maestro_command?: string;
    confidence?: 'high' | 'low' | 'unresolved';
    confidence_comment?: string;
}

export interface ConfidenceReport {
    high_confidence_steps: number[];
    low_confidence_steps: number[];
    unresolved_elements: string[];
}

export interface RecorderConfigState {
    open: boolean;
    testName: string;
    appId: string;
    clearState: boolean;
    tags: string;            // comma-separated, optional
    showAppIdMenu: boolean;  // combobox dropdown visibility
}

export interface ExecutionErrorState {
    message: string;
    yamlPath?: string;
}
