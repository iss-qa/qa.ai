# QAMind — Documentação

Documentação técnica e contextual do projeto. Para começar a usar, veja o [README.md](../README.MD) na raiz.

## Conteúdo

### Operação

- **[DEPLOY.md](DEPLOY.md)** — passo-a-passo para subir QAMind em VPS Hostinger com Dokploy.
- **[premises.yaml](premises.yaml)** — premissas técnicas e decisões arquiteturais.
- **[requisitos.docx](requisitos.docx)** — documento original de requisitos (Word).

### API

- **[postman/qamind_api_collection.json](postman/qamind_api_collection.json)** — coleção Postman dos endpoints do daemon + api Fastify.

### Prompts de desenvolvimento ([prompts/](prompts/))

Cada `parte-XX-*.md` é um prompt completo (~500 linhas) usado para gerar uma parte do projeto com IA. Servem como **documentação viva da arquitetura** de cada módulo.

- **[INDEX.md](prompts/INDEX.md)** — visão geral das partes
- **[parte-01-setup-infraestrutura.md](prompts/parte-01-setup-infraestrutura.md)** — Setup Supabase, Next.js, Fastify, Auth
- **[parte-02-modulo-android.md](prompts/parte-02-modulo-android.md)** — Daemon Python, ADB, uiautomator2, WebSocket
- **[parte-03-orquestrador-ia.md](prompts/parte-03-orquestrador-ia.md)** — Claude API, prompt→steps, loop visual
- **[parte-04-editor-steps.md](prompts/parte-04-editor-steps.md)** — Editor frontend, drag-drop, versioning
- **[parte-05-execucao-realtime.md](prompts/parte-05-execucao-realtime.md)** — Preview device, WebSocket RT
- **[parte-06-bug-engine-pdf.md](prompts/parte-06-bug-engine-pdf.md)** — Bug report IA + PDF
- **[parte-07-dashboard-relatorios.md](prompts/parte-07-dashboard-relatorios.md)** — Dashboard, métricas, histórico
- **[parte-08-web-driver-saas.md](prompts/parte-08-web-driver-saas.md)** — Playwright, multi-tenant, Stripe
- **[parte-09-jornada-do-qa.md](prompts/parte-09-jornada-do-qa.md)** — **Jornada do QA** (mapa mental + Google Sheets + Jira + multi-tenant integrations)

### Outros

- **[gravacao.md](prompts/gravacao.md)** + **[gravacao_new.md](prompts/gravacao_new.md)** + **[gravacao_new2.md](prompts/gravacao_new2.md)** — iterações sobre o gravador de testes Maestro
- **[maestro_integration.md](prompts/maestro_integration.md)** — guia técnico de integração Maestro
- **[relatorio.md](prompts/relatorio.md)** — relatório de execução
- **[parte-01-setup-infraestrutura.md](prompts/parte-01-setup-infraestrutura.md)**...

## Estrutura visual do projeto

```
qa-ai/
├── apps/
│   ├── daemon/          # Python — controle Android (porta 8001)
│   ├── api/             # Fastify — integrações + cron (porta 3001)
│   └── web/             # Next.js — dashboard (porta 3000)
├── packages/
│   └── shared/          # Tipos compartilhados
├── supabase/
│   └── migrations/      # Schemas SQL ordenados (001..007)
├── docs/                # ← você está aqui
│   ├── prompts/         # Prompts de geração por IA
│   └── postman/         # Coleções de API
├── flows/               # YAMLs de teste (Maestro)
├── docker-compose.yml   # Deploy stack (Dokploy)
├── start.sh             # Subir tudo local
└── README.md            # Quick start
```
