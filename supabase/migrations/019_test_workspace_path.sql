-- 019: caminho exato do arquivo do teste dentro do workspace.
--
-- Um flow Maestro com runFlow/runScript referencia outros arquivos por caminho
-- RELATIVO, resolvidos no disco a partir da pasta do .yaml em execução. Para
-- materializar a árvore e rodar o flow no local CORRETO (aninhado), precisamos
-- saber o caminho exato do arquivo — incluindo o basename original, que pode
-- diferir do `name` (display) e da pasta `folder_path`.
--
-- Ex.: workspace_path = 'tests/home/inicio.yaml'. NULL = derivar de
-- folder_path + nome sanitizado (compatibilidade com tests antigos).

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS workspace_path TEXT;

COMMENT ON COLUMN test_cases.workspace_path IS
    'Caminho relativo exato do arquivo no workspace (ex.: tests/home/inicio.yaml). '
    'Usado para materializar a árvore e resolver runFlow/runScript na execução.';
