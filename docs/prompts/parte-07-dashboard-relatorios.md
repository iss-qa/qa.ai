# QAMind — Parte 7: Dashboard, Relatórios e Histórico
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1–6 concluídas. Dados de runs sendo salvos no Supabase.

---

## 🎯 Objetivo desta parte

Construir o dashboard central do produto e as páginas de relatórios: o usuário vê métricas, tendências, histórico de execuções, acessa relatórios detalhados de cada run e gerencia seus projetos e casos de teste.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| Gráficos | Recharts |
| Tabelas | TanStack Table |
| Filtros/busca | URL state (nuqs) |
| Datas | date-fns |
| Export | Browser download API |

---

## 🗺️ Páginas desta parte

```
/dashboard              → Overview geral
/projects               → Lista de projetos
/projects/[id]          → Detalhes do projeto + seus testes
/tests                  → Todos os casos de teste
/tests/[id]             → Detalhes do teste + histórico de runs
/runs/[id]              → Relatório completo de um run
/bugs                   → Lista de todos os bug reports
/bugs/[id]              → Bug report individual
```

---

## 📊 Dashboard Principal `/dashboard`

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Bom dia, [Nome] 👋   Projeto: [BancoX ▼]            │
├────────────┬────────────┬────────────┬───────────────┤
│ 47         │ 89%        │ 3          │ 12.4s          │
│ Testes     │ Taxa sucesso│ Bugs hoje  │ Duração média │
│ ▲ +3 hoje  │ ▲ +2% 7d   │ ▼ -1       │ ▼ -0.8s       │
├────────────┴────────────┴────────────┴───────────────┤
│  Taxa de Sucesso — Últimos 30 dias                   │
│  [gráfico de linha: passed vs failed por dia]        │
├───────────────────────────┬──────────────────────────┤
│  Execuções Recentes       │  Bugs por Severidade     │
│  [tabela últimos 5 runs]  │  [donut chart]           │
└───────────────────────────┴──────────────────────────┘
```

### Métricas (cards de KPI)

```typescript
interface DashboardMetrics {
  totalTestCases: number;
  totalTestCasesDelta: number;    // variação vs período anterior
  
  successRate: number;            // % de runs que passaram
  successRateDelta: number;       // variação em pontos percentuais
  
  bugsToday: number;
  bugsTodayDelta: number;
  
  avgDurationMs: number;
  avgDurationDelta: number;
  
  // Para o gráfico de linha
  dailyStats: Array<{
    date: string;
    passed: number;
    failed: number;
    total: number;
  }>;
  
  // Para o donut
  bugsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}
```

**Query SQL para métricas:**
```sql
-- Taxa de sucesso dos últimos 30 dias por projeto
with daily_runs as (
  select
    date_trunc('day', tr.created_at) as day,
    count(*) filter (where tr.status = 'passed') as passed,
    count(*) filter (where tr.status = 'failed') as failed,
    count(*) as total
  from test_runs tr
  join test_cases tc on tc.id = tr.test_case_id
  join projects p on p.id = tc.project_id
  where p.id = $1
    and tr.created_at >= now() - interval '30 days'
  group by 1
)
select * from daily_runs order by day;
```

---

## 📋 Histórico de Execuções — `/tests/[id]`

### Tabela de runs

```typescript
// Colunas:
const columns = [
  { id: 'run_number', header: '#', cell: ({ row }) => `#${row.run_number}` },
  { id: 'status',     header: 'Status', cell: StatusBadge },
  { id: 'device',     header: 'Dispositivo' },
  { id: 'duration',   header: 'Duração', cell: DurationCell },
  { id: 'steps',      header: 'Steps', cell: ({ row }) => `${row.passed_steps}/${row.total_steps}` },
  { id: 'created_at', header: 'Executado em', cell: RelativeTimeCell },
  { id: 'actions',    header: '', cell: ActionsCell },
]

// ActionsCell:
// [Ver detalhes] [▶ Re-executar] [📄 PDF] (se falhou e tem bug report)
```

### Visual do status:
```
● Passou     → badge verde
● Falhou     → badge vermelho
● Executando → badge azul pulsando
● Cancelado  → badge cinza
```

---

## 🔍 Página de Run Detalhado — `/runs/[id]`

```
┌──────────────────────────────────────────────────────┐
│  Run #47 — Login BancoX               [Exportar PDF] │
│  ❌ FALHOU · 42s · Pixel 7 · 06/03/2026 14:32        │
├──────────────────────────────────────────────────────┤
│  PROGRESSO DOS STEPS                                 │
│                                                      │
│  ✅ Step 1  Abrir app BancoX              1.2s       │
│  ✅ Step 2  Tap campo email               0.8s       │
│  ✅ Step 3  Digitar admin@teste.com       1.1s       │
│  ✅ Step 4  Tap campo senha               0.7s       │
│  ✅ Step 5  Digitar senha                 0.9s       │
│  ❌ Step 6  Clicar em Entrar              10.0s      │
│             "Elemento btn_login não encontrado"      │
├──────────────────────────────────────────────────────┤
│  TIMELINE VISUAL                                     │
│  [thumbnails dos screenshots de cada step]           │
├──────────────────────────────────────────────────────┤
│  BUG REPORT GERADO                                   │
│  🐛 "Botão de login ausente após preenchimento..."   │
│  Severidade: ALTA  [Baixar PDF] [Editar]             │
└──────────────────────────────────────────────────────┘
```

### Componentes

```tsx
// TimelineVisual: grade de thumbnails dos screenshots
// Ao clicar em um thumbnail → abre lightbox com imagem ampliada
// Step com falha → thumbnail com borda vermelha + ícone ❌

// StepProgressItem: item individual na lista de steps
// Mostra: ícone status, número, descrição, duração, análise IA (expandível)
```

---

## 🐛 Lista de Bugs — `/bugs`

```typescript
// Filtros disponíveis:
interface BugFilters {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  project_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;    // busca em título e summary
}

// Colunas da tabela:
// Severidade | Título | Projeto | Teste | Data | Actions
// [Ver] [Baixar PDF]

// Ordenação padrão: severity desc, created_at desc
```

---

## 📤 Export de Relatório do Run como PDF

```typescript
/**
 * Exportar relatório completo de um run (não confundir com bug report).
 * Este relatório documenta toda a execução: passou ou não.
 *
 * Conteúdo:
 * - Cabeçalho: nome do teste, status, data, dispositivo
 * - Lista de todos os steps com status, duração, descrição
 * - Screenshots de cada step
 * - Resumo: total de steps, % de sucesso, duração total
 * - Se falhou: incluir o bug report gerado pela IA
 *
 * Gerar no backend (Fastify endpoint):
 * POST /api/runs/{run_id}/export-pdf
 * Response: stream do PDF
 *
 * Frontend: botão [Exportar PDF] → fetch → download blob
 */
async function exportRunPDF(runId: string) {
  const response = await fetch(`/api/runs/${runId}/export-pdf`, { method: 'POST' });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `run-${runId}.pdf`;
  a.click();
}
```

---

## 🔔 Notificações por Email

```typescript
/**
 * Enviar email quando execução termina.
 * Usar Supabase Edge Functions com Resend.
 *
 * Triggers:
 * - Run concluído (passou): email simples com resumo
 * - Run falhou: email com bug report embutido + link para baixar PDF
 *
 * Template do email de falha:
 * Assunto: "❌ Teste 'Login BancoX' falhou — QAMind"
 * Corpo:
 *   - Nome do teste e projeto
 *   - Step que falhou com descrição
 *   - Screenshot do erro (embutido)
 *   - Link para o bug report PDF
 *   - Botão "Ver no QAMind"
 */
```

---

## 🔁 Funcionalidade de Re-executar Teste

```typescript
/**
 * Botão "Re-executar" em qualquer run da lista.
 * Comportamento:
 * 1. Verificar se há dispositivo online
 * 2. Se não → modal "Conecte um dispositivo"
 * 3. Se sim → POST /api/runs com test_case_id
 * 4. Redirecionar para /tests/[id]/run?run_id=[novo_run_id]
 *
 * Criar novo run com trigger: "manual"
 */
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] Dashboard exibe KPIs atualizados com dados reais do Supabase
- [ ] Gráfico de linha de taxa de sucesso dos últimos 30 dias renderiza corretamente
- [ ] Donut chart de severidade de bugs mostra proporções corretas
- [ ] Lista de execuções com paginação (20 por página), filtros e busca
- [ ] Página de run detalhado mostra todos os steps com status e duração
- [ ] Thumbnails dos screenshots na timeline clicáveis (lightbox)
- [ ] Link para bug report PDF quando run falhou
- [ ] Export PDF de run completo funciona e download inicia
- [ ] Lista de bugs com filtro por severidade e projeto
- [ ] Re-executar teste funciona e redireciona para execução em tempo real
- [ ] Seletor de projeto no header filtra todos os dados do dashboard
- [ ] Páginas carregam em < 2 segundos com dados reais
