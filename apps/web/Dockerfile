# =====================================================
# QAMind Web (Next.js 14) — Dockerfile multi-stage
# Build context = raiz do monorepo (necessario pra pnpm workspaces)
# Saida: imagem ~150MB com Next.js standalone
# =====================================================

# ----- Stage 1: deps (cache de dependencias pnpm) -----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copia so os manifestos para maximizar cache do Docker
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Instala apenas as deps do web (e seus workspace deps)
RUN pnpm install --frozen-lockfile --filter=web...

# ----- Stage 2: builder (compila Next.js) -----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Vars publicas precisam estar disponiveis no build (Next inlina no bundle).
# Default embutido garante que o build NUNCA gere bundle com `undefined` mesmo
# se o orquestrador (EasyPanel/Dokploy) nao repassar o Environment como build-arg.
# Sao valores publicos (anon key publishable + URLs publicas), por isso podem
# ficar no repo. O segredo real (service_role) vive apenas no apps/api.
ARG NEXT_PUBLIC_SUPABASE_URL=https://tfxxgbujcvtjgqccfcae.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_y9GZSB7YgOY5-87MWMw5lw_J-YgdifD
ARG NEXT_PUBLIC_API_URL=https://api.qamind.issqa.com.br
ARG NEXT_PUBLIC_DAEMON_URL=http://localhost:8001
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DAEMON_URL=$NEXT_PUBLIC_DAEMON_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Copia node_modules instalados na stage anterior
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copia o codigo fonte
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig*.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

RUN pnpm --filter web build

# Garante que apps/web/public exista mesmo quando o unico conteudo
# (maestro-studio/) esta git/docker-ignored — o estagio runner faz COPY desse
# diretorio e o build falha com "not found" se ele nao existir.
RUN mkdir -p apps/web/public

# ----- Stage 3: runner (imagem final, minima) -----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Usuario nao-root por seguranca
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output do Next.js ja vem com tudo que precisa
# (incluindo node_modules apenas das deps usadas em runtime)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
