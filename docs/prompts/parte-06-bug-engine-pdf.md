# QAMind — Parte 6: Bug Engine + Relatório PDF Automático
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1–5 concluídas. Loop de execução com IA funcionando.

---

## 🎯 Objetivo desta parte

Quando um teste falha, o Bug Engine entra em ação automaticamente: coleta todas as evidências (screenshots, steps, contexto do dispositivo), envia para o Claude gerar uma análise completa e produz um relatório PDF profissional com tudo documentado — pronto para o time de desenvolvimento.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| Geração de relatório | Claude claude-sonnet-4-20250514 (texto) |
| PDF | Puppeteer (HTML → PDF) |
| Templates HTML | Jinja2 (Python) |
| Upload PDF | Supabase Storage |
| Notificação | Supabase Realtime → frontend |

---

## 🗂️ Estrutura do Módulo

```
daemon/
└── bug_engine/
    ├── __init__.py
    ├── collector.py          # Coleta todas as evidências do run falho
    ├── ai_reporter.py        # Gera análise e bug report via Claude
    ├── pdf_generator.py      # Converte HTML → PDF via Puppeteer
    ├── templates/
    │   ├── bug_report.html   # Template HTML do relatório
    │   └── styles.css        # Estilos do PDF
    └── models.py             # BugReport dataclass
```

---

## 📊 collector.py — Coleta de Evidências

```python
"""
Coleta todas as evidências necessárias para o bug report.
Deve ser chamado imediatamente após um step falhar.
"""
from dataclasses import dataclass
from typing import Optional
import httpx

@dataclass
class RunEvidence:
    # Informações do teste
    test_case_name: str
    test_case_id: str
    run_id: str
    
    # Dispositivo
    device_name: str
    device_model: str
    android_version: str
    app_package: str
    app_version: str       # pegar via adb shell
    
    # Execução
    started_at: str
    failed_at: str
    total_duration_ms: int
    
    # Steps
    all_steps: list[dict]           # todos os steps com descrições
    failed_step_num: int
    failed_step_description: str
    failed_step_error: str
    
    # Screenshots
    screenshots: list[StepScreenshot]   # before/after de cada step
    failed_step_screenshot_url: str     # screenshot do momento do erro
    
    # Análise da IA (do loop de visão)
    last_ai_analysis: str | None    # última análise do VisionAnalyzer
    autocorrect_attempts: list[str] # tentativas de auto-correção

@dataclass
class StepScreenshot:
    step_num: int
    description: str
    status: str
    screenshot_url: str | None
    duration_ms: int

class EvidenceCollector:
    
    async def collect(self, run_id: str, failed_step_num: int) -> RunEvidence:
        """
        Coleta todas as evidências do run falho do Supabase.
        
        1. Buscar test_run por run_id (com join em test_cases e devices)
        2. Buscar todos os run_steps do run
        3. Buscar screenshots de cada step
        4. Pegar versão do app via ADB: adb shell dumpsys package <pkg> | grep versionName
        5. Montar e retornar RunEvidence
        """
        raise NotImplementedError
    
    async def _get_app_version(self, udid: str, package: str) -> str:
        """Busca a versão do app no dispositivo via ADB."""
        raise NotImplementedError
```

---

## 🤖 ai_reporter.py — Análise e Geração de Conteúdo

```python
"""
Usa o Claude para analisar as evidências e gerar o conteúdo do bug report.
"""
import anthropic
import base64
import json

BUG_REPORT_SYSTEM_PROMPT = """
Você é um QA Engineer sênior especialista em escrever bug reports claros e acionáveis.

Você receberá:
1. Informações do teste que falhou
2. Todos os steps executados com seus resultados
3. Screenshot do momento do erro
4. Análise visual anterior da IA

Sua tarefa é gerar um bug report completo no formato JSON especificado.

O bug report deve ser:
- CLARO: qualquer desenvolvedor deve entender sem contexto adicional
- ESPECÍFICO: descrever exatamente o que falhou, não generalidades
- ACIONÁVEL: o time de dev deve saber exatamente o que investigar
- CONCISO: sem repetições desnecessárias

RETORNE SOMENTE JSON VÁLIDO:
{
  "title": "título claro e específico do bug (máx 80 chars)",
  "severity": "critical|high|medium|low",
  "severity_justification": "por que esta severidade",
  "summary": "resumo em 2-3 frases do que aconteceu",
  "expected_behavior": "o que deveria acontecer no step que falhou",
  "actual_behavior": "o que realmente aconteceu",
  "root_cause_hypothesis": "hipótese sobre a causa raiz baseada nas evidências",
  "steps_to_reproduce": [
    "Passo 1: descrição clara",
    "Passo 2: ...",
    "Passo N: ..."
  ],
  "environment": {
    "device": "...",
    "android_version": "...",
    "app_version": "...",
    "timestamp": "..."
  },
  "impact": "impacto no usuário final",
  "suggested_investigation": "o que o dev deve verificar primeiro"
}

CRITÉRIOS DE SEVERIDADE:
- critical: funcionalidade principal completamente quebrada (login, pagamento, etc)
- high: funcionalidade importante quebrada mas há workaround
- medium: comportamento incorreto mas não bloqueia o uso principal
- low: problema cosmético ou edge case raro
"""

class AIReporter:
    
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
    
    async def generate_bug_report(self, evidence: RunEvidence) -> BugReportContent:
        """
        Gera o conteúdo do bug report via Claude.
        
        Implementação:
        1. Montar contexto textual com todos os steps e resultados
        2. Incluir screenshot do momento do erro como imagem base64
        3. Incluir screenshot do step anterior para comparação
        4. Chamar API com vision
        5. Parsear JSON e retornar BugReportContent
        """
        
        # Montar contexto textual
        steps_context = self._format_steps_for_prompt(evidence)
        
        # Preparar screenshots (falha + step anterior)
        failed_screenshot_b64 = await self._url_to_base64(evidence.failed_step_screenshot_url)
        
        # Step anterior para comparação (se existir)
        previous_screenshot_b64 = None
        if evidence.failed_step_num > 1:
            prev_step = next(
                (s for s in evidence.screenshots if s.step_num == evidence.failed_step_num - 1),
                None
            )
            if prev_step and prev_step.screenshot_url:
                previous_screenshot_b64 = await self._url_to_base64(prev_step.screenshot_url)
        
        content = [
            {
                "type": "text",
                "text": f"""
Teste: {evidence.test_case_name}
Dispositivo: {evidence.device_model} (Android {evidence.android_version})
App: {evidence.app_package} v{evidence.app_version}
Duração até falha: {evidence.total_duration_ms}ms

Steps executados:
{steps_context}

Step que falhou (#{evidence.failed_step_num}): {evidence.failed_step_description}
Erro: {evidence.failed_step_error}

Tentativas de auto-correção: {', '.join(evidence.autocorrect_attempts) if evidence.autocorrect_attempts else 'Nenhuma'}
Última análise da IA: {evidence.last_ai_analysis or 'Não disponível'}
                """
            }
        ]
        
        if previous_screenshot_b64:
            content.extend([
                {"type": "text", "text": "Screenshot do step ANTERIOR (funcionou):"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": previous_screenshot_b64}}
            ])
        
        content.extend([
            {"type": "text", "text": "Screenshot do step FALHO:"},
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": failed_screenshot_b64}}
        ])
        
        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=BUG_REPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}]
        )
        
        raise NotImplementedError("Parsear response e retornar BugReportContent")
    
    def _format_steps_for_prompt(self, evidence: RunEvidence) -> str:
        """
        Formata os steps de forma legível para o prompt.
        Ex:
          ✅ Step 1 (342ms): Abriu o app BancoX
          ✅ Step 2 (215ms): Clicou no campo de email
          ❌ Step 3 (FALHOU): Tentou clicar no botão Entrar — Elemento não encontrado
        """
        raise NotImplementedError
```

---

## 📄 pdf_generator.py — Geração do PDF

```python
"""
Converte o BugReportContent em um PDF profissional usando Puppeteer.
Estratégia: renderizar HTML com Jinja2 → Puppeteer converte para PDF.
"""
from jinja2 import Environment, FileSystemLoader
import subprocess
import tempfile
import os
import httpx

class PDFGenerator:
    
    TEMPLATE_DIR = "bug_engine/templates"
    
    async def generate(
        self,
        bug_report: BugReportContent,
        evidence: RunEvidence
    ) -> bytes:
        """
        Gera o PDF e retorna como bytes.
        
        1. Baixar todas as screenshots necessárias
        2. Converter para base64 para embed no HTML (PDF offline)
        3. Renderizar template HTML com Jinja2
        4. Salvar HTML temporário
        5. Chamar Puppeteer para converter HTML → PDF
        6. Ler e retornar bytes do PDF
        7. Limpar arquivos temporários
        """
        raise NotImplementedError
    
    async def _screenshots_to_base64(self, evidence: RunEvidence) -> dict[str, str]:
        """
        Baixa e converte screenshots para base64.
        Retorna dict: step_num → base64_string
        Limitar a no máximo 10 screenshots para não aumentar demais o PDF.
        """
        raise NotImplementedError
    
    def _render_html(
        self,
        bug_report: BugReportContent,
        evidence: RunEvidence,
        screenshots_b64: dict[str, str]
    ) -> str:
        """Renderiza o template HTML com todos os dados."""
        env = Environment(loader=FileSystemLoader(self.TEMPLATE_DIR))
        template = env.get_template("bug_report.html")
        return template.render(
            bug_report=bug_report,
            evidence=evidence,
            screenshots=screenshots_b64
        )
```

---

## 🎨 Template HTML do Bug Report — `bug_report.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    /* Reset e base */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, sans-serif; color: #1a1a2e; background: #fff; }
    
    /* Header do relatório */
    .header {
      background: linear-gradient(135deg, #1A3A5C, #4A90D9);
      color: white;
      padding: 32px 40px;
      margin-bottom: 0;
    }
    .header .product { font-size: 13px; opacity: 0.7; letter-spacing: 2px; text-transform: uppercase; }
    .header h1 { font-size: 24px; font-weight: 700; margin: 8px 0; line-height: 1.3; }
    .severity-badge {
      display: inline-block;
      padding: 4px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .severity-critical { background: #E74C3C; color: white; }
    .severity-high     { background: #E67E22; color: white; }
    .severity-medium   { background: #F0A500; color: white; }
    .severity-low      { background: #27AE60; color: white; }
    
    /* Seções */
    .section { padding: 24px 40px; border-bottom: 1px solid #eee; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #4A90D9;
      margin-bottom: 12px;
    }
    
    /* Metadados */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .meta-item { background: #F8FAFC; border-radius: 8px; padding: 12px; }
    .meta-label { font-size: 11px; color: #64748B; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; }
    
    /* Comparação expected vs actual */
    .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .expected { background: #F0FFF4; border-left: 4px solid #27AE60; padding: 16px; border-radius: 0 8px 8px 0; }
    .actual   { background: #FFF5F5; border-left: 4px solid #E74C3C; padding: 16px; border-radius: 0 8px 8px 0; }
    
    /* Steps para reproduzir */
    .steps-list { list-style: none; }
    .steps-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .step-number {
      width: 28px;
      height: 28px;
      background: #4A90D9;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
    
    /* Timeline de screenshots */
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 12px;
    }
    .screenshot-item { }
    .screenshot-item img {
      width: 100%;
      border-radius: 8px;
      border: 2px solid #eee;
    }
    .screenshot-item.failed img { border-color: #E74C3C; }
    .screenshot-item.passed img { border-color: #27AE60; }
    .screenshot-label {
      font-size: 11px;
      text-align: center;
      margin-top: 4px;
      color: #64748B;
    }
    
    /* IA Analysis box */
    .ai-box {
      background: linear-gradient(135deg, #EBF3FB, #F0EEFF);
      border: 1px solid #C7D8F0;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .ai-box .ai-label { font-size: 11px; color: #6B5B95; font-weight: 700; margin-bottom: 8px; }
    
    /* Footer */
    .footer {
      background: #F8FAFC;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #94A3B8;
    }
    
    /* Page break para PDF */
    .page-break { page-break-after: always; }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div class="product">QAMind — Bug Report Automático</div>
    <h1>{{ bug_report.title }}</h1>
    <div style="margin-top: 12px; display: flex; align-items: center; gap: 16px;">
      <span class="severity-badge severity-{{ bug_report.severity }}">
        {{ bug_report.severity | upper }}
      </span>
      <span style="opacity: 0.8; font-size: 13px;">
        Gerado em {{ evidence.failed_at }} · {{ evidence.test_case_name }}
      </span>
    </div>
  </div>

  <!-- METADADOS -->
  <div class="section">
    <div class="section-title">Ambiente</div>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Dispositivo</div>
        <div class="meta-value">{{ evidence.device_model }}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Android</div>
        <div class="meta-value">{{ evidence.android_version }}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">App</div>
        <div class="meta-value">{{ evidence.app_package }}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Versão do App</div>
        <div class="meta-value">{{ evidence.app_version }}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Duração até falha</div>
        <div class="meta-value">{{ (evidence.total_duration_ms / 1000) | round(1) }}s</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Step com falha</div>
        <div class="meta-value">Step {{ evidence.failed_step_num }} de {{ evidence.all_steps | length }}</div>
      </div>
    </div>
  </div>

  <!-- RESUMO DA IA -->
  <div class="section">
    <div class="section-title">Análise da IA</div>
    <div class="ai-box">
      <div class="ai-label">🤖 Gerado automaticamente pelo QAMind</div>
      <p>{{ bug_report.summary }}</p>
      {% if bug_report.root_cause_hypothesis %}
      <p style="margin-top: 8px; color: #555;"><strong>Hipótese de causa raiz:</strong> {{ bug_report.root_cause_hypothesis }}</p>
      {% endif %}
    </div>
  </div>

  <!-- COMPORTAMENTO -->
  <div class="section">
    <div class="section-title">Comportamento</div>
    <div class="comparison">
      <div class="expected">
        <div style="font-weight: 700; margin-bottom: 8px; color: #27AE60;">✅ Esperado</div>
        <p>{{ bug_report.expected_behavior }}</p>
      </div>
      <div class="actual">
        <div style="font-weight: 700; margin-bottom: 8px; color: #E74C3C;">❌ Atual</div>
        <p>{{ bug_report.actual_behavior }}</p>
      </div>
    </div>
  </div>

  <!-- STEPS PARA REPRODUZIR -->
  <div class="section">
    <div class="section-title">Steps para Reproduzir</div>
    <ol class="steps-list">
      {% for step in bug_report.steps_to_reproduce %}
      <li>
        <div class="step-number">{{ loop.index }}</div>
        <div>{{ step }}</div>
      </li>
      {% endfor %}
    </ol>
  </div>

  <!-- TIMELINE DE SCREENSHOTS -->
  <div class="section page-break">
    <div class="section-title">Timeline Visual</div>
    <div class="screenshots-grid">
      {% for step_num, screenshot_b64 in screenshots.items() %}
      {% set step_info = evidence.all_steps | selectattr('num', 'eq', step_num | int) | first %}
      <div class="screenshot-item {% if step_num | int == evidence.failed_step_num %}failed{% else %}passed{% endif %}">
        <img src="data:image/jpeg;base64,{{ screenshot_b64 }}" alt="Step {{ step_num }}">
        <div class="screenshot-label">
          {% if step_num | int == evidence.failed_step_num %}❌{% else %}✅{% endif %}
          Step {{ step_num }}: {{ step_info.description[:35] if step_info else '...' }}
        </div>
      </div>
      {% endfor %}
    </div>
  </div>

  <!-- INVESTIGAÇÃO SUGERIDA -->
  {% if bug_report.suggested_investigation %}
  <div class="section">
    <div class="section-title">Investigação Sugerida</div>
    <p>{{ bug_report.suggested_investigation }}</p>
  </div>
  {% endif %}

  <!-- FOOTER -->
  <div class="footer">
    Gerado automaticamente pelo QAMind · Run ID: {{ evidence.run_id }} · {{ evidence.failed_at }}
  </div>

</body>
</html>
```

---

## 🔗 Integração com o Orquestrador (Parte 3)

Adicionar no `orchestrator.py`:

```python
# Quando run_failed é declarado, chamar:
async def _trigger_bug_engine(self, test_case, run_id, failed_step, result, history):
    # Emitir evento WS: bug_report_generating
    await self.ws.broadcast(RunEvent(
        type=EventType.BUG_REPORT_GENERATING,
        run_id=run_id,
        data={"message": "Gerando bug report automaticamente..."}
    ))
    
    # Coletar evidências
    collector = EvidenceCollector(self.db, device_udid)
    evidence = await collector.collect(run_id, failed_step.num)
    
    # Gerar conteúdo com IA
    reporter = AIReporter(api_key=ANTHROPIC_API_KEY)
    bug_content = await reporter.generate_bug_report(evidence)
    
    # Gerar PDF
    pdf_gen = PDFGenerator()
    pdf_bytes = await pdf_gen.generate(bug_content, evidence)
    
    # Upload para Supabase Storage
    pdf_url = await upload_pdf(pdf_bytes, run_id)
    
    # Salvar no banco
    await self.db.table('bug_reports').insert({
        'run_id': run_id,
        'title': bug_content.title,
        'severity': bug_content.severity,
        'ai_summary': bug_content.summary,
        'expected_behavior': bug_content.expected_behavior,
        'actual_behavior': bug_content.actual_behavior,
        'steps_to_reproduce': bug_content.steps_to_reproduce,
        'pdf_url': pdf_url
    })
    
    # Emitir evento WS: bug_report_ready
    await self.ws.broadcast(RunEvent(
        type=EventType.BUG_REPORT_READY,
        run_id=run_id,
        data={"pdf_url": pdf_url, "title": bug_content.title, "severity": bug_content.severity}
    ))
```

---

## 🖥️ UI do Bug Report no Frontend

```tsx
// Quando o evento 'bug_report_ready' chega via WS na tela de execução:
// 1. Mostrar banner de notificação no topo da tela
// 2. Exibir card com: título, severidade, botão "Ver relatório" e "Baixar PDF"
// 3. Ao clicar em "Ver relatório": abrir modal com preview do bug report
// 4. Ao clicar em "Baixar PDF": download direto do Supabase Storage

// Modal de preview:
// - Título + badge de severidade
// - Resumo da IA
// - Comportamento esperado vs atual
// - Steps para reproduzir
// - Thumbnail das screenshots
// - Botão "Baixar PDF completo"
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] Ao falhar um step, Bug Engine é acionado automaticamente
- [ ] Evento WS `bug_report_generating` emitido (UI mostra "Gerando...")
- [ ] Claude gera título descritivo e específico para o bug
- [ ] Severidade inferida corretamente (crítico para login/pagamento quebrado)
- [ ] Steps para reproduzir são claros e seguem a sequência do teste
- [ ] PDF gerado com template profissional e screenshots embutidas
- [ ] PDF upado no Supabase Storage e URL salva no banco
- [ ] Evento WS `bug_report_ready` emitido com URL do PDF
- [ ] Frontend exibe notificação de bug gerado na tela de execução
- [ ] Download do PDF funciona diretamente no browser
- [ ] Bug report salvo no banco vinculado ao run
- [ ] Tempo total de geração do bug report < 15 segundos
- [ ] PDF < 5MB mesmo com 10+ screenshots
