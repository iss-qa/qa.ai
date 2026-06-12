import type { AutomationStatus, CasePriority, CaseRunStatus } from '@/types/qa-journey';

export const AUTOMATION_STATUS_OPTIONS: { value: AutomationStatus; label: string; color: string }[] = [
    { value: 'automated', label: 'Automatizado', color: 'bg-green-500/20 text-green-500' },
    { value: 'partial',   label: 'Parcial',       color: 'bg-yellow-500/20 text-yellow-500' },
    { value: 'manual',    label: 'Manual',        color: 'bg-blue-500/20 text-blue-400' },
    { value: 'none',      label: 'Sem cobertura', color: 'bg-slate-500/20 text-slate-400' },
];

export const PRIORITY_OPTIONS: { value: CasePriority; label: string; color: string }[] = [
    { value: 'critical', label: 'Crítica', color: 'bg-red-500/20 text-red-500' },
    { value: 'high',     label: 'Alta',    color: 'bg-orange-500/20 text-orange-500' },
    { value: 'medium',   label: 'Média',   color: 'bg-yellow-500/20 text-yellow-500' },
    { value: 'low',      label: 'Baixa',   color: 'bg-green-500/20 text-green-500' },
];

export const RUN_STATUS_OPTIONS: { value: CaseRunStatus; label: string; color: string }[] = [
    { value: 'pass',    label: 'Passou',      color: 'bg-green-500/20 text-green-500' },
    { value: 'fail',    label: 'Falhou',      color: 'bg-red-500/20 text-red-500' },
    { value: 'skipped', label: 'Pulado',      color: 'bg-slate-500/20 text-slate-400' },
    { value: 'not_run', label: 'Não rodado',  color: 'bg-slate-500/20 text-slate-500' },
];

// Rótulo curto em caixa alta para tabelas/badges de resultado (PASS / FAIL).
export const RUN_STATUS_DISPLAY: Record<CaseRunStatus, string> = {
    pass: 'PASS',
    fail: 'FAIL',
    skipped: 'PULADO',
    not_run: 'NÃO RODADO',
};

// Sugestoes de icones lucide para escolha no admin.
// Lista enxuta - usuario tambem pode digitar qualquer nome valido.
export const ICON_SUGGESTIONS = [
    'Lock', 'LogIn', 'UserPlus', 'ShoppingCart', 'CreditCard',
    'Wallet', 'Send', 'ArrowDownToLine', 'ArrowUpFromLine',
    'Settings', 'Bell', 'Search', 'Star', 'Heart', 'Home',
    'Smartphone', 'Globe', 'Shield', 'Key', 'FileText',
];

// Paleta de cores sugerida para nodes do mapa (sera usada na Etapa 9.3).
export const COLOR_SUGGESTIONS = [
    '#7c3aed', // roxo - default
    '#3b82f6', // azul
    '#10b981', // verde
    '#f59e0b', // amber
    '#ef4444', // vermelho
    '#06b6d4', // ciano
    '#ec4899', // rosa
    '#8b5cf6', // violeta claro
];

// Converte texto livre em slug compativel com o unique constraint do schema.
export function toSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
        .replace(/[^a-z0-9]+/g, '-')                       // nao-alfanumerico vira hifen
        .replace(/^-+|-+$/g, '')                           // remove hifens das pontas
        .slice(0, 64);
}
