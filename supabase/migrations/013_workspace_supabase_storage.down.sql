-- =====================================================
-- Down: 013_workspace_supabase_storage
-- =====================================================

DROP POLICY IF EXISTS "workspaces auth read"   ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth insert" ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth update" ON storage.objects;
DROP POLICY IF EXISTS "workspaces auth delete" ON storage.objects;

-- Remove objetos do bucket antes de apaga-lo (storage exige bucket vazio).
DELETE FROM storage.objects WHERE bucket_id = 'workspaces';
DELETE FROM storage.buckets WHERE id = 'workspaces';

-- Volta workspace_type ao conjunto do 012.
UPDATE projects SET workspace_type = 'local' WHERE workspace_type = 'supabase';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_workspace_type_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_workspace_type_check
    CHECK (workspace_type IN ('local', 'gdrive'));
