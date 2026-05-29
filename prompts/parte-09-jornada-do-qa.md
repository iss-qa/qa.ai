# PARTE 9 — JORNADA DO QA (Mapa Mental Executivo)

> **Foco**: dar visibilidade executiva ao trabalho do QA, unificando planilhas (Google Sheets), automação Maestro e Jira em um mapa mental interativo estilo *Roadmap QE & IA*.
> **Duração estimada**: 3 semanas
> **Pré-requisitos**: Partes 1–7 concluídas (Supabase, Next.js dashboard, Recharts, integração de bugs com `jira_url`).

---

## STATUS DE IMPLEMENTAÇÃO (snapshot Mai/2026)

| Etapa | Status | Notas |
|---|---|---|
| 9.1 Schema + Admin CRUD | ✅ Implementada | Migration: `supabase_migration_qa_journey.sql` (8 tabelas, RLS). Páginas em `apps/web/src/app/dashboard/qa-journey/admin/`. |
| 9.2 Sync Google Sheets | ✅ Implementada | Service account configurado em `/dashboard/settings/integrations` (não em env). Wizard 5-passos. Cron diário 7h. |
| 9.3 Mapa mental interativo | ✅ Implementada | React Flow + dagre + **framer-motion AnimatePresence**. Foguete animado sobre nó focado. Export PNG. Modo fullscreen. |
| 9.4 Jira read-only | ⏳ **Adiada para PRD** | Schema pronto. UI de Settings → Integrações já aceita o token. Falta o service `jira-sync.ts` e o cron 4x/dia. |
| 9.5 Dashboard executivo | ✅ Implementada | `/dashboard/qa-journey/insights` com KPIs, treemap, timeline, gaps. Snapshot semanal domingo 23h. |
| **Bônus** Multi-tenant integrations | ✅ Implementada | Decisão tomada durante a Etapa 9.2 — credenciais por organização (criptografia AES-256-GCM), preparado para SaaS. Migration: `supabase_migration_organizations.sql`. |
| **Bônus** Vincular Maestro | ✅ Implementada | Modal "Vincular Maestro" no admin de jornada com sugestão de match por similaridade de nome. |
| **Bônus** `GET /qa-journey/tree/:projectId` | ✅ Implementada | Contrato estável (Seção 9 do prompt) para integrações externas / Parte 10 (IA). Retorna árvore aninhada `jornadas[].subflows[].cases[].jira_cache[]`. Query param `publishedOnly=true` filtra para o mapa público. |
| **Bônus** Migrations reversíveis | ✅ Implementada | `supabase_migration_qa_journey.down.sql` + `supabase_migration_organizations.down.sql` |
| **Bônus** README atualizado | ✅ Atualizado | Seção "Integrações externas" com passo-a-passo Google Sheets + Jira + ordem das migrations |

### Mudanças de arquitetura vs prompt original

1. **Multi-tenant desde o MVP**: o prompt previa "não fazer multi-tenancy". Durante a 9.2 a decisão foi pivotada — credenciais ficam em `org_integrations` cifradas com AES-256-GCM, key em `INTEGRATIONS_ENCRYPTION_KEY`. Habilita venda como SaaS.
2. **Settings → Integrações**: tela dedicada em `/dashboard/settings/integrations` substituiu o paradigma de env vars para Google Sheets e Jira.
3. **Tabelas antecipadas**: a migration 9.1 já criou as tabelas das etapas 9.2/9.4/9.5 (sheet_configs, jira_cache, jira_projects, snapshots) para evitar migrations encadeadas.
4. **9.4 (Jira) adiada**: integração real depende de organização cliente. Schema + UI de credenciais prontos; falta só `services/jira-sync.ts` + cron.

### Arquivos implementados — referência rápida

**Backend (`apps/api`)**:
- `routes/integrations.ts` — CRUD de credenciais por org + test connection
- `routes/qa-journey.ts` — sheet configs CRUD + sync + snapshots + history
- `services/encryption.ts` — AES-256-GCM
- `services/org-integrations.ts` — load/save/test creds
- `services/google-sheets.ts` — wrapper googleapis
- `services/qa-journey-sync.ts` — upsert idempotente (jornadas/subflows/cases)
- `services/qa-journey-snapshots.ts` — captura snapshot semanal
- `services/cron.ts` — sync diário 7h + snapshot domingo 23h

**Frontend (`apps/web`)**:
- `app/dashboard/qa-journey/page.tsx` — mapa público
- `app/dashboard/qa-journey/insights/page.tsx` — KPIs executivos
- `app/dashboard/qa-journey/admin/` — CRUD jornadas/subflows/cases + sheets + syncs
- `app/dashboard/settings/integrations/page.tsx` — credenciais Google/Jira
- `components/qa-journey/map/` — JourneyMap, JourneyNode, SubflowNode, SubflowDrawer, ParticleBackground
- `components/qa-journey/sheet-wizard/` — 5 steps do wizard
- `components/qa-journey/insights/` — KPICards, JourneyTreemap, CoverageTimeline, GapsTable

**Migrations aplicadas**:
- `supabase_migration_qa_journey.sql`
- `supabase_migration_organizations.sql`

**Env vars adicionadas**:
- `apps/api/.env`: `DEFAULT_ORG_SLUG`, `INTEGRATIONS_ENCRYPTION_KEY` (AES-256 base64, **nunca commitar/perder**)
- `apps/web/.env.local`: `NEXT_PUBLIC_API_URL`

---

## PROMPT ORIGINAL (mantido abaixo para histórico e como referência da Etapa 9.4)

---

## 1. CONTEXTO E PROBLEMA

Hoje o QA da Foxbit dispersa conhecimento entre:
- **Google Sheets** — casos de teste detalhados (planilhas longas, "buraco negro" para POs e liderança).
- **Outline** — documentação de cenários específicos.
- **Mapas mentais soltos** — fluxos importantes.
- **Slack + Jira** — comunicação e tracking de bugs.
- **QAMind** — execuções automatizadas (Maestro) e bug reports.

Com IA acelerando dev/PO/CTO escrevendo testes, o QA virou **funil de qualidade**: testes exaustivos, E2E, automação web/mobile, última camada antes do release. O gargalo deixou de ser *criar* teste — passou a ser **mostrar o que existe** para a organização.

**Solução**: nova área `/dashboard/qa-journey` que renderiza um **mapa mental progressivo** (Jornadas → Sub-fluxos → Casos → Detalhe técnico), alimentado por planilha (Google Sheets API) e enriquecido com status de automação (Maestro) e issues do Jira (read-only).

**Referência visual obrigatória**: https://roadmap-qe-ia.vercel.app/ — animações fluidas, layout dark, partículas/estrelas no fundo, divulgação progressiva, foguete percorrendo o caminho.

---

## 2. OBJETIVO DA PARTE 9

Entregar 5 etapas independentes mas encadeadas:

| Etapa | Entrega | Tempo |
|-------|---------|-------|
| 9.1 | Schema Supabase + Admin CRUD básico (Jornadas/Sub-fluxos/Casos) | 3 dias |
| 9.2 | Sync com Google Sheets API + Wizard de mapeamento por projeto | 5 dias |
| 9.3 | Mapa mental interativo (React Flow + animações estilo space) | 5 dias |
| 9.4 | Integração Jira read-only multi-project (N Jiras por projeto) | 4 dias |
| 9.5 | Dashboard executivo + snapshots semanais | 3 dias |

Cada etapa tem critério de conclusão claro. Etapa 9.3 depende de 9.1; 9.4 e 9.5 são paralelizáveis após 9.3.

---

## 3. STACK ADICIONAL

Adicionar ao [apps/web/package.json](apps/web/package.json):

```json
{
  "reactflow": "^11.11.0",
  "framer-motion": "^11.0.0",
  "googleapis": "^144.0.0"
}
```

Adicionar ao [apps/api/package.json](apps/api/package.json):

```json
{
  "googleapis": "^144.0.0",
  "jira-client": "^8.2.2",
  "node-cron": "^3.0.3"
}
```

> Não instalar `xlsx`/`papaparse` — a decisão foi sync via API, não upload manual.

---

## ETAPA 9.1 — SCHEMA + ADMIN CRUD

### 3.1 Migração Supabase

Criar `supabase_migration_qa_journey.sql` na raiz do repo, seguindo o padrão de [supabase_migration_test_runs_bugs.sql](supabase_migration_test_runs_bugs.sql):

```sql
-- Jornadas (Nível 1: blocos macro tipo "Autenticação", "Checkout")
create table qa_journeys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  slug text not null,            -- "autenticacao", "checkout"
  title text not null,
  description text,
  icon text,                      -- nome do ícone lucide (ex.: "Lock")
  color text default '#7c3aed',   -- cor do nó no mapa
  sequence int not null default 0,
  is_published boolean default false,  -- admin controla visibilidade
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, slug)
);

-- Sub-fluxos (Nível 2: "Login com sucesso", "Recuperar senha")
create table qa_journey_subflows (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references qa_journeys(id) on delete cascade,
  title text not null,
  description text,
  sequence int not null default 0,
  automation_status text default 'manual' check (automation_status in ('automated','partial','manual','none')),
  test_case_id uuid references test_cases(id) on delete set null,  -- link opcional com automação Maestro
  created_at timestamptz default now()
);

-- Casos (Nível 3: detalhe — espelha linha da planilha)
create table qa_journey_cases (
  id uuid primary key default gen_random_uuid(),
  subflow_id uuid references qa_journey_subflows(id) on delete cascade,
  external_id text,              -- ID na planilha (ex.: "CT-0142")
  title text not null,
  steps_summary text,            -- resumo em linguagem de negócio
  expected_result text,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  last_run_status text,          -- pass/fail/skipped/not_run
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- Histórico de syncs (auditoria)
create table qa_journey_syncs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  source text not null check (source in ('google_sheets','jira','manual')),
  source_ref text,               -- spreadsheet_id ou jql usado
  status text not null check (status in ('running','success','error')),
  rows_imported int default 0,
  rows_updated int default 0,
  rows_skipped int default 0,
  error_message text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Cache de issues Jira por nó (refresh periódico, não fonte de verdade)
create table qa_journey_jira_cache (
  id uuid primary key default gen_random_uuid(),
  subflow_id uuid references qa_journey_subflows(id) on delete cascade,
  jira_key text not null,        -- "FOXBIT-1234"
  issue_type text,               -- "Bug", "Task", "Story"
  status text,
  priority text,
  summary text,
  url text,
  updated_at_jira timestamptz,
  cached_at timestamptz default now(),
  unique (subflow_id, jira_key)
);

-- RLS permissivo (segue padrão das outras tabelas)
alter table qa_journeys enable row level security;
alter table qa_journey_subflows enable row level security;
alter table qa_journey_cases enable row level security;
alter table qa_journey_syncs enable row level security;
alter table qa_journey_jira_cache enable row level security;

create policy "Allow all for authenticated" on qa_journeys for all using (auth.role() = 'authenticated');
-- Repetir para as 4 outras tabelas
```

### 3.2 Sidebar — adicionar link

Editar [apps/web/src/components/layout/Sidebar.tsx:41](apps/web/src/components/layout/Sidebar.tsx#L41) — incluir entre "Bug Tracker" e "Dispositivos":

```ts
import { Map } from 'lucide-react'; // adicionar no import
// ...
{ href: '/dashboard/qa-journey', label: 'Jornada do QA', icon: Map },
```

### 3.3 Páginas admin

Criar:

- [apps/web/src/app/dashboard/qa-journey/admin/page.tsx](apps/web/src/app/dashboard/qa-journey/admin/page.tsx) — lista de Jornadas do projeto selecionado, com CRUD básico (modal igual ao padrão de [bugs/page.tsx](apps/web/src/app/dashboard/bugs/page.tsx)).
- [apps/web/src/app/dashboard/qa-journey/admin/[journeyId]/page.tsx](apps/web/src/app/dashboard/qa-journey/admin/[journeyId]/page.tsx) — drill-down: sub-fluxos da jornada, casos de cada sub-fluxo.

**Regras de UX do admin**:
- Seletor de projeto no topo (igual ao usado em outras páginas).
- Toggle `is_published` por Jornada — não-publicadas não aparecem no mapa público.
- Botão "Sincronizar com planilha" (placeholder na 9.1, funcional na 9.2).
- Botão "Importar campos do Maestro" — varre `test_cases` do projeto e oferece linkar manualmente em `qa_journey_subflows.test_case_id`.

### 3.4 Critério de conclusão da Etapa 9.1

- [ ] Migração aplicada no Supabase, 5 tabelas criadas com RLS.
- [ ] Link "Jornada do QA" visível no sidebar.
- [ ] Admin permite criar/editar/deletar Jornada, Sub-fluxo e Caso 100% no front, sem mexer em SQL.
- [ ] Estado `is_published` filtra o que vai ao mapa público (mapa pode ser placeholder nesta etapa).
- [ ] Pelo menos 1 Jornada seed com 2 sub-fluxos e 3 casos manualmente criada para teste.

---

## ETAPA 9.2 — SYNC GOOGLE SHEETS (LIVE)

### 4.1 Mapeamento por projeto (planilhas existentes, sem refactor)

**Premissa**: as planilhas atuais do time não devem ser alteradas. Cada projeto tem layout próprio (colunas em ordens/nomes diferentes, abas múltiplas, headers em linhas variadas). O sync precisa de um **mapeamento configurável por projeto**, não de um formato único.

Migração adicional (já no `supabase_migration_qa_journey.sql`):

```sql
-- Configuração de sync por projeto: como interpretar a planilha dele
create table qa_journey_sheet_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  spreadsheet_id text not null,
  sheet_name text not null,              -- aba específica
  header_row int default 1,              -- linha onde estão os cabeçalhos (1-indexed)
  data_start_row int default 2,
  -- mapping: { "external_id": "ID", "title": "Caso de Teste", "journey": "Módulo", ... }
  column_map jsonb not null,
  -- valores fixos quando a planilha não tem a coluna
  defaults jsonb default '{}'::jsonb,    -- ex: { "priority": "medium" }
  -- transformações simples por coluna
  transforms jsonb default '{}'::jsonb,  -- ex: { "automation_status": { "Sim": "automated", "Não": "manual" } }
  is_active boolean default true,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  unique (project_id, spreadsheet_id, sheet_name)
);
```

Um projeto pode ter **N configs** (uma por aba/planilha relevante).

### 4.1.1 UI: Wizard de mapeamento

Tela `/dashboard/qa-journey/admin/[journeyId]/sheet-config`:

1. **Passo 1**: admin cola URL da planilha + escolhe aba (dropdown listado via Google Sheets API).
2. **Passo 2**: sistema lê primeiras 5 linhas e mostra preview. Admin escolhe qual linha são os headers.
3. **Passo 3**: para cada campo do schema QAMind (`external_id`, `title`, `journey`, `subflow`, etc.), admin escolhe **a coluna correspondente** da planilha via dropdown — ou marca "não tenho essa coluna" (vai pro `defaults`).
4. **Passo 4**: para colunas categóricas (`automation_status`, `priority`), admin mapeia valores: "Automatizado" → `automated`, "Não iniciado" → `none`, etc.
5. **Passo 5**: preview de 10 linhas processadas. Admin confirma e salva config.

Sem essa tela, **não há sync** — o sync usa só `qa_journey_sheet_configs`. Não há "formato padrão obrigatório".

### 4.1.2 Campos QAMind que o mapeamento precisa cobrir

Mesmo que cada planilha use nomes diferentes, esses 9 campos precisam ser mapeáveis (com fallback para `defaults`):

| Campo QAMind | Origem | Obrigatório? |
|--------------|--------|--------------|
| `external_id` | coluna da planilha | sim (chave de upsert) |
| `journey` | coluna | sim |
| `subflow` | coluna | sim |
| `title` | coluna | sim |
| `steps_summary` | coluna | não |
| `expected_result` | coluna | não |
| `priority` | coluna ou default | não |
| `automation_status` | coluna ou default | não |
| `last_run_status` | coluna ou default | não |

Se a planilha não tem `external_id`, sync recusa — não dá pra fazer upsert sem chave estável. (Workaround: admin pode usar fórmula `=A2&"-"&B2` no Sheets pra criar uma coluna ID e referenciar essa.)

### 4.2 Credentials

Variáveis de ambiente no `apps/api/.env`:

```
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON=base64_da_service_account
GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID=  # opcional, pode vir por projeto
```

A vinculação planilha ↔ projeto fica em `qa_journey_sheet_configs` (ver 4.1) — sem coluna nova em `projects`, já que um projeto pode ter N configs.

### 4.3 Rotas API Fastify

Criar [apps/api/src/routes/qa-journey.ts](apps/api/src/routes/qa-journey.ts) seguindo o padrão de [apps/api/src/routes/runs.ts](apps/api/src/routes/runs.ts):

```ts
POST /api/qa-journey/sync/:projectId
  - dispara sync síncrono (ou via job se planilha grande)
  - registra qa_journey_syncs row, retorna { syncId, status }

GET /api/qa-journey/syncs/:projectId
  - histórico paginado para a tela admin

GET /api/qa-journey/tree/:projectId
  - retorna árvore completa: jornadas → subflows → cases
  - já com cache de Jira agregado (preparado para 9.4)
```

### 4.4 Lógica de sync (upsert)

Em [apps/api/src/services/google-sheets.ts](apps/api/src/services/google-sheets.ts):

1. Carregar todas as `qa_journey_sheet_configs` ativas do projeto.
2. Para cada config:
   a. Autenticar com service account.
   b. Ler `sheet_name` a partir de `data_start_row`.
   c. Para cada linha, aplicar `column_map` → objeto interno `{ external_id, journey, subflow, title, ... }`.
   d. Aplicar `defaults` para campos ausentes.
   e. Aplicar `transforms` para campos categóricos (mapear valores da planilha → enum QAMind).
   f. Validar: linhas sem `external_id`/`journey`/`subflow`/`title` viram skipped (gravar no `qa_journey_syncs.rows_skipped` com motivo em log).
   g. Upsert: `qa_journeys` por `slug`, `qa_journey_subflows` por `journey_id + title`, `qa_journey_cases` por `external_id`.
3. Casos que existiam e sumiram da planilha → marcar `archived_at` (adicionar coluna na migração principal), **não deletar**.
4. Gravar contagens em `qa_journey_syncs` (1 row por config sincronizada).

### 4.5 Cron diário

[apps/api/src/index.ts](apps/api/src/index.ts) — registrar `node-cron`:

```ts
import cron from 'node-cron';
cron.schedule('0 7 * * *', async () => {
  // sync todos os projetos com google_sheet_id setado
});
```

### 4.6 Critério de conclusão da Etapa 9.2

- [ ] Service account configurado, 1 planilha real de QA da Foxbit compartilhada com ele (somente leitura).
- [ ] Wizard de mapeamento funciona com **2 planilhas de layouts diferentes** (sem alterar as planilhas).
- [ ] Botão "Sincronizar agora" no admin dispara `POST /sync` e mostra progresso/erros.
- [ ] Tela `qa-journey/admin/syncs` lista histórico com filtros.
- [ ] Re-sync da mesma planilha **não duplica** registros (idempotente — testar 3 syncs seguidos, contagem estável).
- [ ] Linhas inválidas viram skipped, **não quebram o sync inteiro**.
- [ ] Cron das 7h roda em ambiente local (testar com `*/2 * * * *` durante dev).

---

## ETAPA 9.3 — MAPA MENTAL INTERATIVO

### 5.1 Página pública

[apps/web/src/app/dashboard/qa-journey/page.tsx](apps/web/src/app/dashboard/qa-journey/page.tsx) — client component, full-screen, fundo `#05060a` com partículas (canvas ou CSS).

### 5.2 Biblioteca: React Flow

Usar [React Flow](https://reactflow.dev/) — já validado, suporta:
- Nodes customizados (cards com gradiente, ícone, status pill).
- Edges animadas (linha pontilhada percorrendo o caminho).
- Zoom/pan, mini-map.

Layout automático: usar `dagre` (vem com exemplo oficial) em modo `LR` para que jornadas fiquem em coluna esquerda e sub-fluxos se ramifiquem à direita.

### 5.3 Níveis de divulgação progressiva

**Nível 1 — Macro** (default): só nodes de `qa_journeys`. Cada nó mostra:
- Ícone + título.
- Pill de cobertura: `{automated_subflows}/{total_subflows}` com barra colorida.
- Status visual: cinza (sem cobertura) → amarelo (parcial) → verde (100%).

**Nível 2 — Expansão** (click no nó): sub-fluxos ramificam à direita com animação `framer-motion` (stagger 80ms). Edges animadas conectando.

**Nível 3 — Resumo executivo** (click em sub-fluxo): drawer lateral (`<Sheet>` do shadcn já existe em [apps/web/src/components/ui/sheet.tsx](apps/web/src/components/ui/sheet.tsx)) com:
- Descrição em linguagem de negócio.
- Status de automação + última execução (`last_run_status` + `last_run_at`).
- Contagem de issues Jira ativos (Etapa 9.4).
- Botão "Ver especificações completas" → expande para Nível 4.

**Nível 4 — Detalhe técnico**: tabela de `qa_journey_cases` do sub-fluxo (mesma estética da tabela de bugs). Link para o test_case Maestro quando `test_case_id` está setado.

### 5.4 Toques lúdicos (sem virar Disney)

Replicar do site referência:
- Fundo dark com pontos/estrelas (CSS puro, sem dep nova).
- "Foguete" (emoji ou SVG) sobre o nó atualmente focado.
- Contador `X de Y blocos explorados` no topo, atualiza ao clicar em jornadas.
- Transições suaves entre níveis (`framer-motion` AnimatePresence).

> **Não** copiar literalmente o site referência — esse é o estilo, não o layout. Adaptar para o tema dark do QAMind (`bg-[#0A0C14]`, `text-brand`).

### 5.5 Critério de conclusão da Etapa 9.3

- [ ] Mapa renderiza Jornadas seed em < 1s, smooth pan/zoom.
- [ ] Click em jornada expande sub-fluxos com animação.
- [ ] Drawer mostra detalhe sem reload de página.
- [ ] Testado em projeto com 8+ jornadas e 30+ sub-fluxos (sem travamento).
- [ ] Botão "Modo apresentação" (fullscreen, sem sidebar) — para o tech lead mostrar pra liderança.

---

## ETAPA 9.4 — INTEGRAÇÃO JIRA (READ-ONLY)

### 6.1 Configuração — N projetos Jira por projeto QAMind

Foxbit usa **múltiplos projetos no Jira** (ex.: `FOXBIT-MOBILE`, `FOXBIT-WEB`, `FOXBIT-PIX`, `FOXBIT-CARDS`). Um projeto QAMind ("Foxbit App") pode mapear para N keys Jira simultaneamente — issues de qualquer um deles podem ser relevantes para os sub-fluxos.

Variáveis em `apps/api/.env`:

```
JIRA_HOST=foxbit.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...
```

Migração extra — tabela de N:N projeto QAMind ↔ projetos Jira:

```sql
create table qa_journey_jira_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  jira_project_key text not null,        -- "FOXBIT-MOBILE"
  display_name text,                     -- "Foxbit Mobile" (opcional, override do nome Jira)
  -- JQL base aplicado a TODAS as queries deste Jira project
  -- ex.: 'component = "Checkout"' pra filtrar só o que é relevante
  base_jql text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (project_id, jira_project_key)
);

alter table qa_journey_subflows add column jira_query text;
-- jira_query: JQL adicional do sub-fluxo, ex: 'labels in ("login","auth")'
-- aplicado em TODOS os jira_project_keys vinculados ao projeto

-- O cache já existente (qa_journey_jira_cache) ganha jira_project_key:
alter table qa_journey_jira_cache add column jira_project_key text;
```

### 6.1.1 UI: gerenciar Jira projects do projeto QAMind

Tela `/dashboard/qa-journey/admin/jira-projects`:
- Lista N rows: key, display_name, base_jql, toggle ativo.
- Botão "Adicionar projeto Jira" — busca via API as project keys disponíveis no host e admin escolhe + define `base_jql` opcional.
- Validação: testar JQL ao salvar (chamada dry-run, se retorna erro 400 do Jira, bloqueia save).

### 6.2 Lógica de sync Jira (multi-project)

Em [apps/api/src/services/jira.ts](apps/api/src/services/jira.ts):

1. Carregar `qa_journey_jira_projects` ativos do projeto QAMind.
2. Para cada sub-fluxo, montar **uma JQL por Jira project**:
   ```
   project = "{jira_project_key}"
     AND ({base_jql_do_jira_project})       -- se houver
     AND ({jira_query_do_subflow} OR labels in ('{subflow.title kebab}'))
     AND statusCategory != Done
   ```
3. Executar queries em paralelo (Promise.all, limit 10 concurrent por sub-fluxo).
4. Upsert em `qa_journey_jira_cache` incluindo `jira_project_key`.
5. Limpar entradas órfãs por `(subflow_id, jira_project_key)` — issues que sumiram da query daquele project específico saem, sem mexer nas dos outros projects.
6. **Otimização**: se um sub-fluxo tem `jira_query` vazio E `subflow.title` não tem matches em labels comuns, pular para evitar JQL ruim (`labels = "x"` em projects que não usam labels gera ruído).

### 6.3 Endpoint + cron

```
POST /api/qa-journey/jira-sync/:projectId    # on-demand
```

Cron 4x ao dia (`0 */6 * * *`).

### 6.4 UI no mapa

- Sub-fluxo com Jira ativos: badge vermelho `🐞 N` (bugs) e azul `📋 M` (tasks) — soma de **todos** os Jira projects vinculados.
- Drawer Nível 3: lista clicável agrupada por Jira project key (ex.: seção "FOXBIT-MOBILE (3)", "FOXBIT-PIX (1)"). Abre `url` em nova aba.
- Filtro global no topo do mapa: "Mostrar só fluxos com bugs abertos".
- Filtro secundário: dropdown "Jira project" — permite focar em issues de um único project por vez (ex.: PO de Cards vê só `FOXBIT-CARDS`).

### 6.5 Critério de conclusão da Etapa 9.4

- [ ] Sync busca issues reais de um projeto Jira sandbox.
- [ ] Cache não cresce indefinidamente (issues fechadas saem).
- [ ] UI nunca chama Jira diretamente — só lê do cache.
- [ ] Auth token nunca aparece no client (validar no DevTools).

---

## ETAPA 9.5 — DASHBOARD EXECUTIVO

Nova aba dentro de `/dashboard/qa-journey?view=stats` com Recharts (já usado em [dashboard/page.tsx](apps/web/src/app/dashboard/page.tsx)):

- **KPI cards**: Total Jornadas, % Automação Global, Bugs Abertos por Severidade (agregado dos N Jira projects), Última Sync.
- **Treemap**: cada Jornada como bloco proporcional ao número de casos, cor = % automação.
- **Linha temporal**: evolução de KPIs por semana — depende de snapshots históricos (ver 7.0).
- **Tabela "Gaps"**: sub-fluxos sem `test_case_id` + sem cobertura, ordenados por prioridade.

### 7.0 Snapshots semanais — por que e como

**Problema sem snapshot**: a Jornada só sabe o estado **atual**. Se a liderança pergunta "evoluímos em cobertura no último trimestre?", não há resposta possível — os dados de antes foram sobrescritos pelos syncs.

**Solução**: a cada domingo 23h, o sistema tira uma "foto" dos KPIs por projeto QAMind e guarda em `qa_journey_snapshots`. Essas fotos alimentam o gráfico temporal.

Migração:

```sql
create table qa_journey_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  snapshot_date date not null,                  -- domingo da semana
  total_journeys int not null default 0,
  total_subflows int not null default 0,
  total_cases int not null default 0,
  automated_subflows int not null default 0,    -- automation_status = 'automated'
  partial_subflows int not null default 0,
  manual_subflows int not null default 0,
  open_bugs_count int not null default 0,       -- soma cache Jira: issuetype=Bug + statusCategory != Done
  open_tasks_count int not null default 0,
  pass_rate_7d numeric(5,2),                    -- % runs ok nos 7 dias antes do snapshot
  created_at timestamptz default now(),
  unique (project_id, snapshot_date)
);
```

Cron em [apps/api/src/index.ts](apps/api/src/index.ts):

```ts
cron.schedule('0 23 * * 0', async () => {
  // domingo 23h — snapshot semanal de todos os projetos ativos
});
```

**Custo de storage**: ~52 rows/ano por projeto. Para 20 projetos = 1.040 rows/ano. Desprezível.

**Granularidade**: semanal escolhida sobre mensal porque:
1. Sprint da Foxbit costuma ser 1-2 semanas — snapshot mensal mascararia regressões dentro do mês.
2. Você sempre pode **agregar** semanal → mensal no gráfico (média/última do mês), mas **não** pode interpolar mensal → semanal sem inventar dado.
3. Custo idêntico em prática (storage trivial).

**Backfill inicial**: ao deployar, criar 1 snapshot retroativo com data de hoje para começar a série. Snapshots anteriores não dá pra inventar — a série começa na primeira execução do cron.

### 7.1 Critério de conclusão da Etapa 9.5

- [ ] Dashboard carrega em < 2s para projeto de tamanho real.
- [ ] PO consegue identificar em 30s os fluxos sem cobertura (teste com 1 PO real).
- [ ] Export PNG do mapa para incluir em apresentação (`react-flow` tem `toImage` nativo).

---

## 8. CRITÉRIOS DE CONCLUSÃO GLOBAIS (Parte 9)

- [ ] Tech lead consegue rodar demo de 5 min mostrando: planilha → sync → mapa animado → drill-down → Jira → KPIs.
- [ ] Nenhum arquivo ultrapassa 1.500 linhas (regra [CLAUDE.md](CLAUDE.md)).
- [ ] Service account Google + token Jira documentados em [README.MD](README.MD).
- [ ] Schema versionado em `supabase_migration_qa_journey.sql` aplicado em prod.
- [ ] Migração reversível (script `down.sql` que dropa as tabelas novas).

---

## 9. CONTRATO PARA PRÓXIMAS PARTES

Se houver Parte 10 (ex.: IA gerando casos a partir da Jornada), os seguintes contratos ficam estáveis:

```ts
// apps/web/src/types/qa-journey.ts
export interface QAJourney {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  sequence: number;
  is_published: boolean;
  subflows: QAJourneySubflow[];
}

export interface QAJourneySubflow {
  id: string;
  journey_id: string;
  title: string;
  automation_status: 'automated' | 'partial' | 'manual' | 'none';
  test_case_id?: string;
  cases: QAJourneyCase[];
  jira_cache: QAJiraCacheEntry[];
}

export interface QAJourneyCase {
  id: string;
  external_id?: string;
  title: string;
  steps_summary?: string;
  expected_result?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  last_run_status?: string;
  last_run_at?: string;
}
```

A árvore acima é o output de `GET /api/qa-journey/tree/:projectId` e fonte de verdade do mapa.

---

## 10. NÃO FAZER NESTA PARTE

- ❌ Criar issues no Jira a partir do QAMind (escopo Etapa N+1).
- ❌ Editor visual de mapa mental (admin é form-based — drag de nós não é prioridade).
- ❌ Multi-tenancy por workspace (segue padrão atual de `project_id`).
- ❌ Substituir Outline/Slack — a Jornada **agrega**, não migra conteúdo.
- ❌ Upload de CSV/XLSX (decisão tomada: sync via API).
