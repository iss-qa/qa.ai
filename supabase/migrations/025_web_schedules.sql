-- 025: agendamento de testes Web (Playwright via GitHub Actions).
--
-- Segue o mesmo modelo de test_schedules (mobile), mas para projetos Web.
-- Em vez de device_udid, guarda branch e uma lista de specs (JSON).
-- O cron da API (apps/api/src/services/cron.ts) lê esta tabela e dispara
-- o workflow_dispatch no GitHub Actions conforme o schedule definido.
--
-- Executar no SQL Editor do Supabase Dashboard.

CREATE TABLE IF NOT EXISTS web_test_schedules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    -- specs a executar; array vazio = suite inteira.
    specs         JSONB NOT NULL DEFAULT '[]'::jsonb,
    branch        TEXT NOT NULL DEFAULT 'main',
    cron          TEXT NOT NULL,               -- ex.: "0 8 * * 1-5"
    timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_run_at   TIMESTAMPTZ,
    next_run_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_test_schedules_project ON web_test_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_web_test_schedules_active  ON web_test_schedules(is_active, next_run_at);

COMMENT ON TABLE web_test_schedules IS 'Agendamento (cron) de execução de testes Web via GitHub Actions workflow_dispatch.';

ALTER TABLE web_test_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON web_test_schedules;
DROP POLICY IF EXISTS "Service role full access"    ON web_test_schedules;

CREATE POLICY "Allow all for authenticated" ON web_test_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access"    ON web_test_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION web_schedule_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS web_test_schedules_updated_at ON web_test_schedules;
CREATE TRIGGER web_test_schedules_updated_at
    BEFORE UPDATE ON web_test_schedules
    FOR EACH ROW EXECUTE FUNCTION web_schedule_set_updated_at();
