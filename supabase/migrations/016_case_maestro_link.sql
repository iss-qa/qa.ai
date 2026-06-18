-- =====================================================
-- QAMind — Migration: vínculo Maestro por CASO de teste
--
-- O tipo do caso (manual/automatizado) e o vínculo com um teste Maestro
-- passam a viver no próprio caso (qa_journey_cases), não no sub-fluxo.
-- Automatizado = caso COM test_case_id; sem vínculo = manual.
--
-- Executar no SQL Editor do Supabase Dashboard.
-- =====================================================

ALTER TABLE qa_journey_cases
    ADD COLUMN IF NOT EXISTS test_case_id UUID
    REFERENCES test_cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qa_cases_test_case
    ON qa_journey_cases(test_case_id);

COMMENT ON COLUMN qa_journey_cases.test_case_id IS
    'Teste Maestro vinculado a este caso. Preenchido = caso automatizado; NULL = manual.';
