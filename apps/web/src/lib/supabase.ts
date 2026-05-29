import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy: nao instancia no import. Se as NEXT_PUBLIC_* faltarem no build,
// createClient() lancaria "supabaseUrl is required" no carregamento do modulo
// e derrubaria o server.js do Next no boot (container morre / "not started").
// Adiando para o primeiro uso, falhas viram erro claro em runtime, nao crash de boot.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (_client) return _client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error(
            'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes no bundle. ' +
            'Garanta que estao disponiveis como build-arg ao buildar o web.'
        );
    }
    _client = createClient(url, key);
    return _client;
}

// Proxy mantem a API existente (`supabase.from(...)`) sem instanciar no import.
export const supabase = new Proxy({} as SupabaseClient, {
    get(_t, prop, receiver) {
        const value = Reflect.get(getClient() as object, prop, receiver);
        return typeof value === 'function' ? value.bind(getClient()) : value;
    },
});
