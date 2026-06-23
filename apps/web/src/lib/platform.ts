// Plataforma do projeto. Web (Playwright via GitHub Actions) tem um fluxo
// distinto do mobile (Maestro/daemon): sem Importar/Criar/Gravar teste, e sim
// conectar repositório + rodar via CI.

export type PlatformKind = 'web' | 'android' | 'ios' | 'multi';

export function isWebPlatform(platform: string | null | undefined): boolean {
    return (platform || '').toLowerCase() === 'web';
}

export function isMobilePlatform(platform: string | null | undefined): boolean {
    const p = (platform || '').toLowerCase();
    return p === 'android' || p === 'ios' || p === 'multi';
}

// Rótulo amigável para exibição.
export function platformLabel(platform: string | null | undefined): string {
    switch ((platform || '').toLowerCase()) {
        case 'web': return 'Web';
        case 'android': return 'Android';
        case 'ios': return 'iOS';
        case 'multi': return 'Multi-plataforma';
        default: return platform || '—';
    }
}
