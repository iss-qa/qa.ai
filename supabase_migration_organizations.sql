-- =====================================================
-- QAMind — Migration: Organizations + Integrations
-- Introduz multi-tenancy para preparar venda como SaaS.
--
-- Hoje todos os projects continuam soltos (sem org_id) ate
-- termos auth multi-org de verdade. Esta migration apenas
-- cria a estrutura e seed de 1 org default ("Foxbit") para
-- que as integracoes (Google Sheets / Jira) possam ser
-- configuradas por empresa.
--
-- Executar no SQL Editor do Supabase Dashboard apos a
-- supabase_migration_qa_journey.sql.
-- =====================================================

-- =====================================================
-- 1. Tabela organizations (workspaces / empresas)
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,                    -- usado em URLs/env (ex: "foxbit")
    name            TEXT NOT NULL,
    plan            TEXT NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. Vinculacao usuario <-> org (preparado para futuro)
-- Por enquanto so populamos quando auth multi-org existir.
-- =====================================================

CREATE TABLE IF NOT EXISTS org_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT org_memberships_unique UNIQUE (org_id, user_id)
);

-- =====================================================
-- 3. Integracoes externas por organizacao
-- credentials guardado encriptado (AES-256-GCM) no formato
-- "iv:authTag:ciphertext" base64 - decriptado no apps/api
-- usando INTEGRATIONS_ENCRYPTION_KEY do .env.
-- =====================================================

CREATE TABLE IF NOT EXISTS org_integrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL CHECK (provider IN ('google_sheets', 'jira')),
    -- payload encriptado opaco para o DB
    credentials_cipher  TEXT NOT NULL,
    -- metadados nao-sensiveis (mostrados na UI para identificar o que esta salvo)
    -- ex google_sheets: { "client_email": "...", "project_id": "..." }
    -- ex jira:          { "host": "foxbit.atlassian.net", "email": "..." }
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_tested_at      TIMESTAMPTZ,
    last_test_status    TEXT CHECK (last_test_status IN ('ok', 'error')),
    last_test_error     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT org_integrations_unique UNIQUE (org_id, provider)
);

-- =====================================================
-- 4. Seed da org default
-- (idempotente - so insere se nao existe)
-- =====================================================

INSERT INTO organizations (slug, name, plan)
VALUES ('foxbit', 'Foxbit', 'pro')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 5. Indices
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_org_memberships_user      ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org       ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_org      ON org_integrations(org_id);

-- =====================================================
-- 6. RLS - permissivo seguindo padrao das outras tabelas
-- =====================================================

ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON organizations;
DROP POLICY IF EXISTS "Allow all for authenticated" ON org_memberships;
DROP POLICY IF EXISTS "Allow all for authenticated" ON org_integrations;

DROP POLICY IF EXISTS "Service role full access" ON organizations;
DROP POLICY IF EXISTS "Service role full access" ON org_memberships;
DROP POLICY IF EXISTS "Service role full access" ON org_integrations;

CREATE POLICY "Allow all for authenticated" ON organizations    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON org_memberships  FOR ALL USING (true) WITH CHECK (true);

-- Importante: org_integrations contem creds (cifradas). Bloquear leitura
-- direta do cliente - so service_role pode ler/escrever. As rotas Fastify
-- usam service role e expoem apenas os metadados via API.
CREATE POLICY "Block client reads" ON org_integrations FOR SELECT USING (false);
CREATE POLICY "Block client writes" ON org_integrations FOR INSERT WITH CHECK (false);
CREATE POLICY "Block client updates" ON org_integrations FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes" ON org_integrations FOR DELETE USING (false);

CREATE POLICY "Service role full access" ON organizations    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON org_memberships  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON org_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 7. Triggers de updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION orgs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at    ON organizations;
DROP TRIGGER IF EXISTS org_integrations_updated_at ON org_integrations;

CREATE TRIGGER organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION orgs_set_updated_at();

CREATE TRIGGER org_integrations_updated_at
    BEFORE UPDATE ON org_integrations
    FOR EACH ROW EXECUTE FUNCTION orgs_set_updated_at();
