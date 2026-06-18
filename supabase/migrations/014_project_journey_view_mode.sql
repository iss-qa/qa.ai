-- =====================================================
-- QAMind — Migration: modo de visualização das Jornadas por projeto
--
-- Projetos grandes (com muitas jornadas: Autenticação, Cadastro, Carrinho,
-- KYC, Suporte...) deixam o mapa único poluído. Esta coluna permite que o
-- PO escolha, por projeto, entre:
--   'single' -> mapa único com TODAS as jornadas (comportamento atual / default)
--   'cards'  -> hub de cards: um card GOLD "Todas as jornadas" (mapa completo)
--               + um card por jornada (abre só aquela jornada)
--
-- A "jornada principal" é a view sintética "Todas as jornadas" (o mapa
-- completo) — não é uma linha em qa_journeys. Toda jornada nova do projeto
-- aparece nela automaticamente (já que pertence ao project_id).
--
-- Executar no SQL Editor do Supabase Dashboard.
-- =====================================================

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS journey_view_mode TEXT NOT NULL DEFAULT 'single';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_journey_view_mode_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_journey_view_mode_check
    CHECK (journey_view_mode IN ('single', 'cards'));

COMMENT ON COLUMN projects.journey_view_mode IS
    'Como as jornadas do projeto são exibidas em /dashboard/qa-journey: ''single'' (mapa único com todas) ou ''cards'' (hub de cards por jornada + card GOLD "Todas as jornadas").';
