-- Alerta de automação + referência de teste Playwright (Web).
--
-- automation_alert_days: prazo (em dias) a partir da CRIAÇÃO do caso/sub-fluxo
--   para lembrar que ele deve ser automatizado. NULL = sem alerta. O sino de
--   notificações dispara quando created_at + N dias é atingido e o item ainda
--   está manual (sem teste vinculado).
--
-- Plataforma Web não usa Maestro: o caso guarda uma REFERÊNCIA ao teste
--   Playwright (pasta do projeto e/ou repositório git + arquivo/spec).
--   automation_engine = 'maestro' (test_case_id) | 'playwright' (refs abaixo).

ALTER TABLE qa_journey_cases
    ADD COLUMN IF NOT EXISTS automation_alert_days INTEGER,
    ADD COLUMN IF NOT EXISTS automation_engine TEXT,
    ADD COLUMN IF NOT EXISTS playwright_path TEXT,
    ADD COLUMN IF NOT EXISTS playwright_repo TEXT,
    ADD COLUMN IF NOT EXISTS playwright_spec TEXT;

COMMENT ON COLUMN qa_journey_cases.automation_alert_days IS
    'Prazo em dias (a partir de created_at) para alertar que o caso deve ser automatizado. NULL = sem alerta.';
COMMENT ON COLUMN qa_journey_cases.automation_engine IS
    'Motor de automação quando o caso é automatizado: maestro (test_case_id) ou playwright (refs).';

ALTER TABLE qa_journey_subflows
    ADD COLUMN IF NOT EXISTS automation_alert_days INTEGER;

COMMENT ON COLUMN qa_journey_subflows.automation_alert_days IS
    'Prazo em dias (a partir de created_at) para alertar que o sub-fluxo deve ser automatizado. NULL = sem alerta.';
