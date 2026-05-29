# Deploy QAMind — Hostinger VPS + EasyPanel

> Sobe `apps/web` e `apps/api` em containers Docker, com SSL automático e domínios separados.
> O `apps/daemon` (Python, controle de Android) **NÃO** vai para a VPS — continua rodando local na sua máquina quando precisar usar o recorder/runner mobile.

---

## 0. Pré-requisitos

- VPS Hostinger com EasyPanel instalado e rodando
- Domínio `issqa.com.br` apontando para o IP da VPS (registro `A`)
- Acesso ao Supabase Dashboard (mesmo projeto usado em dev, ou crie um novo para prod)
- Conta GitHub conectada no EasyPanel (você já tem — vi a tela do `iss-qa/caixajunto`)

---

## 1. DNS — apontar dois subdomínios para a VPS

No painel DNS do seu domínio `issqa.com.br`:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| `A` | `qamind` | `<IP-da-VPS>` | 3600 |
| `A` | `api.qamind` | `<IP-da-VPS>` | 3600 |

Resultado:
- `qamind.issqa.com.br` → VPS
- `api.qamind.issqa.com.br` → VPS

Aguarde ~5 minutos para o DNS propagar (testar: `dig qamind.issqa.com.br`).

---

## 2. Push do código para o GitHub

Os arquivos novos do deploy precisam estar no GitHub para o EasyPanel clonar:

```bash
git add Dockerfile* apps/web/Dockerfile apps/api/Dockerfile docker-compose.yml .dockerignore .env.production.example DEPLOY.md apps/web/next.config.mjs
git commit -m "feat: deploy stack (Docker + Compose) para EasyPanel"
git push origin main
```

---

## 3. Criar projeto no EasyPanel

Se ainda não tem o projeto `issqa` no EasyPanel:

1. **EasyPanel → Projects → +**
2. Nome: `issqa` (ou `qamind` — sua escolha)

---

## 4. Criar o serviço Compose

Dentro do projeto:

1. **+ Create Service** → **Compose**
2. Nome: `qamind`
3. Aba **Source**:
   - Tipo: **Github**
   - Owner: `iss-qa` (sua organização — ajuste se for sua conta pessoal)
   - Repository: `qa-ai` (ou o nome do seu repo)
   - Branch: `main`
   - **Compose Path**: `docker-compose.yml` (na raiz)
   - Save
4. Aba **Environment**: cole todas as variáveis do `.env.production.example` com seus valores reais. **Atenção em 3 valores**:
   - `INTEGRATIONS_ENCRYPTION_KEY`: gere com `openssl rand -base64 32`. **Anote em local seguro.**
   - `SUPABASE_SERVICE_ROLE_KEY`: pegue em Supabase → Settings → API → service_role (secret)
   - `ANTHROPIC_API_KEY`: sua chave Anthropic
5. Aba **Domains**:
   - **+ Add Domain** para o serviço `web`:
     - Host: `qamind.issqa.com.br`
     - Path: `/`
     - Port: `3000`
     - HTTPS: ✅ (EasyPanel gera cert Let's Encrypt automaticamente)
   - **+ Add Domain** para o serviço `api`:
     - Host: `api.qamind.issqa.com.br`
     - Path: `/`
     - Port: `3001`
     - HTTPS: ✅

> Nota: as labels Traefik já estão no `docker-compose.yml`, então a aba Domains do EasyPanel pode até não ser necessária — mas configurar lá garante que o cert SSL é emitido. Os dois caminhos funcionam.

---

## 5. Aplicar as migrations no Supabase

Antes do primeiro deploy, garante que o Supabase de produção tem todas as tabelas:

No **SQL Editor** do projeto Supabase, rode em ordem:

Arquivos em [`supabase/migrations/`](../supabase/migrations/), aplicar em ordem crescente:

1. `001_setup.sql` (se for projeto novo)
2. `002_test_runs_bugs.sql`
3. `003_project_workspace.sql`
4. `004_test_app_id.sql`
5. `005_test_raw_yaml.sql`
6. `006_qa_journey.sql`
7. `007_organizations.sql`

Cada um é idempotente — pode rodar várias vezes.

---

## 6. Deploy

No EasyPanel, clica em **Deploy** no header do serviço Compose. Acompanha o log:

- **Pull do GitHub**: ~10s
- **Build do api** (Dockerfile multi-stage): ~2-3 min na primeira vez (cache vazio)
- **Build do web** (Next.js standalone): ~3-5 min na primeira vez
- **Subida dos containers**: ~30s

Status esperado: ambos `Running` e o `api` com healthcheck verde.

---

## 7. Validação

```bash
# Health da API (interno → deveria responder)
curl https://api.qamind.issqa.com.br/health
# → { "status": "ok", "timestamp": ... }

# Web sobe
curl -I https://qamind.issqa.com.br
# → HTTP/2 200
```

Abra `https://qamind.issqa.com.br` no browser:
- Login deve aparecer
- Após login, `/dashboard/qa-journey` deve mostrar projetos
- `/dashboard/settings/integrations` deve conseguir carregar (ou pelo menos não dar 500)

---

## 8. Próximos deploys

A partir de agora:
- Faça push em `main` → EasyPanel detecta (se webhook GitHub configurado) e re-deploy automático
- OU manual: EasyPanel → Compose service → Deploy

---

## Troubleshooting

### Build falha em "pnpm install"

Provavelmente `pnpm-lock.yaml` desatualizado. Local:
```bash
pnpm install
git add pnpm-lock.yaml && git commit -m "chore: update lockfile" && git push
```

### SSL não emite (Let's Encrypt timeout)

- Confirma o DNS já propagou (`dig qamind.issqa.com.br` deve mostrar o IP da VPS)
- Aguarda 5-10 min após primeira ativação do domain
- Verifica que a porta 80 da VPS está liberada (Traefik usa pra ACME challenge)

### "Backend Fastify offline" no browser

- API container não subiu ou está crashando
- Olha `Logs` do serviço `api` no EasyPanel
- Causa típica: env var faltando (`INTEGRATIONS_ENCRYPTION_KEY`, `SUPABASE_URL`, etc)

### "CORS error" no browser

- `CORS_ORIGIN` na API precisa bater EXATAMENTE com o protocolo+host do web
- Setar: `CORS_ORIGIN=https://qamind.issqa.com.br` (não `http`, não com `/` no final)

### NEXT_PUBLIC_* não atualiza após mudar no EasyPanel

- Esses são build-args do Next.js (inlinados no bundle)
- **Precisa rebuild** — não basta restart. EasyPanel → Deploy de novo após mudar a env.

### Migration ausente em prod

- Página acusa "tabela qa_journeys não existe"
- Rode os SQLs no SQL Editor do Supabase (passo 5)

### Daemon Python não funciona em prod

- **É esperado.** O daemon precisa de USB/ADB local.
- Para uso completo (recorder, runner mobile), o usuário roda `./start.sh` localmente — o web em prod aponta `NEXT_PUBLIC_DAEMON_URL=http://localhost:8001`, que **resolve no browser do usuário**.
- Em outras palavras: web em prod funciona; mobile recording só na máquina do usuário com daemon rodando.

---

## Custos e tamanhos

| Recurso | Tamanho |
|---|---|
| Imagem `qamind-web` | ~150 MB |
| Imagem `qamind-api` | ~200 MB |
| RAM em runtime | ~250 MB (web) + ~150 MB (api) |
| Disco para imagens | ~500 MB |
| Build time (primeira vez) | ~5-7 min |
| Build time (re-deploys com cache) | ~1-2 min |

Cabe folgado em VPS Hostinger plano básico (1 vCPU, 2GB RAM).
