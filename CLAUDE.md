# QAMind — Diretrizes para Claude Code

## Regra de Tamanho de Arquivo

**Nenhum arquivo deve ultrapassar 1.500 linhas.**

Quando um arquivo se aproximar do limite:
1. Identifique um grupo de responsabilidade coeso (ex.: todas as rotas de um domínio, um serviço específico).
2. Extraia esse grupo para um novo arquivo dentro da pasta adequada.
3. Atualize os imports no arquivo original.

## Arquitetura do Projeto

O projeto segue uma **Feature-based Clean Architecture**. Cada camada tem responsabilidade única:

```
apps/
├── daemon/      # Python — controle de dispositivo Android (porta 8001)
├── api/         # Node.js / Fastify — integracoes externas + cron (porta 3001)
└── web/         # Next.js 14 — dashboard (porta 3000)
packages/
└── shared/      # Tipos compartilhados (TestStep, etc)
```

### Fluxos por porta

- **web (3000)** → fala com **api (3001)** para integrações externas (Google Sheets, Jira), snapshots, cron, e diretamente com Supabase para CRUD básico.
- **web (3000)** → fala com **daemon (8001)** para controle de dispositivo Android (execução de teste, scan, recorder).
- **api (3001)** → centraliza credenciais cifradas em `org_integrations` e expõe webhooks/cron.

### Camadas Python (`apps/daemon/`)

```
apps/daemon/
├── main.py              # Entry point: app setup, middleware, router registration. Sem lógica de negócio.
├── state.py             # Globals mutáveis compartilhados entre módulos (asyncio.Lock, caches, etc.)
├── config.py            # Constantes e variáveis de ambiente
├── routes/              # Controladores finos — recebem request, delegam ao service, retornam response
│   ├── devices.py
│   ├── runs.py
│   ├── recording.py
│   ├── tests.py
│   ├── projects.py
│   ├── scanner.py
│   ├── logs.py
│   ├── device_input.py
│   ├── engines.py
│   └── mss/             # Maestro Studio Server compatibility layer
│       ├── device_screen.py
│       ├── commands.py
│       ├── workspace.py
│       ├── flows.py
│       ├── devices.py
│       ├── apps.py
│       └── misc.py
├── services/            # Lógica de negócio — não importa de routes/
│   └── maestro/
│       ├── studio.py    # Gerenciamento do subprocesso Maestro Studio
│       ├── runner.py    # Execução de flows (embedded session + file-based)
│       └── elements.py  # Parse de XML, dump de hierarquia, cache de elementos
├── android/             # Camada de acesso ao dispositivo via ADB/scrcpy
├── ws/                  # WebSocket broadcast e stream manager
├── engines/             # Executores de teste (Maestro, UIAutomator2)
└── models/              # Dataclasses e BaseModels compartilhados
```

## Regras Gerais

- `main.py` é **somente** entry point: importa routers, configura middleware, registra eventos de startup/shutdown.
- `routes/` contém **somente** handlers HTTP/WebSocket. Lógica de negócio fica em `services/`.
- `services/` **nunca** importa de `routes/`.
- `state.py` **nunca** importa do projeto — apenas stdlib.
- Ao criar um novo endpoint: verifique se o router do domínio já existe antes de criar um novo arquivo.
- Funções helper usadas por múltiplos módulos vão em `services/` ou `android/`, não em `main.py`.

### Camadas Node.js (`apps/api/`)

```
apps/api/src/
├── index.ts                # Entry: dotenv/config DEVE ser o primeiro import
├── plugins/                # Fastify plugins (cors, websocket, supabase lazy-proxy)
├── routes/                 # Handlers HTTP finos — delegam a services/
│   ├── health.ts
│   ├── integrations.ts     # CRUD de credenciais Google/Jira por org
│   └── qa-journey.ts       # sheet configs, sync, snapshots, history
└── services/               # Lógica de negócio
    ├── encryption.ts       # AES-256-GCM (chave em INTEGRATIONS_ENCRYPTION_KEY)
    ├── org-integrations.ts # CRUD + test connection das creds
    ├── google-sheets.ts    # googleapis wrappers (aceita creds como param)
    ├── qa-journey-sync.ts  # Upsert idempotente jornadas/subflows/cases
    ├── qa-journey-snapshots.ts
    └── cron.ts             # node-cron schedules (sync diário + snapshot semanal)
```

**Regras Node.js (`apps/api/`):**
- `import 'dotenv/config'` **sempre** primeira linha de `index.ts` (módulos transitivos podem ler `process.env` no top-level).
- `routes/` **nunca** instancia clients externos diretamente — usa o `supabase` lazy de `plugins/supabase.ts`.
- Credenciais cifradas via `services/encryption.ts` antes de gravar em `org_integrations.credentials_cipher`. Nunca commitar a chave `INTEGRATIONS_ENCRYPTION_KEY` nem retornar plaintext para o cliente.
- Cron jobs registrados em `services/cron.ts`, ativados uma vez após `server.listen()` em `index.ts`.

### Multi-tenancy (org_integrations)

- Cada organização (`organizations` table) tem suas próprias credenciais externas em `org_integrations`.
- RLS bloqueia leitura cliente em `org_integrations`: apenas `service_role` (Fastify) lê creds cifradas.
- A org "default" da instalação vem de `DEFAULT_ORG_SLUG` (env). Quando auth multi-org existir, substituir por lookup de sessão.

## Stack

- **Daemon**: Python 3.11+, FastAPI, uvicorn, httpx, uiautomator2, PIL
- **Web**: Next.js 14, TypeScript, Tailwind CSS, Recharts, React Flow, framer-motion
- **API**: Node.js, Fastify, googleapis, node-cron, html-to-image
- **Banco**: Supabase (PostgreSQL + Storage)
- **Dispositivo**: ADB, scrcpy 2.7, Maestro CLI
- **Cripto**: AES-256-GCM (Node `crypto`) para `org_integrations.credentials_cipher`
