-- =====================================================
-- QAMind — Migration DOWN: QA Journey
-- Reverte tudo que supabase_migration_qa_journey.sql criou.
-- ATENCAO: dropar essas tabelas APAGA todos os dados de jornadas,
-- sub-fluxos, casos, snapshots, syncs e cache Jira do QAMind.
-- =====================================================

-- 1. Triggers
DROP TRIGGER IF EXISTS qa_journey_cases_updated_at    ON qa_journey_cases;
DROP TRIGGER IF EXISTS qa_journey_subflows_updated_at ON qa_journey_subflows;
DROP TRIGGER IF EXISTS qa_journeys_updated_at         ON qa_journeys;
DROP FUNCTION IF EXISTS qa_journey_set_updated_at();

-- 2. Politicas (RLS continua ativo nas tabelas - dropar tabelas remove tudo)
-- Nao precisa dropar policies separadamente porque DROP TABLE cascateia.

-- 3. Indices (drop antes das tabelas para fail-safe; tambem cascateia)
DROP INDEX IF EXISTS idx_qa_snapshots_project;
DROP INDEX IF EXISTS idx_qa_jira_cache_subflow;
DROP INDEX IF EXISTS idx_qa_syncs_project;
DROP INDEX IF EXISTS idx_qa_cases_external;
DROP INDEX IF EXISTS idx_qa_cases_subflow;
DROP INDEX IF EXISTS idx_qa_subflows_test_case;
DROP INDEX IF EXISTS idx_qa_subflows_journey;
DROP INDEX IF EXISTS idx_qa_journeys_published;
DROP INDEX IF EXISTS idx_qa_journeys_project;

-- 4. Tabelas (ordem reversa por FK)
DROP TABLE IF EXISTS qa_journey_snapshots     CASCADE;
DROP TABLE IF EXISTS qa_journey_jira_projects CASCADE;
DROP TABLE IF EXISTS qa_journey_sheet_configs CASCADE;
DROP TABLE IF EXISTS qa_journey_jira_cache    CASCADE;
DROP TABLE IF EXISTS qa_journey_syncs         CASCADE;
DROP TABLE IF EXISTS qa_journey_cases         CASCADE;
DROP TABLE IF EXISTS qa_journey_subflows      CASCADE;
DROP TABLE IF EXISTS qa_journeys              CASCADE;
