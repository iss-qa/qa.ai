-- 024: testes Web (Playwright via GitHub Actions).
--
-- Projetos com platform='web' não usam Maestro/daemon. Os testes vivem num
-- repositório GitHub e rodam via workflow_dispatch (GitHub Actions). O QA
-- aperta "Play" no QAMind → a API dispara o workflow → o CI faz POST do
-- report JSON do Playwright de volta para o QAMind (endpoint de ingestão).
--
-- Três tabelas:
--   web_test_configs  — binding 1:1 projeto ⇄ repositório/workflow (+ token de ingestão).
--   web_test_runs     — uma linha por execução (run-level).
--   web_test_results  — uma linha por teste dentro do run.
--
-- O token de ingestão é guardado só como HASH (sha-256). O valor em claro é
-- retornado uma única vez na criação (para colar como secret no repo) e nunca
-- mais. Por isso web_test_configs bloqueia leitura do cliente (só service_role,
-- via API Fastify), no mesmo espírito de org_integrations.
--
-- Executar no SQL Editor do Supabase Dashboard.

-- =====================================================
-- 1. Config por projeto (repo + workflow + token ingestão)
-- =====================================================
CREATE TABLE IF NOT EXISTS web_test_configs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repo_owner        TEXT NOT NULL,                 -- ex.: 'foxbit-group'
    repo_name         TEXT NOT NULL,                 -- ex.: 'playwright-poc'
    default_branch    TEXT NOT NULL DEFAULT 'main',
    workflow_file     TEXT NOT NULL,                 -- ex.: 'playwright.yml' (alvo do workflow_dispatch)
    specs_path        TEXT NOT NULL DEFAULT 'tests', -- pasta onde estão os *.spec.ts (listagem)
    ingest_token_hash TEXT,                          -- sha-256 do token de ingestão (segredo nunca volta em claro)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT web_test_configs_project_unique UNIQUE (project_id)
);

-- =====================================================
-- 2. Execução (run-level)
-- =====================================================
CREATE TABLE IF NOT EXISTS web_test_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'running', 'passed', 'failed', 'error', 'cancelled')),
    trigger       TEXT NOT NULL DEFAULT 'manual',    -- 'manual' | 'cron' | 'ci'
    branch        TEXT,
    spec          TEXT,                               -- spec/filtro disparado (NULL = suite inteira)
    commit_sha    TEXT,
    gh_run_id     BIGINT,                             -- id do workflow run no GitHub (linkar/polling)
    gh_run_url    TEXT,
    total         INTEGER NOT NULL DEFAULT 0,
    passed        INTEGER NOT NULL DEFAULT 0,
    failed        INTEGER NOT NULL DEFAULT 0,
    skipped       INTEGER NOT NULL DEFAULT 0,
    flaky         INTEGER NOT NULL DEFAULT 0,
    duration_ms   BIGINT,
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. Resultado por teste
-- =====================================================
CREATE TABLE IF NOT EXISTS web_test_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID NOT NULL REFERENCES web_test_runs(id) ON DELETE CASCADE,
    spec_file           TEXT,                          -- ex.: 'tests/login.spec.ts'
    title               TEXT,                          -- título completo (project › describe › test)
    status              TEXT
                            CHECK (status IN ('passed', 'failed', 'skipped', 'flaky', 'timedOut', 'interrupted')),
    duration_ms         INTEGER,
    retries             INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, contentType, path|url}]
    qa_journey_case_id  UUID REFERENCES qa_journey_cases(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 4. Índices
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_web_test_configs_project ON web_test_configs(project_id);
CREATE INDEX IF NOT EXISTS idx_web_test_runs_project    ON web_test_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_test_runs_gh         ON web_test_runs(gh_run_id);
CREATE INDEX IF NOT EXISTS idx_web_test_results_run     ON web_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_web_test_results_case    ON web_test_results(qa_journey_case_id);

-- =====================================================
-- 5. RLS
-- web_test_configs guarda o hash do token de ingestão → só service_role
-- (acesso via API Fastify), como org_integrations. Runs/results são leitura
-- permissiva para authenticated (mesmo padrão de test_runs), permitindo
-- realtime/leitura direta no front; escrita real acontece via service_role.
-- =====================================================
ALTER TABLE web_test_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_test_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block client reads"          ON web_test_configs;
DROP POLICY IF EXISTS "Block client writes"         ON web_test_configs;
DROP POLICY IF EXISTS "Block client updates"        ON web_test_configs;
DROP POLICY IF EXISTS "Block client deletes"        ON web_test_configs;
DROP POLICY IF EXISTS "Service role full access"    ON web_test_configs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON web_test_runs;
DROP POLICY IF EXISTS "Service role full access"    ON web_test_runs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON web_test_results;
DROP POLICY IF EXISTS "Service role full access"    ON web_test_results;

CREATE POLICY "Block client reads"   ON web_test_configs FOR SELECT USING (false);
CREATE POLICY "Block client writes"  ON web_test_configs FOR INSERT WITH CHECK (false);
CREATE POLICY "Block client updates" ON web_test_configs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes" ON web_test_configs FOR DELETE USING (false);
CREATE POLICY "Service role full access" ON web_test_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON web_test_runs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access"    ON web_test_runs    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON web_test_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access"    ON web_test_results FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 6. updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION web_test_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS web_test_configs_updated_at ON web_test_configs;
CREATE TRIGGER web_test_configs_updated_at
    BEFORE UPDATE ON web_test_configs
    FOR EACH ROW EXECUTE FUNCTION web_test_set_updated_at();

COMMENT ON TABLE web_test_configs IS 'Binding projeto Web ⇄ repositório GitHub + workflow Playwright (token de ingestão só como hash).';
COMMENT ON TABLE web_test_runs    IS 'Execução de testes Web (Playwright via GitHub Actions). Uma linha por run.';
COMMENT ON TABLE web_test_results IS 'Resultado por teste dentro de um web_test_run (parseado do report JSON do Playwright).';
