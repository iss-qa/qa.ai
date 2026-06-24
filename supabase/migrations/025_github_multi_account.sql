-- 025: múltiplas contas GitHub por organização.
--
-- Adiciona coluna 'name' (rótulo da conta, ex: "Pessoal", "Foxbit") e
-- substitui o unique constraint (org_id, provider) por (org_id, provider, name),
-- permitindo que o provider 'github' tenha múltiplos registros por org enquanto
-- os demais providers (google_sheets, jira, slack) continuam com name='' (default).
--
-- A coluna 'is_active' já existe: usada para desconectar sem excluir.
--
-- Executar no SQL Editor do Supabase Dashboard.

-- 1) Adiciona coluna name com default '' (vazio = slot único, como os outros providers)
ALTER TABLE org_integrations ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

-- 2) Remove o constraint único antigo
ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS org_integrations_unique;

-- 3) Novo constraint: (org_id, provider, name) — permite múltiplas contas github
--    desde que tenham nomes distintos. Para os demais providers name='' garante
--    que só existe um registro por provider por org.
ALTER TABLE org_integrations
    ADD CONSTRAINT org_integrations_unique UNIQUE (org_id, provider, name);
