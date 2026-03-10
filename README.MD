# QAMind - IA Powered Test Automation

QAMind é uma plataforma de automação de testes de próxima geração que utiliza IA para converter linguagem natural em steps executáveis, orquestra execuções em dispositivos reais (Android) ou navegadores (Web), e gera relatórios de bugs automáticos com PDFs.

## 🏗️ Estrutura do Projeto

O projeto é um monorepo gerenciado por **pnpm** e **Turborepo**:

- `apps/api`: Servidor Backend (Fastify) para gestão de dados e SaaS.
- `apps/daemon`: O motor de execução em Python (FastAPI).
- `apps/web`: Frontend Next.js (Dashboard e Editor).
- `packages/*`: Bibliotecas compartilhadas.

---

## 🚀 Como Iniciar (Automação)

Para subir todos os ambientes (API, Daemon e Web) de uma só vez, use o script de automação na raiz:

```bash
./start.sh
```

Ou, se preferir usar o comando padrão do monorepo:
```bash
pnpm install
pnpm dev
```

> **Nota:** O comando `pnpm dev` agora gerencia os três serviços simultaneamente via Turborepo.

---

## 🛠️ Configuração Manual

### 1. Pré-Requisitos
- **Node.js**: v20 ou superior.
- **pnpm**: `npm install -g pnpm`.
- **Python**: v3.10 ou superior.
- **Playwright**: `playwright install chromium`.

### 2. Configuração do Daemon (Python)
Se precisar rodar o Daemon separadamente:

1. Navegue até: `cd apps/daemon`
2. Instale as dependências usando o venv da raiz:
   ```bash
   ../../.venv/bin/pip install -r requirements.txt
   ```
3. Execute:
   ```bash
   ../../.venv/bin/python main.py
   ```

### 3. Variáveis de Ambiente
Certifique-se de configurar o arquivo `.env` em `apps/daemon`:
```env
ANTHROPIC_API_KEY=sua_chave
SUPABASE_URL=seu_url
SUPABASE_KEY=sua_key
```

---

## 🧪 Como Testar

1. Inicie o projeto com `./start.sh`.
2. Acesse `http://localhost:3000`.
3. Crie um caso de teste no Editor.
4. Escolha a plataforma (Android ou Web).
5. Clique em **Executar Teste**.
6. Acompanhe o log em tempo real e verifique o **Bug Tracker** em caso de falhas.

---

## 🛠 Tech Stack
- **Frontend**: Next.js 14, Tailwind CSS, Lucide, Recharts, TanStack Table.
- **Backend API**: Fastify (SaaS layer).
- **Engine Daemon**: FastAPI (Python automation layer).
- **IA**: Anthropic Claude 3.5 Sonnet.
- **Infra**: Supabase (DB, Storage), Stripe (Billing).
