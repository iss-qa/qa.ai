-- =====================================================
-- QAMind — Migration: raw_yaml em test_cases
-- A coluna steps[] guarda os passos estruturados (usados pelo editor
-- de passos e pela dashboard), mas perde comentarios e formatacao
-- original quando o YAML eh re-parseado.
--
-- raw_yaml mantem o conteudo exato do arquivo escrito no workspace
-- pelo Maestro Studio, preservando comentarios `#`, ordem de campos
-- e espacamento. Quando o teste eh re-aberto no Studio, usamos
-- raw_yaml como fonte; quando inexistente, regeneramos a partir de
-- steps[] (perde comentarios — limitacao conhecida).
--
-- Executar no SQL Editor do Supabase Dashboard. Idempotente.
-- =====================================================

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS raw_yaml TEXT;

COMMENT ON COLUMN test_cases.raw_yaml IS
    'Conteudo exato do YAML como salvo pelo Maestro Studio. Preserva comentarios e formatacao que steps[] descarta.';
