#!/bin/bash

# QAMind Startup Tool

# Aumentar limite de arquivos (Previne EMFILE errors no MacOS e problemas no TS Server)
ulimit -n 65536 2>/dev/null || true

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== QAMind Startup Tool ===${NC}"

# 1. Limpeza de processos antigos (prevenção de EADDRINUSE)
echo -e "${GREEN}Limpando processos anteriores nas portas 3000 e 3001...${NC}"
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null || true

# 2. Verificar pnpm
if ! command -v pnpm &> /dev/null
then
    echo -e "${RED}Erro: pnpm não encontrado. Por favor, instale com 'npm install -g pnpm'${NC}"
    exit 1
fi

# 3. Instalar dependências se necessário
echo -e "${GREEN}Verificando dependências Node.js...${NC}"
pnpm install

# 4. Iniciar Serviços (API e WEB)
echo -e "${GREEN}Iniciando API e WEB com Turborepo...${NC}"
echo -e "${BLUE}Dashboard disponível em http://localhost:3000${NC}"
echo -e "${BLUE}Pressione Ctrl+C para encerrar.${NC}"

# Rodar API e WEB
pnpm turbo run dev --filter=api --filter=web
