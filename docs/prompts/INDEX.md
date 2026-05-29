# QAMind — Índice de Desenvolvimento
> Guia de navegação entre as partes do projeto

---

## 🗺️ Visão Geral das Partes

| Parte | Arquivo | Foco | Duração Est. |
|-------|---------|------|-------------|
| **1** | `parte-01-setup-infraestrutura.md` | Supabase, Next.js, Fastify, Auth, Schema | 1 semana |
| **2** | `parte-02-modulo-android.md` | ADB, uiautomator2, daemon Python, WebSocket | 2 semanas |
| **3** | `parte-03-orquestrador-ia.md` | Claude API, Prompt → Steps, Loop Visual | 2 semanas |
| **4** | `parte-04-editor-steps.md` | Editor frontend, drag-drop, versioning | 1,5 semanas |
| **5** | `parte-05-execucao-realtime.md` | Preview device, WebSocket RT, log ao vivo | 1,5 semanas |
| **6** | `parte-06-bug-engine-pdf.md` | Bug report IA, PDF profissional | 1 semana |
| **7** | `parte-07-dashboard-relatorios.md` | Dashboard, métricas, histórico | 1 semana |
| **8** | `parte-08-web-driver-saas.md` | Playwright, multi-tenant, Stripe, API | 2 semanas |

**Total estimado: 13 semanas (MVP completo)**

---

## 🔗 Dependências entre Partes

```
Parte 1 (Setup)
    ↓
Parte 2 (Android)  →  Parte 3 (IA)  →  Parte 5 (RT Interface)
                         ↓
                    Parte 4 (Editor)
                         ↓
                    Parte 6 (Bug Engine)
                         ↓
                    Parte 7 (Dashboard)
                         ↓
                    Parte 8 (Web + SaaS)
```

---

## 💡 Como usar estes arquivos como prompt para IA

1. Inicie cada sessão de desenvolvimento colando o conteúdo do arquivo `.md` da parte atual como **contexto inicial** para a IA
2. O arquivo já contém: objetivo, stack, estrutura de código, interfaces, critérios de conclusão e contratos para a próxima parte
3. Ao terminar uma parte, verifique todos os critérios de conclusão antes de avançar
4. Os "contratos para próxima parte" garantem que as integrações funcionem

---

## ⚡ Início Rápido — Comandos

```bash
# Clonar e instalar
git clone https://github.com/seu-usuario/qamind
cd qamind
pnpm install

# Subir tudo com Docker
docker compose up -d

# Frontend (Next.js)
cd apps/web && pnpm dev

# Backend (Fastify)
cd apps/api && pnpm dev

# Daemon Android (Python)
cd daemon && python main.py

# Aplicar migrations Supabase
supabase db push
```

---

## 🏗️ Contrato Central

O tipo `TestStep` é a base de tudo. Nunca alterar sem revisar todas as partes:

```typescript
interface TestStep {
  id: string;
  num: number;
  action: 'open_app'|'tap'|'type'|'swipe'|'scroll'|'longpress'|
          'wait'|'assert_text'|'assert_element'|'assert_url'|
          'back'|'home'|'screenshot'|'navigate';
  target?: string;
  value?: string;
  description?: string;
  timeout_ms?: number;
  screenshot_after?: boolean;
}
```
