-- =====================================================
-- Down: 012_workspace_drive
-- =====================================================

-- Remove provider google_drive do CHECK (volta ao conjunto pre-012,
-- mantendo slack que ja era usado pelo codigo).
ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS org_integrations_provider_check;
DELETE FROM org_integrations WHERE provider = 'google_drive';
ALTER TABLE org_integrations
    ADD CONSTRAINT org_integrations_provider_check
    CHECK (provider IN ('google_sheets', 'jira', 'slack'));

ALTER TABLE projects DROP COLUMN IF EXISTS workspace_drive_folder_id;
ALTER TABLE projects DROP COLUMN IF EXISTS workspace_type;
