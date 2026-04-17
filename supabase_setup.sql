-- =====================================================
-- QAMind — Supabase Setup Script
-- Execute no SQL Editor do Supabase Dashboard
-- =====================================================

-- 1. Tabela de projetos
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    platform TEXT DEFAULT 'android',
    is_archived BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de casos de teste
CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    steps JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'idle',
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de resultados de execucao por passo
CREATE TABLE IF NOT EXISTS run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status TEXT DEFAULT 'idle',
    duration_ms INTEGER DEFAULT 0,
    screenshot_url TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indices para performance
CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_created ON test_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id);

-- 5. Desabilitar RLS (para simplificar o dev — service key ja bypassa)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_steps ENABLE ROW LEVEL SECURITY;

-- 6. Politicas permissivas (acesso total com chave autenticada)
CREATE POLICY "Allow all for authenticated" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON run_steps FOR ALL USING (true) WITH CHECK (true);

-- 7. Politicas para service role (daemon/api)
CREATE POLICY "Service role full access" ON projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON test_cases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON run_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', true) ON CONFLICT DO NOTHING;

-- 9. Storage policies (acesso publico para leitura)
CREATE POLICY "Public read screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'screenshots');
CREATE POLICY "Auth upload screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'screenshots');
CREATE POLICY "Public read reports" ON storage.objects FOR SELECT USING (bucket_id = 'reports');
CREATE POLICY "Auth upload reports" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'reports');

-- 10. Projeto inicial de exemplo
INSERT INTO projects (name, description, platform)
VALUES ('Foxbit Mobile', 'Testes automatizados do app Foxbit Android', 'android');
