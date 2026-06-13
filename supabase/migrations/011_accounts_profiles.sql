-- =====================================================
-- QAMind — Migration: Contas, Perfis e Organizações
-- (docs/prompts/parte-10-contas-organizacoes-landing.md)
--
-- 1. Tabela profiles (espelho público de auth.users)
-- 2. Campos públicos em organizations (cnpj, endereço...)
-- 3. Trigger handle_new_user: signup cria profile e
--    organização/membership conforme metadata do registro
-- 4. RLS: perfil próprio + mesma org; org editável por
--    owner/admin; admin master (is_master_admin) vê tudo
--
-- Executar no SQL Editor do Supabase Dashboard após a
-- 010_qa_journey_case_evidence.sql.
-- =====================================================

-- =====================================================
-- 1. Tabela profiles
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    full_name       TEXT NOT NULL DEFAULT '',
    funcao          TEXT,                       -- cargo: QA Engineer, QA Lead, PO, Dev...
    squad           TEXT,                       -- squad/time dentro da organização
    phone           TEXT,
    avatar_url      TEXT,
    is_master_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- =====================================================
-- 2. Campos públicos da organização
-- =====================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnpj          TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address       TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website       TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url      TEXT;

-- =====================================================
-- 3. Funções auxiliares
-- =====================================================

-- Slug a partir do nome ("Minha Empresa S.A." -> "minha-empresa-s-a"),
-- com sufixo numérico em caso de colisão.
CREATE OR REPLACE FUNCTION public.org_slugify(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    n INT := 0;
BEGIN
    base := lower(regexp_replace(unaccent(coalesce(p_name, 'org')), '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    IF base = '' THEN base := 'org'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate) LOOP
        n := n + 1;
        candidate := base || '-' || n::text;
    END LOOP;
    RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- unaccent pode não estar habilitado; garante a extensão.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- TRUE se o usuário autenticado é admin master.
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT p.is_master_admin FROM profiles p WHERE p.id = auth.uid()),
        FALSE
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- TRUE se o usuário autenticado é owner/admin da org informada.
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_memberships m
        WHERE m.org_id = p_org_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- TRUE se o usuário autenticado é membro da org informada.
-- SECURITY DEFINER: evita recursão de RLS quando usada em política
-- da própria org_memberships.
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_memberships m
        WHERE m.org_id = p_org_id AND m.user_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- TRUE se o usuário autenticado compartilha alguma org com p_user_id.
CREATE OR REPLACE FUNCTION public.shares_org_with(p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_memberships me
        JOIN org_memberships them ON them.org_id = me.org_id
        WHERE me.user_id = auth.uid() AND them.user_id = p_user_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- =====================================================
-- 4. Trigger de signup: cria profile + org/membership
--    a partir do raw_user_meta_data enviado no signUp().
--    Metadata esperado:
--      full_name, funcao, squad,
--      org_mode: 'create' | 'join',
--      org_name, org_cnpj, org_address, org_website (create)
--      org_id (join)
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_org_id UUID;
BEGIN
    INSERT INTO public.profiles (id, email, full_name, funcao, squad)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(meta->>'full_name', ''),
        NULLIF(meta->>'funcao', ''),
        NULLIF(meta->>'squad', '')
    )
    ON CONFLICT (id) DO NOTHING;

    -- A parte de organização nunca derruba o signup.
    BEGIN
        IF meta->>'org_mode' = 'create' AND NULLIF(meta->>'org_name', '') IS NOT NULL THEN
            INSERT INTO public.organizations (slug, name, plan, cnpj, address, website, contact_email)
            VALUES (
                public.org_slugify(meta->>'org_name'),
                meta->>'org_name',
                'free',
                NULLIF(meta->>'org_cnpj', ''),
                NULLIF(meta->>'org_address', ''),
                NULLIF(meta->>'org_website', ''),
                NEW.email
            )
            RETURNING id INTO v_org_id;

            INSERT INTO public.org_memberships (org_id, user_id, role)
            VALUES (v_org_id, NEW.id, 'owner')
            ON CONFLICT (org_id, user_id) DO NOTHING;

        ELSIF meta->>'org_mode' = 'join' AND NULLIF(meta->>'org_id', '') IS NOT NULL THEN
            SELECT id INTO v_org_id
            FROM public.organizations
            WHERE id = (meta->>'org_id')::uuid AND is_active;

            IF v_org_id IS NOT NULL THEN
                INSERT INTO public.org_memberships (org_id, user_id, role)
                VALUES (v_org_id, NEW.id, 'member')
                ON CONFLICT (org_id, user_id) DO NOTHING;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: falha ao vincular organização para % — %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 5. updated_at em profiles
-- =====================================================

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION orgs_set_updated_at();

-- =====================================================
-- 6. RLS
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles: read own and same org" ON profiles;
DROP POLICY IF EXISTS "Profiles: update own"            ON profiles;
DROP POLICY IF EXISTS "Profiles: master admin all"      ON profiles;
DROP POLICY IF EXISTS "Service role full access"        ON profiles;

-- Ler o próprio perfil, perfis da mesma organização, ou tudo se master.
CREATE POLICY "Profiles: read own and same org" ON profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.is_master_admin()
        OR public.shares_org_with(id)
    );

-- Atualizar apenas o próprio perfil (master pode todos). O flag
-- is_master_admin só muda via service role / SQL direto.
CREATE POLICY "Profiles: update own" ON profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_master_admin())
    WITH CHECK (
        (id = auth.uid() AND is_master_admin = (SELECT p.is_master_admin FROM profiles p WHERE p.id = auth.uid()))
        OR public.is_master_admin()
    );

CREATE POLICY "Service role full access" ON profiles FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- organizations: substitui a política permissiva da 007 por papéis.
DROP POLICY IF EXISTS "Allow all for authenticated" ON organizations;
DROP POLICY IF EXISTS "Orgs: public read"           ON organizations;
DROP POLICY IF EXISTS "Orgs: admins update"         ON organizations;
DROP POLICY IF EXISTS "Orgs: master insert"         ON organizations;
DROP POLICY IF EXISTS "Orgs: master delete"         ON organizations;

-- Campos da org são públicos (o /register lista orgs ativas para o "join").
CREATE POLICY "Orgs: public read" ON organizations FOR SELECT
    USING (true);

CREATE POLICY "Orgs: admins update" ON organizations FOR UPDATE TO authenticated
    USING (public.is_org_admin(id) OR public.is_master_admin())
    WITH CHECK (public.is_org_admin(id) OR public.is_master_admin());

CREATE POLICY "Orgs: master insert" ON organizations FOR INSERT TO authenticated
    WITH CHECK (public.is_master_admin());

CREATE POLICY "Orgs: master delete" ON organizations FOR DELETE TO authenticated
    USING (public.is_master_admin());

-- org_memberships: leitura pela própria org; escrita por admins da org/master.
DROP POLICY IF EXISTS "Allow all for authenticated"      ON org_memberships;
DROP POLICY IF EXISTS "Memberships: read same org"       ON org_memberships;
DROP POLICY IF EXISTS "Memberships: org admins manage"   ON org_memberships;

CREATE POLICY "Memberships: read same org" ON org_memberships FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_master_admin()
        OR public.is_org_member(org_id)
    );

CREATE POLICY "Memberships: org admins manage" ON org_memberships FOR ALL TO authenticated
    USING (public.is_org_admin(org_id) OR public.is_master_admin())
    WITH CHECK (public.is_org_admin(org_id) OR public.is_master_admin());

-- =====================================================
-- 7. Backfill: usuários já existentes em auth.users
-- =====================================================

INSERT INTO profiles (id, email, full_name)
SELECT u.id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 8. Admin master da instalação
-- Ajuste o e-mail conforme o operador do QAMind.
-- =====================================================

UPDATE profiles SET is_master_admin = TRUE
WHERE email = 'isaias.silva@foxbit.com.br';
