// Helpers de formatação/estilo para a UI de testes Web.

import type { WebRunStatus, WebResultStatus } from './web-types';

export function formatDuration(ms: number | null | undefined): string {
    if (!ms || ms < 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rest = Math.round(s % 60);
    return `${m}m ${rest}s`;
}

export function formatRelative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const days = Math.floor(h / 24);
    if (days < 30) return `há ${days}d`;
    return d.toLocaleDateString('pt-BR');
}

// Classes de cor por status do run (tokens semânticos do tema).
export function runStatusStyle(status: WebRunStatus): { text: string; bg: string; label: string } {
    switch (status) {
        case 'passed':    return { text: 'text-success', bg: 'bg-success/10 border-success/30', label: 'Passou' };
        case 'failed':    return { text: 'text-danger', bg: 'bg-danger/10 border-danger/30', label: 'Falhou' };
        case 'running':   return { text: 'text-brand', bg: 'bg-brand/10 border-brand/30', label: 'Executando' };
        case 'queued':    return { text: 'text-warning', bg: 'bg-warning/10 border-warning/30', label: 'Na fila' };
        case 'cancelled': return { text: 'text-muted-foreground', bg: 'bg-foreground/5 border-border', label: 'Cancelado' };
        case 'error':     return { text: 'text-danger', bg: 'bg-danger/10 border-danger/30', label: 'Erro' };
        default:          return { text: 'text-muted-foreground', bg: 'bg-foreground/5 border-border', label: status };
    }
}

export function resultStatusStyle(status: WebResultStatus | null): { text: string; label: string } {
    switch (status) {
        case 'passed':      return { text: 'text-success', label: 'Passou' };
        case 'failed':      return { text: 'text-danger', label: 'Falhou' };
        case 'timedOut':    return { text: 'text-danger', label: 'Timeout' };
        case 'interrupted': return { text: 'text-danger', label: 'Interrompido' };
        case 'flaky':       return { text: 'text-warning', label: 'Flaky' };
        case 'skipped':     return { text: 'text-muted-foreground', label: 'Pulado' };
        default:            return { text: 'text-muted-foreground', label: status || '—' };
    }
}
