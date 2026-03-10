import anthropic
import base64
import httpx
import json
import logging
from pydantic import BaseModel
from typing import List, Optional
from models.step import TestStep

logger = logging.getLogger("vision_analyzer")

ANALYZE_STEP_PROMPT = """
Você é um QA mobile analisando testes automatizados.
Analise a tela ANTES e DEPOIS da ação executada.

RETORNE SOMENTE JSON:
{
  "success": true|false,
  "confidence": 0.0,
  "observation": "o que você observa na tela após o step",
  "unexpected_elements": ["popups", "alertas", "erros"],
  "suggestion": "se success=false, sugira como corrigir o locator ou a ação",
  "next_step_hint": "dica sobre o estado atual",
  "should_wait": false
}
"""

class VisionResult(BaseModel):
    success: bool
    confidence: float
    observation: str
    unexpected_elements: List[str] = []
    suggestion: Optional[str] = None
    next_step_hint: Optional[str] = None
    should_wait: bool = False

class VisionAnalyzer:
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        
    async def analyze_step(
        self,
        step: TestStep,
        screenshot_before_url: str,
        screenshot_after_url: str,
        history: List[dict]
    ) -> VisionResult:
        try:
            # wait actions don't need visual analysis strictly, but we can do it if required.
            if step.action == "wait":
                return VisionResult(success=True, confidence=1.0, observation="Espera concluída.")

            before_b64 = await self._url_to_base64(screenshot_before_url)
            after_b64 = await self._url_to_base64(screenshot_after_url)
            
            if not before_b64 or not after_b64:
                return VisionResult(
                    success=False, 
                    confidence=0.0, 
                    observation="Falha ao carregar imagens para análise."
                )

            message = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=ANALYZE_STEP_PROMPT,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Step executado: {step.action.value}\nTarget: {step.target}\nValue: {step.value}\nHistórico recente: {history}"
                        },
                        {"type": "text", "text": "Antes:"},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": before_b64
                            }
                        },
                        {"type": "text", "text": "Depois:"},
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
            
            content = message.content[0].text
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
                
            data = json.loads(content)
            return VisionResult(**data)
            
        except Exception as e:
            logger.error(f"Error in vision analysis: {e}")
            return VisionResult(
                success=False, 
                confidence=0.0, 
                observation=f"Erro na API de Visão: {str(e)}"
            )

    async def _url_to_base64(self, url: str) -> str:
        if not url: return ""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=10.0)
                resp.raise_for_status()
                return base64.b64encode(resp.content).decode("utf-8")
        except Exception as e:
            logger.error(f"Failed to fetch image {url}: {e}")
            return ""
