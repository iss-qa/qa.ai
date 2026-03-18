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

class VisionCoordinateResult(BaseModel):
    screen_match: bool = False
    element_found: bool = False
    x: Optional[int] = None
    y: Optional[int] = None
    confidence: float = 0.0
    ambiguous: bool = False
    ambiguous_options: List[dict] = []
    ambiguous_reason: Optional[str] = None
    needs_clarification: Optional[str] = None
    fallback_suggested: bool = False
    observation: str = ""

class VisionAnalyzer:
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=httpx.AsyncClient(verify=False)
        )
        
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

    async def find_element_by_vision(
        self,
        reference_image_b64: str,
        current_screenshot_b64: str,
        step_instruction: str,
        device_width: int,
        device_height: int
    ) -> VisionCoordinateResult:
        try:
            prompt = (
                "Você é um especialista em automação de testes Android analisando screenshots.\n\n"
                "Imagem 1 (REFERÊNCIA): screenshot de como a tela deveria estar "
                "neste momento do fluxo, fornecida pelo testador como guia visual.\n\n"
                "Imagem 2 (ATUAL): screenshot real do device neste exato momento.\n\n"
                f"Instrução do step: {step_instruction}\n\n"
                f"Dimensões reais do device: {device_width}x{device_height} pixels\n\n"
                "REGRAS IMPORTANTES:\n"
                "- Para campos de texto (EditText, TextInput), o texto visível pode ser um "
                "PLACEHOLDER/HINT (texto cinza claro como 'Digite seu e-mail', 'Digite sua senha'). "
                "Considere hints/placeholders como identificadores válidos do campo.\n"
                "- Para botões, considere o texto visível no botão.\n"
                "- As coordenadas devem apontar para o CENTRO do elemento.\n"
                "- Para campos de input, aponte para o centro da área clicável do campo, "
                "não para o label acima dele.\n\n"
                "Tarefa:\n"
                "1. Compare as duas imagens e confirme que o device está na tela correta\n"
                "2. Identifique visualmente o elemento mencionado na instrução. "
                "Procure por: texto exato, texto parcial, placeholders, hints, ícones próximos\n"
                "3. Se existir mais de um elemento similar (ex: três botões 'Entrar'), "
                "use o contexto espacial da instrução para disambiguar "
                "(ex: 'abaixo do campo senha', 'canto direito')\n"
                "4. Retorne SOMENTE JSON:\n"
                "{\n"
                '  "screen_match": bool,\n'
                '  "element_found": bool,\n'
                '  "x": int,\n'
                '  "y": int,\n'
                '  "confidence": float,\n'
                '  "ambiguous": bool,\n'
                '  "ambiguous_options": [{"label": "descrição", "x": int, "y": int}],\n'
                '  "ambiguous_reason": "razão da ambiguidade ou null",\n'
                '  "needs_clarification": "pergunta ao usuário ou null",\n'
                '  "fallback_suggested": bool,\n'
                '  "observation": "o que você observa"\n'
                "}\n\n"
                "IMPORTANTE: As coordenadas x,y devem ser em pixels absolutos dentro "
                f"das dimensões {device_width}x{device_height}. "
                "Aponte para o CENTRO EXATO do elemento clicável. "
                "Se ambiguous=true, preencha ambiguous_options com todas as opções encontradas. "
                "Se não encontrar o elemento, retorne element_found=false e fallback_suggested=true."
            )

            message = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "text", "text": "Imagem REFERÊNCIA:"},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": reference_image_b64
                            }
                        },
                        {"type": "text", "text": "Imagem ATUAL do device:"},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": current_screenshot_b64
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
            return VisionCoordinateResult(**data)

        except Exception as e:
            logger.error(f"Error in vision coordinate finding: {e}")
            return VisionCoordinateResult(
                observation=f"Erro na API de Visão: {str(e)}",
                fallback_suggested=True
            )

    async def _url_to_base64(self, url: str) -> str:
        if not url: return ""
        if url.startswith("data:image"):
            return url.split(",")[1]
            
        try:
            async with httpx.AsyncClient(verify=False) as client:
                resp = await client.get(url, timeout=10.0)
                resp.raise_for_status()
                return base64.b64encode(resp.content).decode("utf-8")
        except Exception as e:
            logger.error(f"Failed to fetch image {url}: {e}")
            return ""
