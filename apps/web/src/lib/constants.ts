// Endpoint do daemon (Python, device local). Resolucao em camadas:
//   1. localStorage['qamind-daemon-url'] — override em runtime, definido pelo
//      usuario na pagina de Dispositivos (modo tunel/ngrok ou outra porta).
//   2. NEXT_PUBLIC_DAEMON_URL (build-time) — default do deploy.
//   3. http://localhost:8001 — fallback (dev local + web no MESMO PC do daemon;
//      navegadores tratam http://localhost como origem segura, então funciona
//      mesmo numa pagina HTTPS).
// Mantem localhost funcionando sem impacto: sem override, comporta-se como antes.
export const DAEMON_URL_STORAGE_KEY = 'qamind-daemon-url';

const DAEMON_BUILD_DEFAULT = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8001';

/** Resolve o endpoint do daemon AGORA (lê o override do localStorage a cada chamada). */
export function getDaemonUrl(): string {
    if (typeof window !== 'undefined') {
        try {
            const override = window.localStorage.getItem(DAEMON_URL_STORAGE_KEY);
            if (override && override.trim()) return override.trim().replace(/\/+$/, '');
        } catch {
            // localStorage indisponivel (SSR/sandbox) — cai no default.
        }
    }
    return DAEMON_BUILD_DEFAULT;
}

/** Persiste (ou limpa) o override do endpoint do daemon. */
export function setDaemonUrl(url: string | null): void {
    if (typeof window === 'undefined') return;
    try {
        const trimmed = (url || '').trim().replace(/\/+$/, '');
        if (trimmed) window.localStorage.setItem(DAEMON_URL_STORAGE_KEY, trimmed);
        else window.localStorage.removeItem(DAEMON_URL_STORAGE_KEY);
    } catch {
        // ignore
    }
}

// Valor resolvido no carregamento do modulo. Mantido para os call-sites que
// importam a const direto; para sempre pegar o override mais recente, prefira
// getDaemonUrl() no momento da chamada.
export const DAEMON_URL = getDaemonUrl();
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
