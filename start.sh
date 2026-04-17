#!/bin/bash

# QAMind Startup Tool
set -euo pipefail

# Aumentar limite de arquivos (Previne EMFILE errors no MacOS)
ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || ulimit -n 4096 2>/dev/null || true
echo "  [ulimit] open files limit: $(ulimit -n)"

# Force Watchpack to use polling instead of native fsevents watchers.
# This avoids EMFILE errors when macOS maxfiles limit is low.
export WATCHPACK_POLLING=true

# ── Cores ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

OK="${GREEN}✔${NC}"
FAIL="${RED}✘${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${BLUE}→${NC}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_DIR="$ROOT_DIR/apps/daemon"
DAEMON_LOG="$DAEMON_DIR/daemon_output.log"
DAEMON_VENV="$ROOT_DIR/.venv/bin/python"

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║        QAMind — Startup Tool         ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Matar processos anteriores nas portas usadas ────────────────────────────
echo -e "${INFO} Limpando processos nas portas 3000, 3001, 8001..."
lsof -ti:3000,3001,8001 | xargs kill -9 2>/dev/null || true
sleep 1
echo -e "  ${OK} Portas livres."

# ── 1b. Avisar o usuário sobre cache do browser ──────────────────────────────
echo ""
echo -e "${WARN} ${BOLD}IMPORTANTE:${NC} se estiver com o browser aberto na aplicação,"
echo -e "   feche a aba do QAMind antes de continuar OU faça ${BOLD}Cmd+Shift+R${NC}"
echo -e "   (hard refresh) depois que o servidor iniciar."

# ── 2. Verificar dependências de sistema ───────────────────────────────────────
echo ""
echo -e "${INFO} Verificando dependências..."

check_cmd() {
    if command -v "$1" &>/dev/null; then
        echo -e "  ${OK} $1 encontrado: $(command -v "$1")"
        return 0
    else
        echo -e "  ${FAIL} $1 não encontrado"
        return 1
    fi
}

check_cmd pnpm || { echo -e "${RED}Instale: npm install -g pnpm${NC}"; exit 1; }
check_cmd node

# ADB — adiciona Homebrew ao PATH se necessário
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if check_cmd adb; then
    ADB_PATH="$(command -v adb)"
else
    echo -e "  ${WARN} ADB não encontrado — dispositivos Android não serão detectados"
    ADB_PATH=""
fi

# Python venv
if [ -f "$DAEMON_VENV" ]; then
    echo -e "  ${OK} Python venv: $DAEMON_VENV"
else
    echo -e "  ${FAIL} venv não encontrado em $DAEMON_VENV"
    echo -e "  ${INFO} Criando venv e instalando dependências..."
    python3 -m venv "$ROOT_DIR/.venv"
    "$ROOT_DIR/.venv/bin/pip" install -r "$DAEMON_DIR/requirements.txt" -q
    echo -e "  ${OK} Dependências instaladas."
fi

# ── 3. Verificar dependências Python do daemon ─────────────────────────────────
echo ""
echo -e "${INFO} Verificando dependências Python..."
MISSING_PKGS=$("$DAEMON_VENV" -c "
import importlib, sys
pkgs = ['fastapi', 'uvicorn', 'uiautomator2', 'anthropic', 'playwright', 'dotenv']
missing = [p for p in pkgs if importlib.util.find_spec(p) is None]
print(' '.join(missing))
" 2>/dev/null || echo "check_failed")

if [ "$MISSING_PKGS" = "check_failed" ]; then
    echo -e "  ${WARN} Não foi possível verificar. Reinstalando requirements..."
    "$ROOT_DIR/.venv/bin/pip" install -r "$DAEMON_DIR/requirements.txt" -q
elif [ -n "$MISSING_PKGS" ]; then
    echo -e "  ${WARN} Pacotes faltando: ${MISSING_PKGS} — instalando..."
    "$ROOT_DIR/.venv/bin/pip" install -r "$DAEMON_DIR/requirements.txt" -q
    echo -e "  ${OK} Dependências instaladas."
else
    echo -e "  ${OK} Todas as dependências Python presentes."
fi

# ── 4. Verificar .env do daemon ────────────────────────────────────────────────
echo ""
echo -e "${INFO} Verificando variáveis de ambiente..."

check_env() {
    local file="$1"
    local var="$2"
    if [ -f "$file" ] && grep -q "^${var}=" "$file" 2>/dev/null; then
        local val
        val=$(grep "^${var}=" "$file" | cut -d= -f2-)
        if [ -n "$val" ]; then
            echo -e "  ${OK} ${var} configurado"
            return 0
        fi
    fi
    echo -e "  ${WARN} ${var} não encontrado em $file"
    return 1
}

check_env "$DAEMON_DIR/.env" "ANTHROPIC_API_KEY"
check_env "$DAEMON_DIR/.env" "SUPABASE_URL"
check_env "$ROOT_DIR/apps/web/.env.local" "NEXT_PUBLIC_SUPABASE_URL"
check_env "$ROOT_DIR/apps/web/.env.local" "NEXT_PUBLIC_SUPABASE_ANON_KEY"

# ── 5. Validar conectividade com Supabase ──────────────────────────────────────
echo ""
echo -e "${INFO} Testando conexão com Supabase..."

SUPA_URL=""
SUPA_KEY=""
if [ -f "$ROOT_DIR/apps/web/.env.local" ]; then
    SUPA_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$ROOT_DIR/apps/web/.env.local" | cut -d= -f2-)
    SUPA_KEY=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" "$ROOT_DIR/apps/web/.env.local" | cut -d= -f2-)
fi

if [ -n "$SUPA_URL" ] && [ -n "$SUPA_KEY" ]; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "${SUPA_URL}/rest/v1/projects?select=id&limit=1" \
        -H "apikey: ${SUPA_KEY}" \
        -H "Authorization: Bearer ${SUPA_KEY}" \
        --max-time 5 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        echo -e "  ${OK} Supabase acessível (HTTP $HTTP_STATUS)"
    else
        echo -e "  ${WARN} Supabase retornou HTTP $HTTP_STATUS — verifique as credenciais em apps/web/.env.local"
    fi
else
    echo -e "  ${WARN} Variáveis do Supabase não configuradas — pulando teste"
fi

# ── 6. Verificar e reiniciar ADB ───────────────────────────────────────────────
if [ -n "$ADB_PATH" ]; then
    echo ""
    echo -e "${INFO} Verificando ADB..."
    "$ADB_PATH" start-server &>/dev/null || true
    DEVICES=$("$ADB_PATH" devices 2>/dev/null | grep -v "List of" | grep "device$" | wc -l | tr -d ' ')
    if [ "$DEVICES" -gt 0 ]; then
        echo -e "  ${OK} $DEVICES dispositivo(s) Android conectado(s)"
        "$ADB_PATH" devices 2>/dev/null | grep "device$" | while read -r line; do
            echo -e "  ${INFO} ${line}"
        done
    else
        echo -e "  ${WARN} Nenhum dispositivo Android detectado — conecte via USB ou Wi-Fi"
    fi
fi

# ── 7. Verificar dependências Node.js ─────────────────────────────────────────
echo ""
echo -e "${INFO} Verificando dependências Node.js..."
if [ ! -d "$ROOT_DIR/node_modules" ]; then
    echo -e "  ${INFO} Instalando dependências..."
    (cd "$ROOT_DIR" && pnpm install --silent)
else
    echo -e "  ${OK} node_modules presente"
fi

# ── 7b. Limpar caches (Next.js, Turbo, Maestro Studio estático) ────────────────
echo ""
echo -e "${INFO} Limpando caches..."

# Next.js cache
if [ -d "$ROOT_DIR/apps/web/.next" ]; then
    rm -rf "$ROOT_DIR/apps/web/.next"
    echo -e "  ${OK} Next.js .next removido"
fi

# Turborepo cache
if [ -d "$ROOT_DIR/.turbo" ]; then
    rm -rf "$ROOT_DIR/.turbo"
    echo -e "  ${OK} Turbo .turbo removido"
fi

# Node module cache (helps com mudanças no tsconfig/build)
if [ -d "$ROOT_DIR/apps/web/.turbo" ]; then
    rm -rf "$ROOT_DIR/apps/web/.turbo"
fi
if [ -f "$ROOT_DIR/apps/web/tsconfig.tsbuildinfo" ]; then
    rm -f "$ROOT_DIR/apps/web/tsconfig.tsbuildinfo"
    echo -e "  ${OK} tsconfig.tsbuildinfo removido"
fi

# ── 7c. Re-extrair e re-patchear Maestro Studio (garante frontend atualizado) ──
MAESTRO_APP="/Applications/Maestro Studio.app"
MSS_DIR="$ROOT_DIR/apps/web/public/maestro-studio"
MSS_INDEX_HTML="$MSS_DIR/index.html"

if [ -d "$MAESTRO_APP" ]; then
    echo ""
    echo -e "${INFO} Atualizando frontend do Maestro Studio embutido..."

    # Preserve o nosso index.html com polyfills (ele não é gerado pelo asar)
    TMP_INDEX=""
    if [ -f "$MSS_INDEX_HTML" ] && grep -q "Polyfills" "$MSS_INDEX_HTML" 2>/dev/null; then
        TMP_INDEX=$(mktemp)
        cp "$MSS_INDEX_HTML" "$TMP_INDEX"
    fi

    # Re-extract via Node (lê o app.asar, respeitando padding de 4 bytes do Pickle)
    node -e "
    const fs = require('fs');
    const path = require('path');
    const asar = '$MAESTRO_APP/Contents/Resources/app.asar';
    const outDir = '$MSS_DIR';
    if (!fs.existsSync(asar)) { process.exit(2); }
    const buf = fs.readFileSync(asar);
    const hs = buf.readUInt32LE(12);
    const header = JSON.parse(buf.slice(16, 16 + hs).toString());
    const padded = (hs + 3) & ~3;
    const dataOffset = 16 + padded;
    function extract(node, base) {
      for (const [name, child] of Object.entries(node)) {
        const full = path.join(base, name);
        if (child.files !== undefined) {
          fs.mkdirSync(full, { recursive: true });
          extract(child.files, full);
        } else if (child.offset !== undefined) {
          const start = dataOffset + parseInt(child.offset);
          fs.writeFileSync(full, buf.slice(start, start + child.size));
        }
      }
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    extract(header.files.dist.files, outDir);
    " 2>/dev/null
    RC=$?

    if [ $RC -eq 2 ]; then
        echo -e "  ${WARN} Maestro Studio.app não encontrado — pulando extração"
    elif [ $RC -ne 0 ]; then
        echo -e "  ${WARN} Falha ao extrair — frontend pode estar desatualizado"
    else
        echo -e "  ${OK} Arquivos dist/ extraídos do app.asar"

        # Restaura/cria nosso index.html com polyfills
        if [ -n "$TMP_INDEX" ] && [ -f "$TMP_INDEX" ]; then
            mv "$TMP_INDEX" "$MSS_INDEX_HTML"
            echo -e "  ${OK} index.html com polyfills preservado"
        fi

        # Re-aplica o patch de URL (localhost:5050 → localhost:8001/mss)
        PATCH_COUNT=$(python3 -c "
import os, glob
base = '$MSS_DIR/assets'
n = 0
for p in glob.glob(os.path.join(base, '*.js')):
    with open(p, 'r', encoding='utf-8', errors='replace') as f:
        c = f.read()
    if 'localhost:5050' in c:
        c = c.replace('\"http://localhost:5050\"', '\"http://localhost:8001/mss\"')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(c)
        n += 1
print(n)
" 2>/dev/null || echo "0")
        echo -e "  ${OK} Patch de API URL aplicado em $PATCH_COUNT arquivo(s)"
    fi
fi

# ── 8. Iniciar o Daemon Python em background ──────────────────────────────────
echo ""
echo -e "${INFO} Iniciando daemon Python (porta 8001)..."
(cd "$DAEMON_DIR" && "$DAEMON_VENV" main.py >> "$DAEMON_LOG" 2>&1) &
DAEMON_PID=$!

# Aguardar daemon subir (máx 15s)
DAEMON_OK=false
for i in $(seq 1 15); do
    sleep 1
    if curl -s --max-time 1 "http://localhost:8001/health" &>/dev/null; then
        DAEMON_OK=true
        break
    fi
done

if $DAEMON_OK; then
    HEALTH=$(curl -s "http://localhost:8001/health" 2>/dev/null)
    CONNECTED=$(echo "$HEALTH" | grep -o '"devices_connected":[0-9]*' | cut -d: -f2 || echo "0")
    echo -e "  ${OK} Daemon rodando (PID $DAEMON_PID) — $CONNECTED dispositivo(s) detectado(s)"
else
    echo -e "  ${FAIL} Daemon não respondeu em 15s"
    echo -e "  ${INFO} Verifique o log: tail -30 $DAEMON_LOG"
    tail -15 "$DAEMON_LOG" 2>/dev/null | sed 's/^/      /'
fi

# ── 9. Iniciar Web + API com Turborepo ─────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════${NC}"
echo -e "${OK} Dashboard:  ${BOLD}http://localhost:3000${NC}"
echo -e "${OK} API:        ${BOLD}http://localhost:3001${NC}"
echo -e "${OK} Daemon:     ${BOLD}http://localhost:8001${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════${NC}"
echo -e "${YELLOW}Pressione Ctrl+C para encerrar tudo.${NC}"
echo ""

# Cleanup ao sair
cleanup() {
    echo ""
    echo -e "${INFO} Encerrando processos..."
    kill $DAEMON_PID 2>/dev/null || true
    lsof -ti:3000,3001,8001 | xargs kill -9 2>/dev/null || true
    echo -e "${OK} Encerrado."
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
pnpm turbo run dev --filter=api --filter=web
