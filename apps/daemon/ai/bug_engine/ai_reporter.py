import anthropic
import json
import base64
import os
import logging
import aiohttp
import httpx
from ai.bug_engine.models import RunEvidence, BugReportContent

logger = logging.getLogger("ai_reporter")

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

RETORNE SOMENTE JSON VÁLIDO e certifique-se de que NÃO HÁ TEXTO ALÉM DO JSON:
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
"""

class AIReporter:
    
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=httpx.AsyncClient(verify=False)
        )
        
    async def _url_to_base64(self, url: str) -> str:
        """Download remote url or passthrough B64 data uri"""
        if not url:
            return ""
            
        if url.startswith("data:image"):
            return url.split(",")[1]
            
        try:
            async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
                async with session.get(url) as resp:
                    resp.raise_for_status()
                    data = await resp.read()
                    return base64.b64encode(data).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to fetch image {url}: {e}")
            from log_manager import log_manager
            log_manager.error(f"Falha ao baixar imagem {url}: {e}", context="BUG_ENGINE", exc=e)
            return ""

    async def generate_bug_report(self, evidence: RunEvidence) -> BugReportContent:
        steps_context = self._format_steps_for_prompt(evidence)
        failed_screenshot_b64 = await self._url_to_base64(evidence.failed_step_screenshot_url)
        
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
        
        if failed_screenshot_b64:
             content.extend([
                {"type": "text", "text": "Screenshot do step FALHO:"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": failed_screenshot_b64}}
            ])
            
        message = await self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            system=BUG_REPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}]
        )
        
        response_text = message.content[0].text
        
        # Strip potential markdown wrapping from response
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
            
        try:
            data = json.loads(response_text)
            return BugReportContent(
                title=data.get("title", f"Falha no step {evidence.failed_step_num}"),
                severity=data.get("severity", "medium"),
                severity_justification=data.get("severity_justification", ""),
                summary=data.get("summary", ""),
                expected_behavior=data.get("expected_behavior", ""),
                actual_behavior=data.get("actual_behavior", ""),
                root_cause_hypothesis=data.get("root_cause_hypothesis", ""),
                steps_to_reproduce=data.get("steps_to_reproduce", []),
                environment=data.get("environment", {}),
                impact=data.get("impact", ""),
                suggested_investigation=data.get("suggested_investigation", "")
            )
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode Claude JSON: {response_text}")
            from log_manager import log_manager
            log_manager.error(f"Falha ao decodificar JSON do Claude: {e}", context="BUG_ENGINE", exc=e)
            raise e
            
    def _format_steps_for_prompt(self, evidence: RunEvidence) -> str:
        lines = []
        for s in evidence.all_steps:
             num = s.get('num', 0)
             desc = s.get('description', '')
             if num < evidence.failed_step_num:
                 lines.append(f"✅ Step {num}: {desc}")
             elif num == evidence.failed_step_num:
                 lines.append(f"❌ Step {num} (FALHOU): {desc}")
             else:
                 lines.append(f"⏳ Step {num} (PULADO): {desc}")
        return "\n".join(lines)
