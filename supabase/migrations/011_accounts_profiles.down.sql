-- =====================================================
-- QAMind — Rollback: Contas, Perfis e Organizações (011)
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;

DROP POLICY IF EXISTS "Profiles: read own and same org" ON profiles;
DROP POLICY IF EXISTS "Profiles: update own"            ON profiles;
DROP POLICY IF EXISTS "Service role full access"        ON profiles;

DROP POLICY IF EXISTS "Orgs: public read"   ON organizations;
DROP POLICY IF EXISTS "Orgs: admins update" ON organizations;
DROP POLICY IF EXISTS "Orgs: master insert" ON organizations;
DROP POLICY IF EXISTS "Orgs: master delete" ON organizations;

DROP POLICY IF EXISTS "Memberships: read same org"     ON org_memberships;
DROP POLICY IF EXISTS "Memberships: org admins manage" ON org_memberships;

-- Restaura políticas permissivas da 007
CREATE POLICY "Allow all for authenticated" ON organizations   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON org_memberships FOR ALL USING (true) WITH CHECK (true);

DROP FUNCTION IF EXISTS public.shares_org_with(UUID);
DROP FUNCTION IF EXISTS public.is_org_member(UUID);
DROP FUNCTION IF EXISTS public.is_org_admin(UUID);
DROP FUNCTION IF EXISTS public.is_master_admin();
DROP FUNCTION IF EXISTS public.org_slugify(TEXT);

DROP TABLE IF EXISTS profiles;

ALTER TABLE organizations DROP COLUMN IF EXISTS cnpj;
ALTER TABLE organizations DROP COLUMN IF EXISTS address;
ALTER TABLE organizations DROP COLUMN IF EXISTS website;
ALTER TABLE organizations DROP COLUMN IF EXISTS contact_email;
ALTER TABLE organizations DROP COLUMN IF EXISTS description;
ALTER TABLE organizations DROP COLUMN IF EXISTS logo_url;
