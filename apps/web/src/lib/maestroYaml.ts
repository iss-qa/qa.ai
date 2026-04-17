/**
 * Maestro YAML generation utilities for QAMind.
 * Converts structured test steps into valid Maestro YAML flows.
 */

export interface MaestroStep {
    id: string;
    order: number;
    action: 'assertVisible' | 'tapOn' | 'inputText' | 'scroll' | 'swipe' | 'waitForAnimationToEnd' | 'back' | 'hideKeyboard' | 'launchApp';
    elementId?: string;
    value?: string;
    direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
    timeout?: number;
}

/**
 * Serialize structured steps into a valid Maestro YAML flow string.
 */
export function stepsToMaestroYaml(appId: string, steps: MaestroStep[]): string {
    const header = `appId: ${appId}\n---\n`;
    const body = steps.map(step => {
        switch (step.action) {
            case 'assertVisible':
                if (step.elementId) {
                    return `- assertVisible:\n    id: "${step.elementId}"`;
                }
                return `- assertVisible:\n    text: "${step.value || ''}"`;
            case 'tapOn':
                if (step.elementId) {
                    return `- tapOn:\n    id: "${step.elementId}"`;
                }
                return `- tapOn: "${step.value || ''}"`;
            case 'inputText':
                return `- inputText: "${step.value || ''}"`;
            case 'scroll':
                return `- scroll`;
            case 'swipe':
                return `- swipe:\n    direction: ${step.direction || 'UP'}`;
            case 'waitForAnimationToEnd':
                return `- waitForAnimationToEnd:\n    timeout: ${step.timeout || 5000}`;
            case 'back':
                return `- pressKey: Back`;
            case 'hideKeyboard':
                return `- hideKeyboard`;
            case 'launchApp':
                return `- launchApp`;
            default:
                return '';
        }
    }).filter(Boolean).join('\n');
    return header + body;
}

/**
 * Get the display label for a Maestro action type.
 */
export function getMaestroActionLabel(action: string): string {
    switch (action) {
        case 'assertVisible': return 'ASSERT';
        case 'tapOn': return 'TAP';
        case 'inputText': return 'TYPE';
        case 'scroll': return 'SCROLL';
        case 'swipe': return 'SWIPE';
        case 'waitForAnimationToEnd': return 'WAIT';
        case 'back': return 'BACK';
        case 'hideKeyboard': return 'KEYBOARD';
        case 'launchApp': return 'LAUNCH';
        default: return action.toUpperCase();
    }
}

/**
 * Get the Maestro action icon for display.
 */
export function getMaestroActionIcon(action: string): string {
    switch (action) {
        case 'assertVisible': return '👁';
        case 'tapOn': return '👆';
        case 'inputText': return '⌨';
        case 'scroll': return '📜';
        case 'swipe': return '↔';
        case 'waitForAnimationToEnd': return '⏳';
        case 'back': return '◀';
        case 'hideKeyboard': return '⌨';
        case 'launchApp': return '🚀';
        default: return '•';
    }
}

/**
 * Get a human-readable description for a step.
 */
export function getMaestroStepDescription(action: string, elementId?: string, value?: string): string {
    switch (action) {
        case 'assertVisible':
            return `Confirmar tela › ${elementId || value || '?'}`;
        case 'tapOn':
            return `Tocar em › ${elementId || value || '?'}`;
        case 'inputText':
            return `Digitar › "${value || ''}"`;
        case 'scroll':
            return 'Rolar tela';
        case 'swipe':
            return `Deslizar ${value || 'UP'}`;
        case 'waitForAnimationToEnd':
            return 'Aguardar animação';
        case 'back':
            return 'Voltar';
        case 'hideKeyboard':
            return 'Esconder teclado';
        case 'launchApp':
            return 'Iniciar app';
        default:
            return `${action} ${elementId || value || ''}`;
    }
}
