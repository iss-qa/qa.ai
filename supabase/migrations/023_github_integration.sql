-- 023: provider 'github' em org_integrations.
--
-- Projetos da plataforma Web rodam testes Playwright num repositório GitHub
-- próprio (foxbit-group), disparados via GitHub Actions (workflow_dispatch).
-- O token é guardado por organização (cifrado, AES-256-GCM) como os demais
-- providers. Escopos esperados: actions:write (disparar workflow) +
-- contents:read (listar specs via Git Trees API).
--
-- Segue o padrão do 012: dropa e recria o CHECK de provider.
-- Executar no SQL Editor do Supabase Dashboard.

ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS org_integrations_provider_check;

ALTER TABLE org_integrations
    ADD CONSTRAINT org_integrations_provider_check
    CHECK (provider IN ('google_sheets', 'jira', 'slack', 'google_drive', 'github'));
