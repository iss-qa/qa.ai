# Parte 10 — Contas, Organizações e Nova Landing Page

# Contexto e Objetivo

O QAMind evoluiu além da ideia original de "testes em linguagem natural". Hoje os pilares
reais da plataforma são:

- **Scanner de elementos (Maestro)** — escaneia o app sob teste, mapeia cada elemento da
  interface e permite montar ações (tap, assert de visibilidade, input, etc.) sem código.
- **Gravação de testes (Record & Replay)** — o QA clica em "Gravar", executa o fluxo no
  dispositivo físico e a ferramenta captura os passos. Depois é só reproduzir.
- **Jornadas (mapa visual)** — mapa estilo Miro onde o QA cadastra jornadas de teste
  (ex.: Jornada de Login → login válido, inválido, conta PJ, conta PF...). Cada jornada tem
  uma árvore de subfluxos e casos de teste, com anexos (posts do outline, documentos),
  legível para Tech Lead, PO, devs e CEO. Outras squads incluem seus cenários facilmente.
- **Integrações** — Google Sheets e Jira hoje; Slack em breve.
- **Relatórios, Bug Tracker, Documentação e Logs.**

Esta parte cobre três entregas:

1. **Repaginar a landing page** para refletir esses pilares (linguagem natural vira um
   recurso entre outros, não o herói).
2. **Usuários e organizações no Supabase** — perfis de usuário, campos públicos da
   organização, papéis e administrador master.
3. **Cadastro / login / perfil** — o QA se cadastra vinculado a uma organização, edita os
   próprios dados e visualiza a organização à qual pertence.

---

## 1. Landing Page (repaginação)

**Arquivo:** `apps/web/src/app/page.tsx` (server component, tokens semânticos do tema,
responsiva mobile-first conforme CLAUDE.md).

### Narrativa

- **Hero:** "A plataforma completa de QA" — scanner de elementos, gravação de testes e
  jornadas visuais. Mock visual do produto (scanner/recorder) no lugar do terminal de prompt.
- **Pilares (features em destaque, com mock/ilustração própria):**
  1. Scanner Maestro — mapeie cada elemento do app e monte testes clicando.
  2. Record & Replay — grave o teste executando no dispositivo físico; reproduza quando quiser.
  3. Jornadas — mapa visual colaborativo dos cenários de teste da organização.
  4. Integrações — Google Sheets, Jira e (em breve) Slack.
- **Recursos secundários (grid):** linguagem natural com IA, execução real-time com
  preview do device, relatórios, bug tracker, logs, multi-plataforma (Android/iOS/Web).
- **Como funciona (3 passos):** Conecte o dispositivo → Escaneie ou grave → Reproduza e
  acompanhe nas jornadas e relatórios.
- **Personas:** QA Engineers, Tech Leads/POs (visão das jornadas), Squads (cenários
  próprios), Empresas (organizações multi-time).
- **Planos:** Free / Starter / Pro / Enterprise (alinhado ao enum `organizations.plan`).
- **CTA + Footer.**

---

## 2. Arquitetura de Dados (Supabase)

**Migration:** `supabase/migrations/011_accounts_profiles.sql` (+ `.down.sql`).
Base existente: `organizations`, `org_memberships`, `org_integrations` (migration 007).

### 2.1 Tabela `profiles` (nova)

Espelho público de `auth.users`, criada automaticamente por trigger no signup.

- `id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE`
- `email TEXT NOT NULL`
- `full_name TEXT NOT NULL`
- `funcao TEXT` — cargo (QA Engineer, QA Lead, PO, Dev...)
- `squad TEXT` — squad/time do usuário
- `phone TEXT`
- `avatar_url TEXT`
- `is_master_admin BOOLEAN NOT NULL DEFAULT FALSE` — administrador master do QAMind
- `created_at / updated_at TIMESTAMPTZ`

### 2.2 Organização — campos públicos (alteração)

`organizations` ganha campos simples e públicos:

- `cnpj TEXT`
- `address TEXT`
- `website TEXT`
- `contact_email TEXT`
- `description TEXT`
- `logo_url TEXT`

### 2.3 Trigger de signup (`handle_new_user`)

`AFTER INSERT ON auth.users`, `SECURITY DEFINER`. Lê `raw_user_meta_data` enviado pelo
formulário de registro:

- Sempre cria o `profiles` (full_name, funcao, squad).
- `org_mode = 'create'`: cria `organizations` (name, cnpj, address, website; slug gerado a
  partir do nome com sufixo anti-colisão; plan `free`) e `org_memberships` com role `owner`.
- `org_mode = 'join'`: valida `org_id` (existe e `is_active`) e cria membership `member`.
- Falha na parte de organização **não** aborta o signup (profile sempre é criado).

### 2.4 Papéis

- **Membership (`org_memberships.role`):** `owner` | `admin` | `member` | `viewer` —
  owner/admin editam os dados da organização.
- **Admin master (`profiles.is_master_admin`):** administra todas as organizações
  (criar, ativar/desativar, mudar plano). Seed: promover via SQL o e-mail do operador da
  instalação (`UPDATE profiles SET is_master_admin = TRUE WHERE email = '...'`).

### 2.5 RLS

- `profiles`: SELECT próprio + membros da mesma org + master; UPDATE apenas o próprio
  (master pode tudo); INSERT/DELETE só via trigger/service role.
- `organizations`: SELECT liberado (campos são públicos — necessário para o registro
  listar orgs para "entrar em organização existente"); UPDATE por owner/admin da org ou
  master; INSERT/DELETE pelo master (criação no signup passa pelo trigger SECURITY DEFINER).
- `org_memberships`: SELECT para membros da mesma org e master; escrita via trigger,
  service role e master.

---

## 3. Fluxos de Conta (UI)

### 3.1 Registro (`/register`)

Formulário em duas seções:

1. **Dados do QA:** nome completo, e-mail, função, squad, senha (mín. 8 caracteres).
2. **Organização:** alternância entre
   - **Criar organização** — nome, CNPJ, endereço, site (vira `owner`); ou
   - **Entrar em organização existente** — select com as orgs ativas (vira `member`).

Tudo enviado via `supabase.auth.signUp({ options: { data } })`; o trigger materializa
profile + org + membership. Compatível com confirmação de e-mail ligada ou desligada.

### 3.2 Login (`/login`)

Já existe (Supabase Auth + middleware por cookie `sb-*`). Ajuste: remover credenciais
de teste pré-preenchidas no código.

### 3.3 Menu do usuário (Header)

No `Header` do dashboard, substituir o avatar fixo "IS" por `UserMenu`:

- Avatar com iniciais do nome (ou `avatar_url`).
- Dropdown: nome/e-mail, **Meu Perfil** (`/dashboard/profile`),
  **Administração** (`/dashboard/admin`, só para master), **Sair** (signOut → `/login`).

### 3.4 Perfil (`/dashboard/profile`)

- Editar dados pessoais: nome, função, squad, telefone.
- Card **Organização** (somente leitura para `member`/`viewer`): nome, slug, plano,
  CNPJ, endereço, site, e-mail de contato; papel do usuário na org.
- `owner`/`admin` editam os dados públicos da organização no mesmo lugar.

### 3.5 Administração master (`/dashboard/admin`)

Visível apenas para `is_master_admin` (guard server-side + RLS):

- Listar organizações (nome, slug, plano, membros, status).
- Criar organização; ativar/desativar; alterar plano.

---

## 4. Requisitos Técnicos e Stack

- Next.js 14 App Router; auth com `@supabase/ssr` (clients já existentes em
  `src/lib/supabase/{client,server,middleware}.ts`).
- Consultas autenticadas (RLS por usuário) usam o client de `@/lib/supabase/client` —
  **não** o proxy legado `@/lib/supabase` (sem sessão).
- Tokens semânticos do tema em tudo (sem cores hardcoded); responsivo mobile-first;
  `loading.tsx` nas novas rotas do dashboard.
- Nenhum arquivo > 1.500 linhas; modais/painéis extraídos quando crescerem.

## Entregáveis Esperados

- `supabase/migrations/011_accounts_profiles.sql` + `.down.sql` (profiles, campos da org,
  trigger `handle_new_user`, RLS, índices).
- Landing page repaginada (`apps/web/src/app/page.tsx`).
- `/register` completo (QA + organização), `/login` sem credenciais fixas.
- `UserMenu` no Header; páginas `/dashboard/profile` e `/dashboard/admin` com `loading.tsx`.
