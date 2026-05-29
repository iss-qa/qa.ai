-- =====================================================
-- QAMind — Migration: QA Journey (Mapa Mental Executivo)
-- Tabelas para a feature "Jornada do QA" (Parte 9 do projeto).
--
-- Etapa 9.1: schema + admin CRUD basico.
-- Etapas 9.2 (Google Sheets sync) e 9.4 (Jira) ja tem suas
-- tabelas declaradas aqui para evitar migrations encadeadas.
--
-- Executar no SQL Editor do Supabase Dashboard apos as
-- migrations anteriores (supabase_setup.sql + as 4 incrementais).
-- =====================================================

-- =====================================================
-- 1. Tabelas principais (Nivel 1 / 2 / 3 da Jornada)
-- =====================================================

-- 1.1 Jornadas (Nivel 1: blocos macro tipo "Autenticacao", "Checkout")
CREATE TABLE IF NOT EXISTS qa_journeys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,                            -- ex: "autenticacao"
    title           TEXT NOT NULL,
    description     TEXT,
    icon            TEXT,                                     -- nome do icone lucide (ex: "Lock")
    color           TEXT DEFAULT '#7c3aed',                   -- cor do no no mapa
    sequence        INTEGER NOT NULL DEFAULT 0,
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,           -- admin controla visibilidade
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_journeys_project_slug_unique UNIQUE (project_id, slug)
);

-- 1.2 Sub-fluxos (Nivel 2: "Login com sucesso", "Recuperar senha")
CREATE TABLE IF NOT EXISTS qa_journey_subflows (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id          UUID NOT NULL REFERENCES qa_journeys(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    sequence            INTEGER NOT NULL DEFAULT 0,
    automation_status   TEXT NOT NULL DEFAULT 'manual'
                        CHECK (automation_status IN ('automated', 'partial', 'manual', 'none')),
    test_case_id        UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    -- Reservado para Etapa 9.4 (Jira) - JQL adicional do sub-fluxo
    jira_query          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 Casos de teste (Nivel 3: detalhe - espelha linha da planilha)
CREATE TABLE IF NOT EXISTS qa_journey_cases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subflow_id          UUID NOT NULL REFERENCES qa_journey_subflows(id) ON DELETE CASCADE,
    external_id         TEXT,                                 -- ID na planilha (ex: "CT-0142")
    title               TEXT NOT NULL,
    steps_summary       TEXT,                                 -- resumo em linguagem de negocio
    expected_result     TEXT,
    priority            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    last_run_status     TEXT,                                 -- pass | fail | skipped | not_run
    last_run_at         TIMESTAMPTZ,
    -- Quando o caso some da planilha em um sync, marca-se aqui em vez de DELETE
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. Tabelas de suporte (Etapas 9.2 / 9.4 / 9.5)
-- Declaradas aqui mas usadas nas etapas seguintes.
-- =====================================================

-- 2.1 Historico de syncs (auditoria de Google Sheets / Jira / manual)
CREATE TABLE IF NOT EXISTS qa_journey_syncs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source          TEXT NOT NULL CHECK (source IN ('google_sheets', 'jira', 'manual')),
    source_ref      TEXT,                                     -- spreadsheet_id ou jql
    status          TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
    rows_imported   INTEGER NOT NULL DEFAULT 0,
    rows_updated    INTEGER NOT NULL DEFAULT 0,
    rows_skipped    INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);

-- 2.2 Cache de issues Jira (refresh periodico, nao fonte de verdade)
CREATE TABLE IF NOT EXISTS qa_journey_jira_cache (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subflow_id          UUID NOT NULL REFERENCES qa_journey_subflows(id) ON DELETE CASCADE,
    jira_project_key    TEXT,                                 -- "FOXBIT-MOBILE"
    jira_key            TEXT NOT NULL,                        -- "FOXBIT-1234"
    issue_type          TEXT,                                 -- Bug | Task | Story
    status              TEXT,
    priority            TEXT,
    summary             TEXT,
    url                 TEXT,
    updated_at_jira     TIMESTAMPTZ,
    cached_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_jira_cache_subflow_key_unique UNIQUE (subflow_id, jira_key)
);

-- 2.3 Configuracao de mapeamento Google Sheets por projeto (Etapa 9.2)
CREATE TABLE IF NOT EXISTS qa_journey_sheet_configs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spreadsheet_id      TEXT NOT NULL,
    sheet_name          TEXT NOT NULL,
    header_row          INTEGER NOT NULL DEFAULT 1,
    data_start_row      INTEGER NOT NULL DEFAULT 2,
    column_map          JSONB NOT NULL DEFAULT '{}'::jsonb,
    defaults            JSONB NOT NULL DEFAULT '{}'::jsonb,
    transforms          JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_sheet_configs_unique UNIQUE (project_id, spreadsheet_id, sheet_name)
);

-- 2.4 Vinculacao N:N projeto QAMind <-> projetos Jira (Etapa 9.4)
CREATE TABLE IF NOT EXISTS qa_journey_jira_projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    jira_project_key    TEXT NOT NULL,                        -- "FOXBIT-MOBILE"
    display_name        TEXT,
    base_jql            TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_jira_projects_unique UNIQUE (project_id, jira_project_key)
);

-- 2.5 Snapshots semanais de KPIs (Etapa 9.5)
CREATE TABLE IF NOT EXISTS qa_journey_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_date       DATE NOT NULL,                        -- domingo da semana
    total_journeys      INTEGER NOT NULL DEFAULT 0,
    total_subflows      INTEGER NOT NULL DEFAULT 0,
    total_cases         INTEGER NOT NULL DEFAULT 0,
    automated_subflows  INTEGER NOT NULL DEFAULT 0,
    partial_subflows    INTEGER NOT NULL DEFAULT 0,
    manual_subflows     INTEGER NOT NULL DEFAULT 0,
    open_bugs_count     INTEGER NOT NULL DEFAULT 0,
    open_tasks_count    INTEGER NOT NULL DEFAULT 0,
    pass_rate_7d        NUMERIC(5, 2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_snapshots_unique UNIQUE (project_id, snapshot_date)
);

-- =====================================================
-- 3. Indices para queries comuns
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_qa_journeys_project    ON qa_journeys(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_journeys_published  ON qa_journeys(project_id, is_published);
CREATE INDEX IF NOT EXISTS idx_qa_subflows_journey    ON qa_journey_subflows(journey_id);
CREATE INDEX IF NOT EXISTS idx_qa_subflows_test_case  ON qa_journey_subflows(test_case_id);
CREATE INDEX IF NOT EXISTS idx_qa_cases_subflow       ON qa_journey_cases(subflow_id);
CREATE INDEX IF NOT EXISTS idx_qa_cases_external      ON qa_journey_cases(external_id);
CREATE INDEX IF NOT EXISTS idx_qa_syncs_project       ON qa_journey_syncs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_jira_cache_subflow  ON qa_journey_jira_cache(subflow_id);
CREATE INDEX IF NOT EXISTS idx_qa_snapshots_project   ON qa_journey_snapshots(project_id, snapshot_date DESC);

-- =====================================================
-- 4. RLS - mesmo padrao das outras tabelas QAMind
-- (permissivo para autenticados + service_role)
-- =====================================================

ALTER TABLE qa_journeys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_subflows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_cases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_syncs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_jira_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_sheet_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_jira_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_journey_snapshots     ENABLE ROW LEVEL SECURITY;

-- Drop antes de create (idempotente, Postgres nao tem CREATE POLICY IF NOT EXISTS)
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journeys;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_subflows;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_cases;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_syncs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_jira_cache;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_sheet_configs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_jira_projects;
DROP POLICY IF EXISTS "Allow all for authenticated" ON qa_journey_snapshots;

DROP POLICY IF EXISTS "Service role full access" ON qa_journeys;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_subflows;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_cases;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_syncs;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_jira_cache;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_sheet_configs;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_jira_projects;
DROP POLICY IF EXISTS "Service role full access" ON qa_journey_snapshots;

CREATE POLICY "Allow all for authenticated" ON qa_journeys              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_subflows      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_cases         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_syncs         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_jira_cache    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_sheet_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_jira_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON qa_journey_snapshots     FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON qa_journeys              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_subflows      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_cases         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_syncs         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_jira_cache    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_sheet_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_jira_projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON qa_journey_snapshots     FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 5. Triggers de updated_at (mantem coluna sincronizada)
-- =====================================================

CREATE OR REPLACE FUNCTION qa_journey_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qa_journeys_updated_at         ON qa_journeys;
DROP TRIGGER IF EXISTS qa_journey_subflows_updated_at ON qa_journey_subflows;
DROP TRIGGER IF EXISTS qa_journey_cases_updated_at    ON qa_journey_cases;

CREATE TRIGGER qa_journeys_updated_at
    BEFORE UPDATE ON qa_journeys
    FOR EACH ROW EXECUTE FUNCTION qa_journey_set_updated_at();

CREATE TRIGGER qa_journey_subflows_updated_at
    BEFORE UPDATE ON qa_journey_subflows
    FOR EACH ROW EXECUTE FUNCTION qa_journey_set_updated_at();

CREATE TRIGGER qa_journey_cases_updated_at
    BEFORE UPDATE ON qa_journey_cases
    FOR EACH ROW EXECUTE FUNCTION qa_journey_set_updated_at();
