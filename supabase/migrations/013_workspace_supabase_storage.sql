-- =====================================================
-- QAMind — Migration: Workspace via Supabase Storage
--
-- Alternativa ao Google Drive (que exige GCP/Drive API/InfoSec). Aqui o
-- workspace na nuvem vive num bucket do proprio Supabase. Cada projeto usa
-- um prefixo = o proprio id do projeto:  workspaces/{project_id}/{arquivo}.yaml
--
-- Adiciona 'supabase' ao CHECK de projects.workspace_type (criado em 012),
-- cria o bucket privado 'workspaces' e policies de acesso para usuarios
-- autenticados (mesmo padrao permissivo das demais tabelas).
--
-- Executar no SQL Editor do Supabase Dashboard apos 012_workspace_drive.sql.
-- =====================================================

-- =====================================================
-- 1. Permite workspace_type = 'supabase'
-- =====================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_workspace_type_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_workspace_type_check
    CHECK (workspace_type IN ('local', 'gdrive', 'supabase'));

-- =====================================================
-- 2. Bucket privado para os YAMLs de teste
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('workspaces', 'workspaces', false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 3. Policies de acesso (usuarios autenticados)
-- Segue o padrao permissivo das outras tabelas do projeto. Quando auth
-- multi-org existir, restringir por org/projeto no path.
-- =====================================================

DROP POLICY IF EXISTS "workspaces auth read"   ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth insert" ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth update" ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth delete" ON storage.objects;

CREATE POLICY "workspaces auth read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'workspaces');
CREATE POLICY "workspaces auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'workspaces');
CREATE POLICY "workspaces auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'workspaces') WITH CHECK (bucket_id = 'workspaces');
CREATE POLICY "workspaces auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'workspaces');
