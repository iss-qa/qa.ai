-- =====================================================
-- QAMind — Migration: modo de escrita do CASO de teste
--
-- O caso passa a ter dois modos de escrita:
--   • traditional  → título, descrição, resumo dos passos, resultado esperado
--   • gherkin      → funcionalidade (título) + cenário Gherkin colado
--
-- Colunas novas:
--   writing_mode  → discrimina o modo ('traditional' | 'gherkin')
--   description   → descrição livre do caso (modo tradicional)
--   gherkin       → texto do cenário Gherkin (modo gherkin)
--
-- Executar no SQL Editor do Supabase Dashboard.
-- =====================================================

ALTER TABLE qa_journey_cases
    ADD COLUMN IF NOT EXISTS writing_mode TEXT NOT NULL DEFAULT 'traditional',
    ADD COLUMN IF NOT EXISTS description  TEXT,
    ADD COLUMN IF NOT EXISTS gherkin      TEXT;

COMMENT ON COLUMN qa_journey_cases.writing_mode IS
    'Modo de escrita do caso: traditional (step-by-step) ou gherkin.';
COMMENT ON COLUMN qa_journey_cases.description IS
    'Descrição livre do caso (modo tradicional).';
COMMENT ON COLUMN qa_journey_cases.gherkin IS
    'Cenário Gherkin colado pelo usuário (modo gherkin).';
