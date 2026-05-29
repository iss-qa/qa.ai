import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy client: nao falha no import-time se o env ainda nao carregou.
// Util porque o supabase eh transitivamente importado a partir de
// rotas/services antes do dotenv/config completar em alguns paths
// (e tambem para testes que mockam process.env).
let _supabase: SupabaseClient | null = null;

function build(): SupabaseClient {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url) throw new Error('SUPABASE_URL ausente em apps/api/.env');
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente em apps/api/.env');
    return createClient(url, key);
}

// Proxy: redireciona qualquer acesso para o client real (instanciado on-demand).
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        if (!_supabase) _supabase = build();
        const value = Reflect.get(_supabase as object, prop, receiver);
        return typeof value === 'function' ? value.bind(_supabase) : value;
    },
});
