-- =====================================================
-- QAMind — Migration: pastas de testes por projeto
--
-- Os testes (test_cases) passam a poder viver dentro de uma estrutura de
-- pastas, espelhando a organizacao local do usuario (ex.: tests/basic/...).
--
--   - test_cases.folder_path: caminho relativo da pasta que contem o teste.
--     NULL ou '' = raiz ("Testes do Projeto"). Ex.: 'tests', 'tests/basic'.
--   - test_folders: registra pastas (inclusive vazias), para que o usuario
--     possa criar uma pasta e importar testes dentro dela depois. A arvore
--     exibida na UI e a UNIAO de test_folders.path + folder_path distintos.
--
-- Executar no SQL Editor do Supabase Dashboard.
-- =====================================================

-- 1. Coluna de pasta no teste
ALTER TABLE test_cases
    ADD COLUMN IF NOT EXISTS folder_path TEXT;

CREATE INDEX IF NOT EXISTS idx_test_cases_folder
    ON test_cases(project_id, folder_path);

COMMENT ON COLUMN test_cases.folder_path IS
    'Pasta relativa do teste dentro do projeto (ex.: tests/basic). NULL/'''' = raiz.';

-- 2. Pastas do projeto (persiste pastas vazias criadas pelo usuario)
CREATE TABLE IF NOT EXISTS test_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_test_folders_project ON test_folders(project_id);

ALTER TABLE test_folders ENABLE ROW LEVEL SECURITY;

-- Mesmo padrao permissivo das demais tabelas (001_setup).
DROP POLICY IF EXISTS "Allow all for authenticated" ON test_folders;
DROP POLICY IF EXISTS "Service role full access" ON test_folders;
CREATE POLICY "Allow all for authenticated" ON test_folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON test_folders FOR ALL TO service_role USING (true) WITH CHECK (true);
