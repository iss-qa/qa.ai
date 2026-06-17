-- =====================================================
-- QAMind — Migration: Workspace no Google Drive
--
-- Habilita workspace de testes na nuvem (Google Drive) alem do
-- workspace local (daemon). Cada projeto escolhe o tipo:
--   - 'local'  -> usa workspace_path (pasta local via daemon), comportamento atual
--   - 'gdrive' -> usa workspace_drive_folder_id (pasta num Shared Drive via api)
--
-- Tambem adiciona o provider 'google_drive' (e regulariza 'slack') no
-- CHECK de org_integrations, para guardar a service account + ID do
-- Shared Drive cifrados, no mesmo padrao das outras integracoes.
--
-- Executar no SQL Editor do Supabase Dashboard apos 011_accounts_profiles.sql.
-- =====================================================

-- =====================================================
-- 1. Tipo de workspace por projeto
-- =====================================================

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'local'
    CHECK (workspace_type IN ('local', 'gdrive'));

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS workspace_drive_folder_id TEXT;

COMMENT ON COLUMN projects.workspace_type IS
    'Onde os YAMLs do projeto vivem: ''local'' (pasta via daemon, usa workspace_path) ou ''gdrive'' (pasta num Shared Drive, usa workspace_drive_folder_id).';
COMMENT ON COLUMN projects.workspace_drive_folder_id IS
    'ID da pasta no Google Shared Drive onde os YAMLs sao gravados quando workspace_type = ''gdrive''.';

-- =====================================================
-- 2. Providers de integracao: regulariza o CHECK
-- O 007 criou apenas ('google_sheets','jira'); 'slack' ja e usado pelo
-- codigo. Recriamos o constraint com todos + 'google_drive'.
-- =====================================================

ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS org_integrations_provider_check;

ALTER TABLE org_integrations
    ADD CONSTRAINT org_integrations_provider_check
    CHECK (provider IN ('google_sheets', 'jira', 'slack', 'google_drive'));
