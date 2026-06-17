# =====================================================
# QAMind API (Fastify) — Dockerfile multi-stage
# Build context = raiz do monorepo (pnpm workspaces)
# Saida: imagem ~200MB
# =====================================================

# ----- Stage 1: deps + build -----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Manifestos primeiro (cache)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --filter=api...

# Codigo
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY tsconfig*.json ./

RUN pnpm --filter api build

# ----- Stage 2: runner -----
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Usuario nao-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify

# Instala apenas deps de producao (sem devDependencies)
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --prod --frozen-lockfile --filter=api...

# Copia o build compilado
COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist ./apps/api/dist

USER fastify

EXPOSE 3001

# Health check para o Docker / Dokploy / Traefik
# IMPORTANTE: usar 127.0.0.1, NAO "localhost". No Alpine/busybox "localhost"
# resolve para ::1 (IPv6) primeiro, e o Fastify so faz bind IPv4 (host 0.0.0.0),
# entao "localhost" da Connection refused -> healthcheck falha eternamente ->
# o orquestrador (EasyPanel/Traefik) marca unhealthy e entra em restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
