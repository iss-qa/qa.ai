-- =====================================================
-- QAMind — Migration: workspace_path em projects
-- Cada projeto agora tem seu proprio diretorio de workspace
-- Maestro. Antes, o caminho era guardado num unico localStorage
-- global, entao abrir o Maestro Studio em qualquer projeto
-- carregava o workspace do ultimo projeto aberto.
--
-- Executar no SQL Editor do Supabase Dashboard.
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- =====================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_path TEXT;

COMMENT ON COLUMN projects.workspace_path IS
    'Diretorio local do workspace Maestro (path absoluto). Definido na primeira vez que o usuario abre o Maestro Studio para o projeto.';
