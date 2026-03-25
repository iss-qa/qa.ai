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
EOF
```

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
    web/              # Frontend Next.js (porta 3000)
      src/app/        # Pages (dashboard, editor, logs)
      src/components/ # Componentes React
      src/hooks/      # Hooks (scrcpy stream, execution socket)
      src/store/      # Zustand stores
  flows/              # YAMLs Maestro gerados (por projeto)
  logs/               # Logs de execucao, gravacao, device
  packages/           # Pacotes compartilhados
```

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
