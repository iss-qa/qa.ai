import type { RecordedStep } from '@/store/recordingStore';
import { stepsToMaestroYaml, type MaestroStep } from '@/lib/maestroYaml';

export const STEP_TEMPLATES = [
    {
        id: 'extendedWaitUntil',
        label: 'Aguardar texto visível',
        desc: 'Aguarda até que um texto apareça na tela',
        action: 'extendedWaitUntil',
        target: 'Busque seu produto',
        value: '10000',
        maestro_command: '- extendedWaitUntil:\n    visible:\n      text: "Busque seu produto"\n    timeout: 10000',
        yaml: `- extendedWaitUntil:\n    visible:\n      text: "Busque seu produto"\n    timeout: 10000`,
        editHint: 'Edite o texto em "Alvo"',
    },
    {
        id: 'inputText',
        label: 'Digitar texto',
        desc: 'Digita um texto no campo com foco',
        action: 'inputText',
        target: 'Maestro QAMind',
        value: '',
        maestro_command: '- inputText: "Maestro QAMind"',
        yaml: `- inputText: "Maestro QAMind"`,
        editHint: 'Edite o texto em "Alvo"',
    },
    {
        id: 'tapOn',
        label: 'Clicar em elemento',
        desc: 'Toca em um elemento pelo texto visível',
        action: 'tapOn',
        target: 'Entrar',
        value: '',
        maestro_command: '- tapOn:\n    text: "Entrar"',
        yaml: `- tapOn:\n    text: "Entrar"`,
        editHint: 'Edite o texto do botão em "Alvo"',
    },
    {
        id: 'assertVisible',
        label: 'Verificar texto visível',
        desc: 'Falha se o texto NÃO estiver na tela',
        action: 'assertVisible',
        target: 'Login realizado com sucesso',
        value: '',
        maestro_command: '- assertVisible:\n    text: "Login realizado com sucesso"',
        yaml: `- assertVisible:\n    text: "Login realizado com sucesso"`,
        editHint: 'Edite o texto esperado em "Alvo"',
    },
    {
        id: 'assertNotVisible',
        label: 'Verificar texto ausente',
        desc: 'Falha se o texto AINDA estiver na tela',
        action: 'assertNotVisible',
        target: 'Erro de autenticação',
        value: '',
        maestro_command: '- assertNotVisible:\n    text: "Erro de autenticação"',
        yaml: `- assertNotVisible:\n    text: "Erro de autenticação"`,
        editHint: 'Edite o texto indesejado em "Alvo"',
    },
    {
        id: 'waitForAnimationToEnd',
        label: 'Aguardar animação',
        desc: 'Espera todas as animações terminarem',
        action: 'waitForAnimationToEnd',
        target: 'Aguarda animações terminarem',
        value: '',
        maestro_command: '- waitForAnimationToEnd',
        yaml: `- waitForAnimationToEnd`,
        editHint: null,
    },
    {
        id: 'scroll',
        label: 'Rolar tela',
        desc: 'Rola a tela para baixo',
        action: 'scroll',
        target: 'Rola a tela para baixo',
        value: '',
        maestro_command: '- scroll',
        yaml: `- scroll`,
        editHint: null,
    },
    {
        id: 'swipe',
        label: 'Deslizar (swipe)',
        desc: 'Desliza na direção especificada',
        action: 'swipe',
        target: 'Desliza para cima',
        value: 'UP',
        maestro_command: '- swipe:\n    direction: UP\n    duration: 400',
        yaml: `- swipe:\n    direction: UP\n    duration: 400`,
        editHint: 'Edite a direção em "Valor" (UP, DOWN, LEFT, RIGHT)',
    },
    {
        id: 'hideKeyboard',
        label: 'Esconder teclado',
        desc: 'Fecha o teclado virtual',
        action: 'hideKeyboard',
        target: 'Esconde o teclado',
        value: '',
        maestro_command: '- hideKeyboard',
        yaml: `- hideKeyboard`,
        editHint: null,
    },
    {
        id: 'pressKey_back',
        label: 'Pressionar Voltar',
        desc: 'Pressiona o botão de voltar do Android',
        action: 'pressKey',
        target: 'Pressiona o botão Voltar',
        value: 'Back',
        maestro_command: '- pressKey: Back',
        yaml: `- pressKey: Back`,
        editHint: null,
    },
] as const;

export const LLM_MODELS = [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Alias)' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
];

// Maestro mock — Login Foxbit (validated on real device)
export const MOCK_MAESTRO_STEPS = [
    { id: '1', action: 'launchApp', target: 'Abre o app Foxbit', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- launchApp' },
    { id: '2', action: 'extendedWaitUntil', target: 'Aguarda botao Entrar aparecer', value: '8000', status: 'idle', engine: 'maestro' as const, maestro_command: '- extendedWaitUntil:\n    visible: "Entrar"\n    timeout: 8000' },
    { id: '3', action: 'tapOn', target: 'Clica em Entrar na tela inicial', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Entrar"' },
    { id: '4', action: 'waitForAnimationToEnd', target: 'Aguarda transicao para tela de login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- waitForAnimationToEnd' },
    { id: '5', action: 'extendedWaitUntil', target: 'Aguarda campo de email aparecer', value: '5000', status: 'idle', engine: 'maestro' as const, maestro_command: '- extendedWaitUntil:\n    visible: "Digite seu e-mail"\n    timeout: 5000' },
    { id: '6', action: 'tapOn', target: 'Toca no campo de email', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Digite seu e-mail"' },
    { id: '7', action: 'inputText', target: 'Digita o email', value: 'isaias@gmail.com', status: 'idle', engine: 'maestro' as const, maestro_command: '- inputText: "isaias@gmail.com"' },
    { id: '8', action: 'tapOn', target: 'Toca no campo de senha', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Digite sua senha"' },
    { id: '9', action: 'inputText', target: 'Digita a senha', value: 'Isaias123', status: 'idle', engine: 'maestro' as const, maestro_command: '- inputText: "Isaias123"' },
    { id: '10', action: 'hideKeyboard', target: 'Esconde o teclado', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- hideKeyboard' },
    { id: '11', action: 'tapOn', target: 'Clica em Entrar para fazer login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- tapOn: "Entrar"' },
    { id: '12', action: 'waitForAnimationToEnd', target: 'Aguarda transicao pos-login', value: '', status: 'idle', engine: 'maestro' as const, maestro_command: '- waitForAnimationToEnd' },
];

// Save YAML — tested and ALL 12 steps passed on real device
export const MOCK_MAESTRO_YAML = `appId: br.com.foxbit.foxbitandroid\n---\n- launchApp\n- extendedWaitUntil:\n    visible: "Entrar"\n    timeout: 8000\n- tapOn: "Entrar"\n- waitForAnimationToEnd\n- extendedWaitUntil:\n    visible: "Digite seu e-mail"\n    timeout: 5000\n- tapOn: "Digite seu e-mail"\n- inputText: "isaias@gmail.com"\n- tapOn: "Digite sua senha"\n- inputText: "Isaias123"\n- hideKeyboard\n- tapOn: "Entrar"\n- waitForAnimationToEnd`;

// UIAutomator2 mock
export const MOCK_U2_STEPS = [
    { id: '1', action: 'open_app', target: 'Foxbit', value: '', status: 'idle', engine: 'uiautomator2' as const },
    { id: '2', action: 'wait', target: '', value: '500', status: 'idle', engine: 'uiautomator2' as const },
    { id: '3', action: 'assert_text', target: '', value: 'Entrar', status: 'idle', engine: 'uiautomator2' as const },
    { id: '4', action: 'tap', target: 'Entrar', value: '', status: 'idle', engine: 'uiautomator2' as const },
    { id: '5', action: 'wait', target: '', value: '500', status: 'idle', engine: 'uiautomator2' as const },
    { id: '6', action: 'tap', target: 'Digite seu e-mail', value: '', status: 'idle', engine: 'uiautomator2' as const },
    { id: '7', action: 'type', target: '', value: 'isaias@gmail.com', status: 'idle', engine: 'uiautomator2' as const },
    { id: '8', action: 'tap', target: 'Digite sua senha', value: '', status: 'idle', engine: 'uiautomator2' as const },
    { id: '9', action: 'type', target: '', value: '123456', status: 'idle', engine: 'uiautomator2' as const },
    { id: '10', action: 'tap', target: 'Entrar', value: '', status: 'idle', engine: 'uiautomator2' as const },
];

export const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

/**
 * Build a Maestro YAML flow string from the recorder's RecordedStep[]. Shared
 * by the stop-recording and save-recording flows so the serialization stays
 * identical between them.
 */
export function recordedStepsToMaestroYaml(appId: string, recordedSteps: RecordedStep[]): string {
    return stepsToMaestroYaml(
        appId,
        recordedSteps.map((rs, idx) => ({
            id: rs.id,
            order: idx + 1,
            action: rs.action,
            elementId: rs.elementId || undefined,
            value: rs.value || undefined,
            direction: rs.direction,
            // launchApp carries clearState in `value` ("true") per
            // addLaunchAppStep's encoding.
            clearState: rs.action === 'launchApp' && rs.value === 'true' ? true : undefined,
        }) as MaestroStep)
    );
}

/**
 * Sanitize block-form commands missing their indented children (legacy data
 * from before the parser captured multi-line). A bare `- launchApp:` with no
 * body crashes Maestro with "Incorrect Command Format"; stripping the trailing
 * colon falls back to the default launch using the top-level appId.
 */
export function normalizeMaestroCommand(cmd: string): string {
    const lines = cmd.split('\n');
    if (lines.length === 0) return cmd;
    const head = lines[0].trim();
    const hasIndentedChild = lines.slice(1).some(l => /^\s+\S/.test(l));
    if (head.endsWith(':') && !hasIndentedChild) {
        const stripped = head.replace(/:\s*$/, '');
        return cmd.replace(lines[0], lines[0].replace(head, stripped));
    }
    return cmd;
}
