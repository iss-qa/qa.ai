# QAMind - Plataforma de Automacao de Testes com IA

## Requisitos

- **Node.js** >= 20
- **pnpm** >= 9
- **Python** >= 3.11
- **ADB** (Android Debug Bridge)
- **Dispositivo Android** conectado via USB ou Wi-Fi

### Engines de execucao

| Engine | Obrigatorio | Instalacao |
|---|---|---|
| UIAutomator2 | Sim (ja incluso no daemon) | `pip install uiautomator2` |
| Maestro | **Sim** | Ver abaixo |

### Instalar Maestro (obrigatorio)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Apos instalar, verificar:
```bash
maestro --version
```

---

## Setup inicial (primeira vez)

```bash
# 1. Instalar dependencias Node.js
pnpm install

# 2. Criar e configurar o venv do daemon
cd apps/daemon
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../..

# 3. Configurar variaveis de ambiente

# Daemon (apps/daemon/.env)
cat > apps/daemon/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...anon_key...
SUPABASE_SERVICE_KEY=eyJ...service_role_key...
EOF

# IMPORTANTE: SUPABASE_SERVICE_KEY e a "service_role" key do Supabase.
# Encontre em: Supabase Dashboard > Settings > API > service_role (secret)
# Sem ela, testes serao salvos localmente em /data/test_cases/ (fallback)

# Web (apps/web/.env.local)
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_DAEMON_URL=http://localhost:8001
NEXT_PUBLIC_API_URL=http://localhost:3001
EOF

# API Fastify (apps/api/.env)
cat > apps/api/.env << 'EOF'
PORT=3001
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role_key...
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
DEFAULT_ORG_SLUG=foxbit
INTEGRATIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)
EOF
```

> `INTEGRATIONS_ENCRYPTION_KEY` é gerada automaticamente pelo `start.sh` se não existir. **Anote essa chave em local seguro** — se você perdê-la, todas as credenciais cifradas em `org_integrations` (Google Sheets, Jira) viram lixo.

---

## Como rodar

### Opcao 1: Script automatico (recomendado)

```bash
./start.sh
```

Isso faz tudo: mata processos antigos, verifica dependencias, sobe o daemon e o frontend.

### Opcao 2: Manual (passo a passo)

#### 1. Matar processos das portas

```bash
lsof -ti:3000,3001,8001 | xargs kill -9 2>/dev/null
```

#### 2. Subir o daemon Python (porta 8001)

```bash
cd apps/daemon
source venv/bin/activate
python main.py &
cd ../..
```

Aguardar ate ver `Started server on 0.0.0.0:8001` no terminal.

#### 3. Subir o frontend (porta 3000)

```bash
pnpm dev
```

#### 4. Acessar

- **Dashboard:** http://localhost:3000
- **Daemon API:** http://localhost:8001

---

## Verificar que tudo esta rodando

```bash
# Health check do daemon
curl http://localhost:8001/health

# Status das engines (UIAutomator2 + Maestro)
curl http://localhost:8001/api/engines/status

# Listar devices conectados
curl http://localhost:8001/devices
```

---

## Como usar

### 1. Conectar dispositivo

- Conectar Android via USB (ou `adb connect IP:PORTA` para Wi-Fi)
- No dashboard, clicar no icone de dispositivo e selecionar

### 2. Criar teste com IA (Path A)

1. Escolher a **engine** no combobox: `UIAutomator2` ou `Maestro`
2. Escrever o prompt em linguagem natural
3. Clicar em **Gerar Tests**
4. Revisar os steps gerados
5. Clicar em **EXECUTAR TESTE**

### 3. Gravar teste (Path B)

1. Escolher a engine
2. Clicar em **Gravar Testes**
3. Interagir com o app pela tela espelhada
4. Clicar em **Parar**
5. Revisar e salvar (Maestro mostra preview do YAML editavel)
6. Executar

### Maestro: variaveis de ambiente

Se o YAML gerado usa `${SENHA}` ou `${EMAIL}`, um modal pedira os valores antes de executar. Os valores sao mascarados nos logs.

---

## Estrutura do projeto

```
qa-ai/
  apps/
    daemon/           # Backend Python (FastAPI, porta 8001)
      ai/             # Prompt parser, vision, orchestrator
      android/        # UIAutomator2 executor, scrcpy, recorder
      engines/        # Maestro runner e validador YAML
      routes/         # Rotas REST (engines, device_input)
      ws/             # WebSocket server e stream manager
      main.py         # Entry point
    api/              # Backend Node.js (Fastify, porta 3001)
      src/routes/     # integrations.ts, qa-journey.ts
      src/services/   # google-sheets, encryption, cron, snapshots
      src/plugins/    # cors, websocket, supabase (lazy)
    web/              # Frontend Next.js (porta 3000)
      src/app/        # Pages (dashboard, editor, logs, qa-journey, settings)
      src/components/ # Componentes React
      src/hooks/      # Hooks (scrcpy stream, execution socket)
      src/store/      # Zustand stores
  flows/              # YAMLs Maestro gerados (por projeto)
  logs/               # Logs de execucao, gravacao, device
  packages/           # Pacotes compartilhados
```

---

## Integracoes externas (Jornada do QA — Etapa 9)

A area `/dashboard/qa-journey` sincroniza dados de fontes externas. As credenciais sao gerenciadas em `/dashboard/settings/integrations` (cifradas com AES-256-GCM em `org_integrations`).

### Google Sheets — passo a passo

1. **GCP Console** → criar/escolher projeto: https://console.cloud.google.com/
2. **Habilitar Google Sheets API** no projeto: https://console.cloud.google.com/apis/library/sheets.googleapis.com
3. **Criar Service Account**: https://console.cloud.google.com/iam-admin/serviceaccounts
   - Nome: `qamind-sheets-reader` (ou outro)
   - Pode pular roles e usuarios — service account so precisa acessar planilhas que voce compartilhar
4. **Gerar chave JSON**: na conta de servico criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → tipo **JSON** → Criar (download automatico)
5. **Compartilhar planilhas** com o `client_email` da JSON (permissao **Leitor**). Planilhas devem estar no formato **nativo Google Sheets** — `.xlsx` no Drive nao funciona, converter via Arquivo > Salvar como Planilhas Google.
6. **Configurar no QAMind**: `/dashboard/settings/integrations` → card Google Sheets → "Configurar" → colar JSON → "Salvar credenciais" → "Testar conexao"

### Jira (read-only) — passo a passo

> Integracao Jira tem schema + UI prontos. A sincronizacao em si (`services/jira-sync.ts`) sera ativada quando integrar com cliente real.

1. **Gerar API token** em https://id.atlassian.com/manage-profile/security/api-tokens
2. **Configurar no QAMind**: `/dashboard/settings/integrations` → card Jira → host (ex: `foxbit.atlassian.net`), e-mail, token → "Salvar credenciais"
3. Em prod: vincular projetos Jira ao projeto QAMind em tabela `qa_journey_jira_projects` (sera UI dedicada na ativacao)

### Cron jobs registrados em `apps/api`

| Cron | Quando | O quê |
|---|---|---|
| `0 7 * * *`  | Todo dia 7h (TZ Brasil) | Sync de `qa_journey_sheet_configs` ativos com Google Sheets |
| `0 23 * * 0` | Domingo 23h | Snapshot semanal de KPIs por projeto em `qa_journey_snapshots` |

Triggar manualmente:
```bash
curl -X POST "http://localhost:3001/qa-journey/sync/<configId>"
curl -X POST "http://localhost:3001/qa-journey/snapshots/run?projectId=<projectId>"
```

### Mock de demonstração (projeto Juntix)

Para popular o projeto **Juntix** com 6 jornadas, ~24 sub-fluxos, ~60 casos, 6 bugs e 9 semanas de snapshots históricos (demo executivo completo):

```bash
# Pre-condicao: projeto "Juntix" cadastrado em /dashboard/projects
cd apps/api && pnpm seed:juntix
```

O script é **idempotente** — deleta o estado anterior do mock antes de re-criar (não toca em outros projetos). Roda em ~5s. Após executar, abra:

- `/dashboard/qa-journey?project=<id-juntix>` — mapa visual
- `/dashboard/qa-journey/insights?project=<id-juntix>` — KPIs, treemap, timeline
- `/dashboard/qa-journey/admin?project=<id-juntix>` — admin

### Deploy em produção (Hostinger VPS via Dokploy)

Veja o guia passo-a-passo em [DEPLOY.md](DEPLOY.md). Resumo:

1. DNS: aponta `qamind.issqa.com.br` e `api.qamind.issqa.com.br` para a VPS
2. No Dokploy: cria serviço **Compose** apontando para `docker-compose.yml` na raiz
3. Cola as env vars (veja [.env.production.example](.env.production.example))
4. Configura domínios no Dokploy (SSL Let's Encrypt automático)
5. Deploy

O `apps/daemon` (Python, controle de Android) **não vai para a VPS** — continua local. Só `apps/web` + `apps/api` rodam em produção.

### Migrations Supabase

Aplicar no **SQL Editor** em ordem:
1. `supabase_setup.sql`
2. `supabase_migration_test_runs_bugs.sql`
3. `supabase_migration_qa_journey.sql` *(8 tabelas da Jornada do QA)*
4. `supabase_migration_organizations.sql` *(orgs + integrations cifradas)*

Para reverter (drop tabelas):
- `supabase_migration_qa_journey.down.sql`
- `supabase_migration_organizations.down.sql`

---

## Troubleshooting

### "Maestro nao encontrado"

O daemon procura o Maestro em:
1. PATH do sistema
2. `~/.maestro/bin/maestro`
3. `/opt/homebrew/bin/maestro`
4. `/usr/local/bin/maestro`

Se instalou e ainda nao encontra, reiniciar o daemon:
```bash
lsof -ti:8001 | xargs kill -9 2>/dev/null
cd apps/daemon && source venv/bin/activate && python main.py &
```

### Porta ja em uso

```bash
# Matar tudo de uma vez
lsof -ti:3000,3001,8001 | xargs kill -9 2>/dev/null
```

### Device nao aparece

```bash
adb devices          # Verificar se aparece
adb kill-server      # Reiniciar ADB
adb start-server
```

### Tela espelhada travou

Reconectar o dispositivo no dashboard. O espelhamento usa scrcpy via WebSocket na porta 8001.
