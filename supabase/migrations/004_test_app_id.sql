-- =====================================================
-- QAMind — Migration: app_id em test_cases
-- O appId estava hardcoded como 'br.com.foxbit.foxbitandroid' no editor,
-- entao qualquer teste executado abria o app Foxbit, mesmo quando o
-- teste pertencia a outro projeto/aplicativo.
-- Agora cada test_case guarda o appId do app que ele testa.
--
-- Executar no SQL Editor do Supabase Dashboard.
-- Idempotente.
-- =====================================================

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS app_id TEXT;

COMMENT ON COLUMN test_cases.app_id IS
    'Package name do app sob teste (ex.: com.android.vending, br.com.foxbit.foxbitandroid). Extraido do header appId: do YAML quando salvo via Salvar como Teste / Importar YAML.';
