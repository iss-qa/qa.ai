---
name: project-gdrive-workspace
description: Cloud workspace de testes — PIVOTOU p/ Supabase Storage (migration 013); Google Drive (012) ficou dormente por bloqueio de InfoSec/GCP
metadata:
  type: project
---

**ATUALIZAÇÃO 2026-06-17: workspace na nuvem = Supabase Storage. O código do Google Drive foi REMOVIDO** (não só dormente) a pedido do usuário, pra não poluir — habilitar a Drive API dependia do GCP/InfoSec, que o usuário não acessa. Deletados: `apps/api/src/services/google-drive.ts`, `apps/api/src/routes/workspace.ts`, `components/settings/{GoogleDriveIntegrationModal,DriveFolderPicker}.tsx`, e todas as refs a `google_drive`/`gdrive` em org-integrations, integrations route, types, lib/integrations/api, settings page, lib/workspace, SaveRecordingModal, projects page, editor. Se reviver, recuperar do histórico git.

**Vestígios no banco (migration 012, já aplicada em PRD):** coluna `projects.workspace_drive_folder_id`, valor `'gdrive'` no CHECK de `projects.workspace_type`, e `'google_drive'` no CHECK de `org_integrations.provider` — ficaram órfãos mas inofensivos. Limpeza opcional via uma migration 014 futura.

**Supabase Storage (migration `013_workspace_supabase_storage.sql`):** `workspace_type='supabase'`; bucket privado `workspaces`; path = `{project_id}/{arquivo}.yaml`; policies para role `authenticated` (padrão permissivo). Sem service account, sem folder picker, sem InfoSec — o front grava direto via `supabase.storage` (client já existente). Toggle no Novo Projeto agora é **Local / Nuvem (Supabase)**.

Workspace de testes na nuvem, alternativa ao workspace local (daemon). Iniciado 2026-06-17. Modelo **híbrido**: `projects.workspace_type` ('local' | 'supabase'; 'gdrive' órfão). Dispatcher `writeYaml/readYaml` em `lib/workspace.ts` roteia (local=daemon, supabase=Storage).

**Pontos de escrita no Storage (projeto Nuvem) — 3 caminhos cobrem criação/edição de teste:**
1. Gravação: `tests/editor` `handleSaveRecording` → `writeYaml(ref)`.
2. Studio "Salvar como Teste": `projects/[id]` `confirmSaveAsTest` → mirror.
3. Studio save/autosave (Ctrl+S): `projects/[id]` handler `qamind:file-saved` → mirror (usa `projectRef` p/ evitar closure stale).
Obs: Maestro Studio é local-only (fala com `localhost:8001`/daemon+device); só roda local. Save manual do editor de steps (`editor-persistence.saveTestCase`) NÃO escreve arquivo — grava só `steps` e zera `raw_yaml` (regenera depois); comportamento original mantido.

Decisões não-óbvias:
- **Service account + Shared Drive (obrigatório, não "Meu Drive").** Service account não tem quota de storage própria — gravar em pasta do Meu Drive falha com "service accounts do not have storage quota". Só funciona num **Shared Drive** (storage pertence ao drive). Foxbit precisa de Workspace Business Standard+ (Business Starter NÃO tem Shared Drives). Conta pessoal está fora por política (Drive pessoal = destino bloqueado).
- **Escopo `drive` completo, não `drive.file`** — precisamos enxergar/gravar em pasta pré-existente escolhida pelo usuário, que `drive.file` não vê.
- Reusa a infra do Google Sheets: mesma service account cifrada em `org_integrations` (provider `google_drive`), `encryption.ts`, padrão de rotas.
- I/O roteado por `lib/workspace.ts` → `writeYaml(ref)` / `readYaml(ref)` despacha daemon (local) ou api `/workspace/*` (drive). Backend Drive em `apps/api/src/services/google-drive.ts` + `routes/workspace.ts`.

Pré-requisitos manuais (usuário): habilitar Google Drive API no GCP `teak-listener-473621-b8`; criar Shared Drive; adicionar service account `sheetgmail@...iam.gserviceaccount.com` como Gerente de conteúdo; aplicar migration 012.

**GAP pendente:** `projects/[id]` "abrir no Maestro Studio" e run em device local leem do disco — para projeto `gdrive` precisaria sincronizar Drive→pasta temp antes de executar (não implementado; amarrado ao item 1 = emulador web). Só o save de gravação (`SaveRecordingModal` → editor `handleSaveRecording`) foi roteado pro dispatcher. `EditProjectModal` em `projects/[id]/_components` ainda só tem campo local (não expõe gdrive). Ver [[project-qamind]].
