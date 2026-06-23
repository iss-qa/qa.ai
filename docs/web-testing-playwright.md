# Testes Web (Playwright via GitHub Actions)

Projetos com `platform = 'web'` no QAMind rodam testes **Playwright** a partir de
um repositório GitHub próprio, disparados via **GitHub Actions** (`workflow_dispatch`).
Os resultados voltam para o QAMind via **push**: o CI faz `POST` do report JSON do
Playwright para um endpoint de ingestão.

## Fluxo

```
QA aperta "Rodar Testes" no QAMind
  → API dispara workflow_dispatch (passa qamind_run_id como input)
  → GitHub Actions roda Playwright (--reporter=json)
  → passo final faz POST do report para {QAMIND_INGEST_URL}/web-runs/{qamind_run_id}/ingest
  → QAMind parseia, grava resultados e atualiza os casos da Jornada
```

## Configuração no QAMind

1. **Integração GitHub** (uma vez por organização):
   Configurações → Integrações → GitHub → cole um Personal Access Token com escopos
   `actions:write` + `contents:read` (repo `foxbit-group/...`).
2. **Conectar repositório** (por projeto Web):
   Página do projeto → *Conectar Repositório*. Informe `owner`, `repo`, branch,
   o arquivo do workflow (ex.: `playwright.yml`) e a pasta dos specs.
   Ao salvar, o QAMind gera um **token de ingestão** exibido **uma única vez** —
   copie o `QAMIND_INGEST_TOKEN` e o `QAMIND_INGEST_URL`.

## Configuração no repositório de testes (POC)

### `playwright.config.ts`

Garanta o reporter `json` (além dos que você já usa para artifacts):

```ts
export default defineConfig({
  reporter: [
    ['json', { outputFile: 'report.json' }],
    ['html', { open: 'never' }], // opcional: artifact de trace/vídeo
  ],
  use: { trace: 'on-first-retry', video: 'retain-on-failure' },
});
```

### Secrets do repositório

- `QAMIND_INGEST_URL` — **URL base pública** da API do QAMind (ver opções abaixo).
- `QAMIND_INGEST_TOKEN` — token gerado ao conectar o repositório no QAMind.

> Para este fluxo, não use `QAMIND_API_KEY`: o endpoint de ingestão valida
> especificamente o header `x-ingest-token` com `${{ secrets.QAMIND_INGEST_TOKEN }}`.

> `QAMIND_INGEST_URL` é só a base — **sem** `/web-runs/.../ingest`. O workflow monta
> o caminho completo a cada execução: `{QAMIND_INGEST_URL}/web-runs/${{ inputs.qamind_run_id }}/ingest`.

### Qual URL pública usar

O runner do GitHub Actions roda na nuvem e **não enxerga `localhost`**. Opções:

| Opção | URL | Quando usar |
|---|---|---|
| **Produção (recomendado)** | `https://api.qamind.issqa.com.br` | Já existe (EasyPanel + Traefik/SSL). Garanta que o deploy tem o código de `web-runs` e a env `QAMIND_INGEST_URL`. |
| **Túnel ngrok** | `https://xxxx.ngrok-free.app` | Teste local. Rode `pnpm --filter api tunnel` (= `ngrok http 3001`), defina `QAMIND_INGEST_URL` igual à URL do ngrok e **reconecte** o repositório para o token/URL saírem certos. A URL muda a cada restart do ngrok (grátis). |

Defina `QAMIND_INGEST_URL` na env da API para que a tela "Repositório conectado" mostre a
base correta automaticamente. `PUBLIC_API_URL` continua aceito como alias legado.

### Workflow `.github/workflows/playwright.yml`

```yaml
name: Playwright (QAMind)
on:
  workflow_dispatch:
    inputs:
      qamind_run_id: { description: 'ID do run no QAMind', required: true }
      spec:          { description: 'Spec/filtro (opcional)', required: false }
      env:           { description: 'Ambiente (opcional)', required: false }

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps

      # continue-on-error: queremos ingerir o resultado mesmo se houver falhas
      - name: Run Playwright
        continue-on-error: true
        run: npx playwright test ${{ inputs.spec }}
        env:
          TEST_ENV: ${{ inputs.env }}

      - name: Enviar resultados ao QAMind
        if: always()
        run: |
          curl -sS -X POST \
            "${{ secrets.QAMIND_INGEST_URL }}/web-runs/${{ inputs.qamind_run_id }}/ingest?gh_run_id=${{ github.run_id }}&gh_run_url=${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}&commit=${{ github.sha }}" \
            -H "x-ingest-token: ${{ secrets.QAMIND_INGEST_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data @report.json
```

> O endpoint de ingestão valida o `x-ingest-token` (hash sha-256 comparado com o
> guardado em `web_test_configs`). Os parâmetros de query `gh_run_id`, `gh_run_url`
> e `commit` são opcionais, mas enriquecem o histórico no QAMind.

## Mapeamento para a Jornada

Cada resultado é casado com um caso de Jornada cujo `playwright_spec` bate com o
arquivo do spec (igual ou sufixo) e `automation_engine = 'playwright'`. O caso
recebe `last_run_status` (pass/fail/skipped) e `last_run_at`. Specs sem caso
vinculado aparecem só no detalhe da execução.

## Tudo dentro do perímetro Foxbit

O repositório vive em `github.com/foxbit-group/*` e a ingestão é interna (API do
QAMind). Nenhum dado sai do perímetro.
