# QAMind — Parte 1: Setup & Infraestrutura
> **Prompt de desenvolvimento para IA**
> Use este arquivo como guia completo para implementar a base do projeto QAMind.

---

## 🎯 Objetivo desta parte

Criar a fundação completa do projeto: estrutura de pastas, configuração do Supabase, autenticação, schema do banco de dados e o esqueleto do frontend e backend prontos para receber os módulos seguintes.

---

## 📦 Stack desta parte

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 + TypeScript + App Router |
| Estilização | Tailwind CSS + shadcn/ui |
| Backend API | Node.js + Fastify + TypeScript |
| Banco de dados | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/senha + OAuth Google) |
| Armazenamento | Supabase Storage (screenshots, PDFs) |
| Comunicação RT | WebSocket (Fastify nativo) |
| Deploy local | Docker Compose |

---

## 🗂️ Estrutura de Pastas

Crie exatamente esta estrutura:

```
qamind/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx        # Dashboard principal
│   │   │   │   ├── projects/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── tests/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── new/page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── edit/page.tsx
│   │   │   │   │       └── run/page.tsx
│   │   │   │   └── devices/page.tsx
│   │   │   ├── api/
│   │   │   │   └── [...]/route.ts  # API routes Next.js (auth callbacks)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── PageWrapper.tsx
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts       # Supabase browser client
│   │   │   │   ├── server.ts       # Supabase server client
│   │   │   │   └── middleware.ts
│   │   │   ├── api.ts              # Funções de chamada ao backend Fastify
│   │   │   └── utils.ts
│   │   ├── types/
│   │   │   └── index.ts            # Tipos TypeScript compartilhados
│   │   └── middleware.ts
│   │
│   └── api/                        # Fastify backend
│       ├── src/
│       │   ├── index.ts            # Entry point
│       │   ├── plugins/
│       │   │   ├── websocket.ts
│       │   │   ├── supabase.ts
│       │   │   └── cors.ts
│       │   ├── routes/
│       │   │   ├── projects.ts
│       │   │   ├── tests.ts
│       │   │   ├── devices.ts
│       │   │   ├── runs.ts
│       │   │   └── health.ts
│       │   ├── services/           # Lógica de negócio
│       │   │   ├── ProjectService.ts
│       │   │   └── TestService.ts
│       │   └── types/
│       │       └── index.ts
│       └── package.json
│
├── packages/
│   └── shared/                     # Tipos e utils compartilhados
│       ├── src/
│       │   ├── types/
│       │   │   ├── test.ts
│       │   │   ├── device.ts
│       │   │   └── step.ts
│       │   └── index.ts
│       └── package.json
│
├── docker-compose.yml
├── package.json                    # Monorepo root (pnpm workspaces)
└── README.md
```

---

## 🗄️ Schema Completo do Supabase

Execute estas migrations em ordem no SQL Editor do Supabase:

### Migration 001 — Organizations & Users

```sql
-- Habilitar extensões necessárias
create extension if not exists "uuid-ossp";

-- Organizações (multi-tenant)
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'enterprise')),
  max_projects int not null default 1,
  max_executions_per_month int not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Perfil de usuário (extensão do auth.users do Supabase)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  full_name text,
  avatar_url text,
  role text not null default 'tester' check (role in ('admin', 'tester', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: criar profile automaticamente no signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### Migration 002 — Projects

```sql
create table projects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  platform text not null default 'android' check (platform in ('android', 'web', 'ios')),
  app_package text,          -- ex: com.banco.app (Android)
  app_url text,              -- ex: https://app.banco.com (Web)
  color text default '#4A90D9',
  is_archived boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_org_id on projects(org_id);
```

### Migration 003 — Test Cases & Steps

```sql
-- Casos de teste
create table test_cases (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  prompt_original text,      -- Prompt em linguagem natural que gerou o teste
  steps jsonb not null default '[]'::jsonb,
  tags text[] default '{}',
  is_active boolean not null default true,
  version int not null default 1,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Histórico de versões dos casos de teste
create table test_case_versions (
  id uuid primary key default uuid_generate_v4(),
  test_case_id uuid not null references test_cases(id) on delete cascade,
  version int not null,
  steps jsonb not null,
  changed_by uuid references profiles(id),
  change_note text,
  created_at timestamptz not null default now()
);

-- Suites de teste (agrupamentos)
create table test_suites (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  test_case_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

create index idx_test_cases_project_id on test_cases(project_id);
```

### Migration 004 — Devices

```sql
create table devices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  udid text not null,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  model text,
  manufacturer text,
  android_version text,
  screen_width int,
  screen_height int,
  status text not null default 'offline' check (status in ('online', 'offline', 'busy', 'error')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_devices_org_id on devices(org_id);
create unique index idx_devices_udid_org on devices(udid, org_id);
```

### Migration 005 — Test Runs & Steps

```sql
-- Execuções de testes
create table test_runs (
  id uuid primary key default uuid_generate_v4(),
  test_case_id uuid not null references test_cases(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'passed', 'failed', 'cancelled', 'error')),
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'api')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms int,
  total_steps int not null default 0,
  passed_steps int not null default 0,
  failed_step_num int,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Steps individuais de uma execução
create table run_steps (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references test_runs(id) on delete cascade,
  step_num int not null,
  action text not null,
  target text,
  value text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'passed', 'failed', 'skipped')),
  screenshot_before_url text,
  screenshot_after_url text,
  ai_analysis text,          -- Análise da IA após executar o step
  error_message text,
  retry_count int not null default 0,
  duration_ms int,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_test_runs_test_case_id on test_runs(test_case_id);
create index idx_run_steps_run_id on run_steps(run_id);
```

### Migration 006 — Bug Reports

```sql
create table bug_reports (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references test_runs(id) on delete cascade,
  title text not null,
  severity text not null default 'medium'
    check (severity in ('critical', 'high', 'medium', 'low')),
  ai_summary text,
  expected_behavior text,
  actual_behavior text,
  steps_to_reproduce jsonb default '[]'::jsonb,
  environment jsonb default '{}'::jsonb,   -- device info, app version, etc
  pdf_url text,
  is_exported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bug_reports_run_id on bug_reports(run_id);
```

### Migration 007 — Row Level Security (RLS)

```sql
-- Habilitar RLS em todas as tabelas
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table test_cases enable row level security;
alter table test_suites enable row level security;
alter table test_case_versions enable row level security;
alter table devices enable row level security;
alter table test_runs enable row level security;
alter table run_steps enable row level security;
alter table bug_reports enable row level security;

-- Função helper para pegar org_id do usuário atual
create or replace function get_my_org_id()
returns uuid as $$
  select org_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Policies: projetos
create policy "Users see only their org projects"
  on projects for all
  using (org_id = get_my_org_id());

-- Policies: test_cases
create policy "Users see only their org test cases"
  on test_cases for all
  using (project_id in (
    select id from projects where org_id = get_my_org_id()
  ));

-- Policies: devices
create policy "Users see only their org devices"
  on devices for all
  using (org_id = get_my_org_id());

-- Policies: test_runs
create policy "Users see runs of their org tests"
  on test_runs for all
  using (test_case_id in (
    select tc.id from test_cases tc
    join projects p on p.id = tc.project_id
    where p.org_id = get_my_org_id()
  ));

-- Policies: run_steps
create policy "Users see steps of their org runs"
  on run_steps for all
  using (run_id in (
    select tr.id from test_runs tr
    join test_cases tc on tc.id = tr.test_case_id
    join projects p on p.id = tc.project_id
    where p.org_id = get_my_org_id()
  ));
```

### Migration 008 — Supabase Storage Buckets

```sql
-- Criar buckets no Storage
insert into storage.buckets (id, name, public) values
  ('screenshots', 'screenshots', false),
  ('bug-reports', 'bug-reports', false),
  ('exports', 'exports', true);

-- Policies de storage
create policy "Users access their org screenshots"
  on storage.objects for all
  using (bucket_id = 'screenshots' and auth.uid() is not null);
```

---

## 🔑 Variáveis de Ambiente

### `apps/web/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### `apps/api/.env`
```env
PORT=3001
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

---

## 🎨 Layout Base — Sidebar + Header

Implemente o layout principal com:

**Sidebar (esquerda, 240px):**
- Logo QAMind
- Navegação: Dashboard, Projetos, Testes, Dispositivos, Relatórios
- Item ativo com highlight colorido
- Avatar + nome do usuário embaixo
- Collapsible em mobile

**Header (topo):**
- Breadcrumb da página atual
- Seletor de projeto ativo (dropdown)
- Botão "Novo Teste" sempre visível
- Notificações (sino)
- Avatar do usuário

**Cores do design system:**
```typescript
const theme = {
  brand: '#4A90D9',
  brandDark: '#1A3A5C',
  accent: '#F0A500',
  success: '#27AE60',
  warning: '#E67E22',
  danger: '#E74C3C',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F8FAFC',
  textPrimary: '#1A3A5C',
  textSecondary: '#64748B',
}
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] Monorepo configurado com pnpm workspaces rodando (`pnpm dev` sobe tudo)
- [ ] Supabase com todas as 8 migrations aplicadas sem erro
- [ ] Auth funcionando: signup, login, logout, Google OAuth
- [ ] RLS validado: usuário de org A não vê dados de org B
- [ ] Layout base renderizando com sidebar e header
- [ ] Rota `/dashboard` protegida (redireciona para `/login` se não autenticado)
- [ ] Storage buckets criados e com policy correta
- [ ] `GET /health` no Fastify retornando `{ status: "ok", timestamp }`
- [ ] WebSocket endpoint básico conectando sem erro
- [ ] Docker Compose subindo todos os serviços com um comando

---

## 🔗 Dependências para a Próxima Parte

Ao concluir esta parte, os seguintes contratos devem estar definidos:

```typescript
// packages/shared/src/types/step.ts
export type StepAction =
  | 'tap' | 'swipe' | 'type' | 'longpress'
  | 'back' | 'home' | 'scroll' | 'wait'
  | 'assert_text' | 'assert_element' | 'assert_url'
  | 'screenshot';

export interface TestStep {
  id: string;
  num: number;
  action: StepAction;
  target?: string;       // seletor de elemento ou coordenadas "x,y"
  value?: string;        // texto a digitar, URL, etc.
  description?: string;  // descrição legível para humanos
  timeout_ms?: number;
  screenshot_after?: boolean;
}

export interface TestCase {
  id: string;
  project_id: string;
  name: string;
  prompt_original?: string;
  steps: TestStep[];
  tags: string[];
  version: number;
}
```

> **IMPORTANTE:** O tipo `TestStep` é o contrato central do sistema inteiro. Todas as partes seguintes dependem dele. Não altere a estrutura sem revisar os módulos dependentes.
