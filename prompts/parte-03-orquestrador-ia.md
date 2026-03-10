# QAMind — Parte 3: Orquestrador de IA (Prompt → Steps → Execução)
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1 e 2 concluídas. Daemon Android estável.

---

## 🎯 Objetivo desta parte

Construir o cérebro do QAMind: o módulo de IA que recebe um prompt em linguagem natural, interpreta a intenção do usuário, gera steps estruturados e orquestra a execução com loop de visão auto-corretivo — enviando screenshots para o Claude analisar após cada step.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| LLM | Claude claude-sonnet-4-20250514 (Anthropic API) |
| Visão | Claude claude-sonnet-4-20250514 com vision (base64 images) |
| Backend | Python (no daemon da Parte 2) |
| Orquestração | Módulo `ai/` dentro do daemon |
| Contexto | Janela deslizante de steps + screenshots recentes |

---

## 🗂️ Estrutura do Módulo de IA

```
daemon/
└── ai/
    ├── __init__.py
    ├── prompt_parser.py      # Prompt → lista de TestStep
    ├── vision_analyzer.py    # Screenshot + contexto → análise do step
    ├── orchestrator.py       # Loop principal de execução com IA
    ├── auto_corrector.py     # Tentativas de correção quando step falha
    ├── prompts/
    │   ├── parse_prompt.txt  # System prompt para parsear instruções
    │   ├── analyze_step.txt  # System prompt para análise visual
    │   └── bug_context.txt   # System prompt para geração de bug report
    └── models.py             # Dataclasses de resposta da IA
```

---

## 🧠 prompt_parser.py — Interpretador de Linguagem Natural

```python
"""
Converte um prompt em linguagem natural em uma lista de TestStep.

Responsabilidades:
- Entender a intenção do usuário em português ou inglês
- Quebrar em steps atômicos e executáveis
- Inferir asserts automaticamente (ex: após login → assert que está logado)
- Retornar JSON estruturado compatível com TestStep
"""
import anthropic
import json
from models.step import TestStep

PARSE_SYSTEM_PROMPT = """
Você é um especialista em automação de testes mobile e web.
Sua tarefa é converter uma instrução em linguagem natural em uma lista de steps de teste estruturados.

REGRAS IMPORTANTES:
1. Cada step deve ser uma ação ATÔMICA e ESPECÍFICA
2. Nunca combine duas ações em um step
3. Após ações críticas (login, compra, navegação), adicione um step de assert
4. Infira steps de abertura de app se não mencionados
5. Para campos de senha, use o tipo "type" com target identificando o campo
6. Adicione steps de wait quando necessário (após animações, carregamentos)

FORMATO DE RESPOSTA:
Responda SOMENTE com JSON válido, sem markdown, sem explicações.
Use este schema exato:

{
  "steps": [
    {
      "num": 1,
      "action": "open_app|tap|type|swipe|scroll|wait|assert_text|assert_element|back|home|screenshot",
      "target": "seletor do elemento OU coordenadas 'x,y' OU package name",
      "value": "texto a digitar OU direção do swipe OU texto a verificar OU ms a aguardar",
      "description": "descrição legível em português do que este step faz",
      "timeout_ms": 10000,
      "screenshot_after": true
    }
  ],
  "test_name": "nome descritivo do caso de teste",
  "estimated_duration_s": 45
}

EXEMPLOS DE MAPEAMENTO:
- "Abrir o app BancoX" → action: "open_app", target: "com.banco.app"
- "Clicar no botão Entrar" → action: "tap", target: "Entrar" (texto visível)
- "Digitar email admin@teste.com" → action: "type", target: "campo de email", value: "admin@teste.com"
- "Digitar senha 123456" → action: "type", target: "campo de senha", value: "123456"
- "Verificar que apareceu 'Bem-vindo'" → action: "assert_text", value: "Bem-vindo"
- "Rolar para baixo" → action: "scroll", value: "down"
- "Aguardar carregamento" → action: "wait", value: "2000"
"""

class PromptParser:
    
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
    
    async def parse(self, prompt: str, platform: str = "android") -> ParseResult:
        """
        Converte prompt em linguagem natural para lista de TestStep.
        
        Args:
            prompt: Instrução do usuário em português ou inglês
            platform: "android" | "web" | "ios"
        
        Returns:
            ParseResult com steps, test_name e estimated_duration_s
        
        Implementação:
        1. Montar mensagem com o system prompt acima
        2. Incluir no user message: prompt + plataforma
        3. Chamar API com max_tokens=2000
        4. Parsear JSON da resposta
        5. Converter para lista de TestStep
        6. Validar steps (verificar ações válidas, campos obrigatórios)
        """
        
        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=PARSE_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Plataforma: {platform}\n\nInstrução: {prompt}"
            }]
        )
        
        # Parsear JSON e retornar ParseResult
        raise NotImplementedError
    
    def _validate_steps(self, steps: list[dict]) -> list[TestStep]:
        """
        Valida e converte dicts para TestStep.
        Lança ValidationError se algum step tem ação inválida ou target ausente.
        """
        raise NotImplementedError
```

---

## 👁️ vision_analyzer.py — Análise Visual Pós-Step

```python
"""
Após cada step executado, analisa o screenshot para:
1. Confirmar se o step foi bem-sucedido visualmente
2. Detectar elementos inesperados (popups, erros, modais)
3. Sugerir correções se o elemento não foi encontrado
4. Preparar contexto para o próximo step
"""
import anthropic
import base64
import httpx
from models.step import TestStep, StepResult

ANALYZE_STEP_PROMPT = """
Você é um especialista em QA mobile analisando screenshots de testes automatizados.

Contexto fornecido:
- Step que foi executado
- Screenshot ANTES da ação (state anterior)
- Screenshot DEPOIS da ação (state atual)
- Histórico dos últimos 3 steps com resultados

Sua tarefa:
Analisar se o step foi executado com SUCESSO e retornar um JSON estruturado.

RETORNE SOMENTE JSON:
{
  "success": true|false,
  "confidence": 0.0-1.0,
  "observation": "o que você observa na tela após o step",
  "unexpected_elements": ["lista de elementos inesperados como popups, alertas, erros"],
  "suggestion": "se success=false, sugira como corrigir (elemento alternativo, coordenadas etc)",
  "next_step_hint": "dica sobre o estado atual para o próximo step",
  "should_wait": false,
  "wait_reason": "se should_wait=true, por que aguardar?"
}

CRITÉRIOS DE SUCESSO:
- tap: elemento foi clicado (mudança de estado visível, ripple, navegação)
- type: texto aparece no campo corretamente
- swipe: conteúdo se moveu na direção esperada
- assert_text: texto está visível na tela
- assert_element: elemento está presente e visível
- open_app: app está em foreground (tela do app visível)
- wait: sempre success=true
"""

class VisionAnalyzer:
    
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
    
    async def analyze_step(
        self,
        step: TestStep,
        screenshot_before_url: str,
        screenshot_after_url: str,
        history: list[dict]   # últimos 3 steps com resultados
    ) -> VisionResult:
        """
        Analisa visualmente se o step foi bem-sucedido.
        
        Implementação:
        1. Download das screenshots (before e after) como bytes
        2. Converter para base64
        3. Montar mensagem com ambas as imagens + contexto do step
        4. Chamar Claude com vision
        5. Parsear JSON da resposta
        6. Retornar VisionResult
        
        ATENÇÃO: Chamar apenas se step.screenshot_after = True
        Para steps de wait: retornar VisionResult(success=True, confidence=1.0)
        """
        
        # Download screenshots
        before_b64 = await self._url_to_base64(screenshot_before_url)
        after_b64 = await self._url_to_base64(screenshot_after_url)
        
        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=ANALYZE_STEP_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Step executado: {step.action} - {step.description}\nTarget: {step.target}\nValue: {step.value}\n\nHistórico recente: {history}"
                    },
                    {
                        "type": "text",
                        "text": "Screenshot ANTES da ação:"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": before_b64
                        }
                    },
                    {
                        "type": "text",
                        "text": "Screenshot DEPOIS da ação:"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": after_b64
                        }
                    }
                ]
            }]
        )
        
        raise NotImplementedError("Parsear resposta e retornar VisionResult")
    
    async def _url_to_base64(self, url: str) -> str:
        """Baixa imagem da URL e converte para base64."""
        raise NotImplementedError
```

---

## 🔄 orchestrator.py — Loop Principal de Execução

```python
"""
Orquestra a execução completa de um TestCase no dispositivo.
Este é o componente de mais alto nível — conecta tudo.

Fluxo:
  Para cada step:
    1. Emitir step_started via WS
    2. Capturar screenshot "before"
    3. Executar step no dispositivo (Executor)
    4. Capturar screenshot "after"
    5. Analisar com VisionAnalyzer
    6. Se success → salvar resultado, emitir step_completed, próximo step
    7. Se não success → tentar AutoCorrector (máx 3 tentativas)
    8. Se ainda falha → acionar BugEngine, emitir run_failed, parar
  
  Ao final → emitir run_completed com sumário
"""
import asyncio
from android.executor import StepExecutor, StepResult
from ai.vision_analyzer import VisionAnalyzer
from ai.auto_corrector import AutoCorrector
from models.step import TestCase, TestStep

class RunOrchestrator:
    
    MAX_RETRIES = 3
    
    def __init__(
        self,
        executor: StepExecutor,
        vision_analyzer: VisionAnalyzer,
        auto_corrector: AutoCorrector,
        screenshot_handler,
        ws_broadcaster,
        supabase_client
    ):
        self.executor = executor
        self.vision = vision_analyzer
        self.corrector = auto_corrector
        self.screenshots = screenshot_handler
        self.ws = ws_broadcaster
        self.db = supabase_client
    
    async def run(self, test_case: TestCase, run_id: str, device_udid: str) -> RunSummary:
        """
        Executa o test case completo.
        
        IMPORTANTE:
        - Salvar cada step result no Supabase (run_steps) em tempo real
        - Emitir eventos WS para cada mudança de estado
        - Manter histórico dos últimos 3 steps para contexto da IA
        - Se o run for cancelado (evento WS recebido), parar graciosamente
        - Sempre retornar RunSummary mesmo em caso de falha
        """
        
        history = []  # últimos 3 steps para contexto
        
        for i, step in enumerate(test_case.steps):
            result = await self._execute_with_ai_loop(step, run_id, history)
            
            # Adicionar ao histórico (manter apenas últimos 3)
            history.append({"step": step, "result": result})
            if len(history) > 3:
                history.pop(0)
            
            if result.status == "failed":
                # Acionar Bug Engine (Parte 7) e parar
                await self._trigger_bug_engine(test_case, run_id, step, result, history)
                return RunSummary(status="failed", failed_at_step=i+1)
        
        return RunSummary(status="passed", total_steps=len(test_case.steps))
    
    async def _execute_with_ai_loop(
        self, step: TestStep, run_id: str, history: list
    ) -> StepResult:
        """
        Executa um step com loop de análise visual e auto-correção.
        
        Loop:
        1. Capturar screenshot before
        2. Executar step
        3. Capturar screenshot after
        4. Analisar com IA
        5. Se IA diz success → retornar passed
        6. Se IA diz failure → chamar AutoCorrector
        7. AutoCorrector sugere correção → tentar novamente (máx 3x)
        8. Após 3 falhas → retornar failed
        """
        raise NotImplementedError
    
    async def _save_step_result(self, run_id: str, result: StepResult):
        """Salva step result na tabela run_steps do Supabase."""
        raise NotImplementedError
```

---

## 🔧 auto_corrector.py — Auto-Correção Inteligente

```python
"""
Quando um step falha, tenta corrigir automaticamente antes de desistir.
Estratégias:
1. Fechar popup/modal inesperado detectado pela IA
2. Tentar seletor alternativo (text → resource-id → xpath → coordenadas)
3. Aguardar mais tempo e tentar novamente
4. Rolar a tela para encontrar o elemento
"""
from ai.vision_analyzer import VisionResult
from models.step import TestStep

class AutoCorrector:
    
    async def suggest_correction(
        self,
        original_step: TestStep,
        vision_result: VisionResult,
        attempt_num: int
    ) -> TestStep | None:
        """
        Baseado na análise visual e no número da tentativa,
        sugere um step modificado para tentar novamente.
        
        Retorna None se não há mais estratégias a tentar.
        
        Estratégia por tentativa:
        - Tentativa 1: usar suggestion da VisionResult (IA já sugeriu algo)
        - Tentativa 2: fechar popup se detectado, depois retentar step original
        - Tentativa 3: scroll para encontrar elemento, depois retentar
        - Após 3: retornar None (desistir)
        """
        raise NotImplementedError
    
    async def _handle_unexpected_elements(
        self, 
        unexpected: list[str], 
        device
    ) -> bool:
        """
        Lida com elementos inesperados (popups, modais, alerts).
        
        Para cada elemento na lista:
        - "popup" → tentar fechar com botão X ou 'Fechar' ou tecla Back
        - "alert_dialog" → clicar em 'OK' ou 'Cancelar' dependendo do contexto
        - "toast" → aguardar desaparecer (2s)
        - "loading_spinner" → aguardar desaparecer (até 5s)
        
        Retorna True se conseguiu lidar com o elemento.
        """
        raise NotImplementedError
```

---

## 🔌 Integração com o Frontend (API REST)

Adicionar endpoints no FastAPI/Fastify:

```
POST /api/tests/parse-prompt
Body: { "prompt": string, "platform": string, "project_id": string }
Response: { "steps": TestStep[], "test_name": string, "estimated_duration_s": number }

POST /api/runs
Body: { "test_case_id": string, "device_udid": string }
Response: { "run_id": string, "status": "started" }

POST /api/runs/{run_id}/cancel
Response: { "status": "cancelled" }
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] `POST /api/tests/parse-prompt` com prompt complexo retorna steps válidos em < 5s
- [ ] Steps inferidos corretamente: "Faça login com email X e senha Y" → mínimo 4 steps + assert
- [ ] Loop de visão: após cada step, screenshot é analisado pela IA
- [ ] `VisionAnalyzer.analyze_step` identifica corretamente sucesso/falha visualmente
- [ ] Auto-correção: se elemento não encontrado, tenta alternativa antes de falhar
- [ ] Fechamento de popup inesperado funciona automaticamente
- [ ] Máximo 3 tentativas por step, depois declara falha
- [ ] Histórico de steps é mantido e enviado como contexto para cada análise
- [ ] Todos os eventos WS emitidos corretamente durante a execução
- [ ] Teste end-to-end: prompt → steps → execução → resultado no Supabase

---

## ⚠️ Controle de Custo de API

```python
# Implementar estimativa de custo antes de executar
COST_PER_VISION_CALL = 0.01   # USD aproximado (Claude Sonnet com imagens)
COST_PER_PARSE_CALL = 0.003   # USD aproximado (sem imagens)

def estimate_run_cost(test_case: TestCase) -> float:
    """
    Estima o custo em USD de executar o test case.
    Mostrar para o usuário antes de iniciar execução longa.
    """
    vision_calls = len([s for s in test_case.steps if s.screenshot_after])
    return (vision_calls * COST_PER_VISION_CALL) + COST_PER_PARSE_CALL
```

---

## 🔗 Dependências para a Próxima Parte

- `parse_prompt()` deve estar estável e testado com vários prompts
- `RunOrchestrator.run()` deve emitir todos os eventos WS do protocolo definido na Parte 2
- A Parte 4 (Editor) vai consumir os steps gerados por `parse_prompt()` e exibi-los no editor
