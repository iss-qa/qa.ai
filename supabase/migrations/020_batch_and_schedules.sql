-- 020: execução em lote (suite) + agendamento.
--
-- Permite rodar vários testes de uma vez (sequencialmente) e agendar essa
-- execução. Reaproveita test_runs (1 linha por teste) — aqui só agrupamos.

-- Um lote = uma execução de N testes em sequência.
CREATE TABLE IF NOT EXISTS test_batch_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT,                       -- ex.: "basic/ (12 testes)"
    status        TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    triggered_by  TEXT DEFAULT 'manual',      -- 'manual' | 'schedule'
    device_udid   TEXT,
    total_tests   INTEGER NOT NULL DEFAULT 0,
    passed_tests  INTEGER NOT NULL DEFAULT 0,
    failed_tests  INTEGER NOT NULL DEFAULT 0,
    schedule_id   UUID,                        -- preenchido quando veio de agendamento
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    duration_ms   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agrupa as test_runs por lote (NULL = execução avulsa, como hoje).
ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS batch_run_id UUID
    REFERENCES test_batch_runs(id) ON DELETE SET NULL;

-- Agendamento de um lote: quais testes, qual device, qual cron.
CREATE TABLE IF NOT EXISTS test_schedules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    -- IDs dos test_cases selecionados (ordem = ordem de execução).
    test_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
    device_udid   TEXT,
    cron          TEXT NOT NULL,               -- ex.: "0 8 * * 1-5"
    timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_run_at   TIMESTAMPTZ,
    next_run_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_batch_runs_project ON test_batch_runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_batch ON test_runs(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_test_schedules_active ON test_schedules(is_active, next_run_at);

COMMENT ON TABLE test_batch_runs IS 'Execução em lote (suite) de vários testes em sequência.';
COMMENT ON TABLE test_schedules IS 'Agendamento (cron) de execução de lote — disparado pelo daemon local.';
