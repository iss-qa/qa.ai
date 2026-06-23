-- Reverte 023: volta o CHECK de provider ao estado do 012 (sem 'github').
-- ATENÇÃO: falha se já existir alguma linha com provider='github'.

ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS org_integrations_provider_check;

ALTER TABLE org_integrations
    ADD CONSTRAINT org_integrations_provider_check
    CHECK (provider IN ('google_sheets', 'jira', 'slack', 'google_drive'));
