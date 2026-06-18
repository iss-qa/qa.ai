-- =====================================================
-- QAMind — Migration: subfluxos aninhados (árvore de subfluxos)
--
-- Permite subfluxo dentro de subfluxo. Um subfluxo com parent_subflow_id NULL
-- é raiz da jornada; com parent preenchido, é filho daquele subfluxo (mesma
-- jornada). ON DELETE CASCADE: apagar o pai apaga a subárvore.
--
-- Executar no SQL Editor do Supabase Dashboard.
-- =====================================================

ALTER TABLE qa_journey_subflows
    ADD COLUMN IF NOT EXISTS parent_subflow_id UUID
    REFERENCES qa_journey_subflows(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qa_subflows_parent
    ON qa_journey_subflows(parent_subflow_id);

COMMENT ON COLUMN qa_journey_subflows.parent_subflow_id IS
    'Subfluxo pai (mesma jornada). NULL = subfluxo raiz da jornada; preenchido = filho, formando a árvore de subfluxos.';
