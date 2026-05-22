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

## Stack

- **Daemon**: Python 3.11+, FastAPI, uvicorn, httpx, uiautomator2, PIL
- **Web**: Next.js 14, TypeScript, Tailwind CSS
- **API**: Node.js, Fastify
- **Banco**: Supabase (PostgreSQL + Storage)
- **Dispositivo**: ADB, scrcpy 2.7, Maestro CLI
