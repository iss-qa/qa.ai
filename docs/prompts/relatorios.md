# Contexto e Objetivo
Você é um engenheiro de software Full-Stack sênior e especialista em UI/UX. O objetivo é criar uma tela completa e interativa de **Relatórios e Analytics** para uma plataforma de QA Automation / Gestão de Testes. 

Essa tela deve consolidar dados de todo o projeto (suítes de testes, execuções, histórico e criticidade) para fornecer insights profundos sobre a saúde do software, incluindo mapas de calor de vulnerabilidade (bug hotspots).

---

## 1. Arquitetura de Dados (O que a tela deve coletar e consolidar)
A tela deve simular ou consumir dados integrados de toda a aplicação, abrangendo:
*   **Visão Geral do Projeto:** Total de testes executados, taxa de sucesso (Pass/Fail ratio), tempo médio de execução e estabilidade geral.
*   **Mapeamento de Vulnerabilidades (Hotspots):** Identificar as áreas, módulos ou endpoints do projeto que acumulam o maior número de falhas históricas ou bugs reincidentes.
*   **Relatório Detalhado de Bugs:** Quebra de bugs por severidade (Bloqueante, Alta, Média, Baixa), tempo médio de resolução (MTTR) e status (Abertos, Em Correção, Validados).
*   **Performance da Automação:** Flaky tests (testes instáveis) identificados e gargalos de performance nos pipelines.

---

## 2. Componentes da Interface (UI/UX)
Crie uma interface moderna, limpa, responsiva e otimizada para dados densos. Inclua os seguintes blocos:

### A. Dashboard Cards (KPIs Rápidos)
*   Card 1: Taxa de Sucesso Atual (ex: `94.2%`) com indicador de tendência.
*   Card 2: Bugs Críticos Ativos (ex: `7`).
*   Card 3: Módulos com Alerta de Instabilidade (ex: `3`).
*   Card 4: Total de Automações Executadas (Últimos 30 dias).

### B. Seção de Gráficos e Analytics
*   **Gráfico de Tendência (Linha/Área):** Histórico de execuções (Sucesso vs. Falha) ao longo do tempo.
*   **Mapa de Calor / Treemap (Bug Hotspots):** Representação visual dos módulos do sistema (ex: `/auth`, `/checkout`, `/payment`) onde o tamanho e a cor do bloco indicam a volumetria e a gravidade dos bugs encontrados.
*   **Gráfico de Pizza/Donut:** Distribuição de bugs por severidade.

### C. Tabela Dinâmica de Módulos e Projetos
Uma tabela detalhada navegável com paginação, busca e filtros (por tag, ambiente, branch ou data):
*   Colunas: Nome do Módulo/Suíte, Qtd. de Testes, Última Execução, Taxa de Sucesso, Bugs Encontrados, Status de Risco (Estável, Alerta, Crítico).

---

## 3. Ações e Exportação (Funcionalidades Obrigatórias)
No topo da tela, deve haver uma barra de ações globais com as seguintes opções:

*   **Botão "Exportar PDF":** Deve gerar e baixar um relatório executivo formatado com os gráficos atuais, KPIs e a tabela de vulnerabilidades.
*   **Botão "Abrir no Google Docs / Editor":** Uma funcionalidade que simula a abertura/exportação dos dados estruturados para um documento editável (via integração de API ou gerando um arquivo `.docx`/Markdown para edição imediata).

---

## 4. Requisitos Técnicos e Stack
*   **Frontend:** React com Next.js (TypeScript).
*   **Estilização:** Tailwind CSS (use componentes limpos, boas margens, estados de hover e modo escuro se aplicável).
*   **Gráficos:** Utilize uma biblioteca moderna como `recharts`, `chart.js` ou `apexcharts`.
*   **Ícones:** `lucide-react` ou similar.
*   **Exportação:** Para o PDF, prepare a estrutura pensando em bibliotecas como `@react-pdf/renderer` ou `html2canvas` + `jspdf`.

---

## Entregáveis Esperados
1.  **Código do Componente Principal:** A estrutura da página de relatórios organizada em subcomponentes limpos.
2.  **Mock de Dados Completo:** Um arquivo ou estrutura de dados TypeScript contendo o histórico do projeto, módulos, bugs e estatísticas para alimentar a tela perfeitamente.
3.  **Funções de Handlers:** Os esqueletos das funções de clique para `handleExportPDF` e `handleOpenDocument`.