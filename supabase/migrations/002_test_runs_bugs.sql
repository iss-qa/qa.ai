-- =====================================================
-- QAMind — Migration: test_runs + bug_reports
-- Adiciona historico de execucao e tabela de bugs para
-- alimentar o dashboard com dados reais (taxa de sucesso
-- por dia, duracao media, bugs por severidade).
--
-- Executar no SQL Editor do Supabase Dashboard apos o
-- supabase_setup.sql original.
-- =====================================================

-- 1. Tabela de execucoes (uma linha por Run Test)
CREATE TABLE IF NOT EXISTS test_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id    UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    status          TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'running', 'cancelled')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    duration_ms     INTEGER,
    device_udid     TEXT,
    error_message   TEXT,
    steps_total     INTEGER,
    steps_passed    INTEGER,
    steps_failed    INTEGER,
    triggered_by    TEXT DEFAULT 'editor', -- 'editor' | 'maestro_studio' | 'cli' | 'cron'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de bugs (defeitos detectados em runs ou manuais)
CREATE TABLE IF NOT EXISTS bug_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    test_case_id    UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    test_run_id     UUID REFERENCES test_runs(id) ON DELETE SET NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    title           TEXT NOT NULL,
    description     TEXT,
    screenshot_url  TEXT,
    attachment_url  TEXT,   -- arquivo anexo (qualquer link)
    pdf_url         TEXT,
    jira_url        TEXT,   -- link da issue no Jira/Linear
    source          TEXT DEFAULT 'manual', -- 'manual' | 'automation'
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

-- Se a tabela ja existir (migration parcial aplicada antes desta versao),
-- adicionar as colunas novas. Idempotente.
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS jira_url TEXT;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 3. Indices para as queries do dashboard
CREATE INDEX IF NOT EXISTS idx_test_runs_test_case ON test_runs(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status_started ON test_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_project ON bug_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);

-- 4. RLS habilitado + politicas abertas (mesmo padrao do setup original)
-- Idempotente: dropa antes de criar para suportar re-execucao.
-- Postgres nao tem CREATE POLICY IF NOT EXISTS (CREATE OR REPLACE tambem nao
-- existe para policy), entao DROP+CREATE eh o jeito canonico.
ALTER TABLE test_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON test_runs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON bug_reports;
DROP POLICY IF EXISTS "Service role full access"   ON test_runs;
DROP POLICY IF EXISTS "Service role full access"   ON bug_reports;

CREATE POLICY "Allow all for authenticated" ON test_runs   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON bug_reports FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON test_runs   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON bug_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
