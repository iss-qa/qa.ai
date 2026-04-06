# Soma.ai

> Sistema Operacional de Marketing Automatizado com IA

Marketing automatico para pequenas empresas. Voce atende, a Soma cuida das redes.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| Backend | Fastify 5 + TypeScript |
| Banco | MongoDB (Mongoose) |
| Fila | BullMQ + Redis |
| Monorepo | pnpm workspaces + Turborepo |
| Testes | Playwright |

---

## Requisitos

- **Node.js** >= 20
- **pnpm** >= 9
- **MongoDB** rodando em `localhost:27017`
- **Redis** rodando (qualquer porta, default `6380`)
- **Docker** (opcional, para subir Redis)

---

## Setup Local (Dev)

### 1. Clonar e instalar

```bash
git clone <repo-url> soma-ai
cd soma-ai
pnpm install
```

### 2. Configurar .env

```bash
cp .env.example .env
# Editar .env com suas credenciais
```

Variaveis essenciais para dev:

```env
MONGO_URI=mongodb://localhost:27017/soma_ai_dev
JWT_SECRET=soma_ai_secret_key_2026
JWT_EXPIRES_IN=7d
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
REDIS_URL=redis://localhost:6380
```

### 3. Subir Redis (se nao tiver)

```bash
docker run -d --name soma-redis -p 6380:6379 redis:7-alpine
```

MongoDB: use instalacao local ou Docker:
```bash
# Apenas se nao tiver MongoDB local
docker run -d --name soma-mongo -p 27017:27017 mongo:7
```

### 4. Seed do banco

```bash
npx tsx apps/api/src/seed.ts
```

Cria:
- Planos Starter e Pro
- Admin user: `admin@soma.ai` / `admin123`
- Configs de nicho (farmacia, pet)

### 5. Rodar em dev

```bash
# Tudo junto (API + Web)
pnpm dev

# Ou separado:
pnpm dev:api   # API em localhost:3001
pnpm dev:web   # Web em localhost:3000
```

### 6. Acessar

- **App:** http://localhost:3000
- **API:** http://localhost:3001
- **Login admin:** admin@soma.ai / admin123

---

## Testes

```bash
# Todos os testes
pnpm test

# Apenas testes da API (CRUD)
pnpm test:api

# Apenas testes E2E (UI)
pnpm test:e2e

# Apenas testes mobile
pnpm test:mobile

# Playwright UI interativo
pnpm test:ui
```

---

## Estrutura

```
soma-ai/
├── apps/
│   ├── api/           → Fastify (porta 3001)
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/         → 15 arquivos de rotas
│   │   │   ├── services/       → Meta, Evolution, Encryption
│   │   │   ├── workers/        → Post, Billing (BullMQ)
│   │   │   ├── queues/         → Post, Video, Billing
│   │   │   └── plugins/        → Auth (JWT), Redis
│   │   └── seed.ts
│   └── web/           → Next.js (porta 3000)
│       └── src/
│           ├── app/
│           │   ├── login/          → Autenticacao
│           │   ├── app/            → Painel Company (11 paginas)
│           │   └── admin/          → Painel Admin (8 paginas)
│           ├── components/
│           │   ├── ui/             → shadcn/ui (14 componentes)
│           │   ├── company/        → MetricCard, PostItem, FeatureGate
│           │   └── admin/          → StatusBadge, AlertItem
│           ├── lib/                → api client, utils
│           └── store/              → Zustand (auth)
├── packages/
│   ├── db/            → Mongoose (20 models)
│   └── shared/        → Enums, Types, Constants
├── tests/e2e/         → Playwright (6 arquivos de teste)
└── docker-compose.yml
```

---

## Deploy em Producao

### O que mudar no .env

```env
# App
NODE_ENV=production
APP_URL=https://soma.ai
API_URL=https://api.soma.ai

# MongoDB (Atlas ou self-hosted)
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/soma_ai_prod

# Redis (mesma VPS ou managed)
REDIS_URL=redis://localhost:6379

# JWT (gerar chave forte)
JWT_SECRET=<gerar-com-openssl-rand-base64-64>

# Encryption (gerar chave de 32 chars)
ENCRYPTION_KEY=<gerar-com-openssl-rand-hex-16>

# Meta Graph API
META_APP_ID=<seu-app-id>
META_APP_SECRET=<seu-app-secret>
META_REDIRECT_URI=https://api.soma.ai/api/webhooks/meta/callback

# Evolution API
EVOLUTION_API_URL=<sua-url-evolution>
EVOLUTION_API_KEY=<sua-chave>

# Cloudflare R2
R2_ACCOUNT_ID=<seu-account-id>
R2_ACCESS_KEY_ID=<sua-chave>
R2_SECRET_ACCESS_KEY=<seu-secret>
R2_BUCKET_NAME=soma-ai-media
R2_PUBLIC_URL=https://media.soma.ai
```

### Gerar chaves seguras

```bash
# JWT Secret
openssl rand -base64 64

# Encryption Key (32 chars)
openssl rand -hex 16
```

### Build

```bash
pnpm build
```

### Docker Compose Producao

```bash
# Subir tudo (Mongo + Redis + API + Web + Caddy)
docker-compose --profile full up -d
```

Ou com o docker-compose.prod.yml (criar separado):

```yaml
services:
  web:
    build: ./apps/web
    environment:
      - NODE_ENV=production
    restart: always

  api:
    build: ./apps/api
    environment:
      - NODE_ENV=production
    restart: always

  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: always

volumes:
  caddy_data:
```

### Caddyfile (SSL automatico)

```
soma.ai {
    reverse_proxy web:3000
}

api.soma.ai {
    reverse_proxy api:3001
}
```

### Deploy manual em VPS

```bash
# 1. SSH na VPS
ssh user@vps-ip

# 2. Clonar
git clone <repo> /opt/soma-ai
cd /opt/soma-ai

# 3. Instalar deps
pnpm install --frozen-lockfile

# 4. Configurar .env de producao
cp .env.example .env
nano .env  # preencher variaveis de prod

# 5. Build
pnpm build

# 6. Seed (primeira vez)
npx tsx apps/api/src/seed.ts

# 7. Iniciar com PM2
npm install -g pm2
pm2 start apps/api/dist/server.js --name soma-api
cd apps/web && pm2 start npm --name soma-web -- start
pm2 save
pm2 startup
```

### Checklist de producao

- [ ] `.env` com variaveis de prod
- [ ] `NODE_ENV=production`
- [ ] JWT_SECRET forte (>= 64 chars)
- [ ] ENCRYPTION_KEY segura (32 chars)
- [ ] MongoDB Atlas ou backup configurado
- [ ] SSL via Caddy ou Cloudflare
- [ ] Meta Graph API app em modo Live
- [ ] Evolution API conectada
- [ ] PM2 ou Docker com restart: always
- [ ] Monitoramento (UptimeRobot)
- [ ] Backup automatico do MongoDB

---

## Planos

| | Starter | Pro |
|---|---------|-----|
| Setup | R$ 297 | R$ 497 |
| Mensal | R$ 39,90 | R$ 69,90 |
| Cards | Ilimitado | Ilimitado |
| Instagram | Sim | Sim |
| Facebook | - | Sim |
| Videos | - | 2/dia |
| WhatsApp | - | Sim |
| Campanhas | - | Sim |

---

## Credenciais Dev

  Admin:     admin@soma.ai / admin123
  Pet Shop:  maria@petshopamigo.com / demo123 - Pro
  Farmacia:  joao@farmaciacentral.com / demo123 - Starter


> Todas criadas automaticamente pelo `npx tsx apps/api/src/seed.ts`
