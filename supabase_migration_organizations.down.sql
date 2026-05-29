-- =====================================================
-- QAMind — Migration DOWN: Organizations + Integrations
-- Reverte tudo que supabase_migration_organizations.sql criou.
-- ATENCAO: dropar org_integrations APAGA todas as credenciais
-- cifradas (Google Sheets, Jira, etc) - usuarios precisarao
-- reconfigurar em /dashboard/settings/integrations.
-- =====================================================

-- 1. Triggers
DROP TRIGGER IF EXISTS org_integrations_updated_at ON org_integrations;
DROP TRIGGER IF EXISTS organizations_updated_at    ON organizations;
DROP FUNCTION IF EXISTS orgs_set_updated_at();

-- 2. Indices
DROP INDEX IF EXISTS idx_org_integrations_org;
DROP INDEX IF EXISTS idx_org_memberships_org;
DROP INDEX IF EXISTS idx_org_memberships_user;

-- 3. Tabelas (ordem reversa por FK)
DROP TABLE IF EXISTS org_integrations CASCADE;
DROP TABLE IF EXISTS org_memberships  CASCADE;
DROP TABLE IF EXISTS organizations    CASCADE;
