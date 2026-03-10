import anthropic
import json
import logging
from typing import List, Dict, Any
from models.step import TestStep, StepAction
import uuid

logger = logging.getLogger("prompt_parser")

PARSE_SYSTEM_PROMPT = """
Você é um especialista em automação de testes Android com ADB e uiautomator2.
Converta a instrução do usuário em steps de teste estruturados.

REGRAS OBRIGATÓRIAS:
1. Cada step = UMA ação atômica. Nunca agrupe duas ações.
2. Após abrir app: sempre adicionar step de wait (2000ms) para carregar.
3. Para campos de formulário: step de TAP no campo ANTES do step de TYPE.
4. Após ação crítica (login, submit): adicionar step de assert para validar.
5. Para encontrar apps: use o NOME VISÍVEL na tela (não o package name).
6. Para botões: prefira o texto visível ("Entrar", "Login") sobre IDs técnicos.

RETORNE SOMENTE JSON VÁLIDO — sem markdown, sem texto antes ou depois:
{
  "test_name": "descrição curta do teste",
  "steps": [
    {
      "num": 1,
      "action": "open_app",
      "target": "Foxbit",
      "description": "Abrir o aplicativo Foxbit",
      "target_strategies": ["app_name:Foxbit", "package:com.foxbit.exchange"]
    },
    {
      "num": 2,
      "action": "wait",
      "value": "2000",
      "description": "Aguardar o app carregar"
    },
    {
      "num": 3,
      "action": "tap",
      "target": "Entrar",
      "description": "Clicar no botão Entrar",
      "target_strategies": ["text:Entrar", "text:Login", "resource-id:btn_login"]
    },
    {
      "num": 4,
      "action": "tap",
      "target": "campo de email",
      "description": "Tocar no campo de email",
      "target_strategies": ["hint:E-mail", "hint:Email", "xpath://android.widget.EditText[1]"]
    },
    {
      "num": 5,
      "action": "type",
      "value": "isaias@gmail.com",
      "description": "Digitar o email"
    },
    {
      "num": 6,
      "action": "tap",
      "target": "campo de senha",
      "description": "Tocar no campo de senha",
      "target_strategies": ["hint:Senha", "hint:Password", "xpath://android.widget.EditText[2]"]
    },
    {
      "num": 7,
      "action": "type",
      "value": "senha123456",
      "description": "Digitar a senha"
    },
    {
      "num": 8,
      "action": "tap",
      "target": "botão de confirmar login",
      "description": "Clicar no botão de entrar/confirmar",
      "target_strategies": ["text:Entrar", "text:Confirmar", "text:Login", "resource-id:btn_submit"]
    },
    {
      "num": 9,
      "action": "wait",
      "value": "3000",
      "description": "Aguardar resposta do servidor"
    },
    {
      "num": 10,
      "action": "assert_text",
      "value": "Portfólio|Dashboard|Saldo|Bem-vindo|isaias",
      "description": "Validar que o login foi bem-sucedido"
    }
  ]
}

AÇÕES DISPONÍVEIS:
- open_app: abrir aplicativo pelo nome visível
- tap: tocar em elemento (botão, campo, item de lista)
- type: digitar texto no campo focado
- swipe: deslizar (value: "up"|"down"|"left"|"right")
- wait: aguardar (value: milissegundos como string)
- assert_text: verificar se texto está visível (value: suporta múltiplos separados por |)
- assert_element: verificar se elemento existe
- back: pressionar botão voltar
- home: pressionar botão home
- screenshot: capturar screenshot manual
"""

class ParseResult:
    def __init__(self, steps: List[TestStep], test_name: str, estimated_duration_s: int):
        self.steps = steps
        self.test_name = test_name
        self.estimated_duration_s = estimated_duration_s

class PromptParser:
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
    
    async def parse(self, prompt: str, platform: str = "android") -> ParseResult:
        try:
            logger.info(f"Parsing prompt for {platform}: {prompt}")
            message = await self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=PARSE_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Opcode da Plataforma: {platform}\n\nInstrução: {prompt}"
                }]
            )
            
            # The model might return ```json ... ``` blocks, so we parse it safely
            content = message.content[0].text
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
                
            data = json.loads(content)
            
            steps = self._validate_steps(data.get("steps", []))
            
            return ParseResult(
                steps=steps,
                test_name=data.get("test_name", "Teste Autogerado"),
                estimated_duration_s=data.get("estimated_duration_s", 30)
            )
            
        except Exception as e:
            logger.error(f"Error parsing prompt with AI: {e}")
            raise ValueError(f"Failed to parse prompt: {str(e)}")
            
    async def parse_stream(self, prompt: str, platform: str = "android"):
        logger.info(f"Stream parsing prompt for {platform}: {prompt}")
        try:
            async with self.client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=PARSE_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Opcode da Plataforma: {platform}\n\nInstrução: {prompt}"
                }]
            ) as stream:
                async for text in stream.text_stream:
                    chunk_data = json.dumps({"type": "chunk", "text": text})
                    yield f"data: {chunk_data}\n\n"
                
                message = await stream.get_final_message()
                content = message.content[0].text
                
                # Cleanup the markdown formatting from AI output
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()
                    
                data = json.loads(content)
                steps = self._validate_steps(data.get("steps", []))
                
                result = ParseResult(
                    steps=steps,
                    test_name=data.get("test_name", "Teste Autogerado"),
                    estimated_duration_s=data.get("estimated_duration_s", 30)
                )
                
                final_payload = {
                    "type": "result",
                    "steps": [s.model_dump() for s in result.steps],
                    "test_name": result.test_name,
                    "estimated_duration_s": result.estimated_duration_s
                }
                yield f"data: {json.dumps(final_payload)}\n\n"
                
        except Exception as e:
            logger.error(f"Error streaming parsing prompt with AI: {e}")
            error_payload = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    def _validate_steps(self, steps_data: List[Dict[str, Any]]) -> List[TestStep]:
        validated = []
        for step in steps_data:
            try:
                # Map raw action to StepAction enum
                action_str = step.get("action", "")
                try:
                    action = StepAction(action_str)
                except ValueError:
                    # Fallbacks if AI hallucinates actions
                    if action_str == "type": action = StepAction.TYPE_TEXT
                    elif action_str == "back": action = StepAction.PRESS_BACK
                    elif action_str == "home": action = StepAction.PRESS_HOME
                    else: continue # Skip invalid invalid actions
                
                validated.append(TestStep(
                    id=str(uuid.uuid4()),
                    action=action,
                    target=step.get("target"),
                    value=step.get("value"),
                    description=step.get("description"),
                    target_strategies=step.get("target_strategies", []),
                    timeout_ms=step.get("timeout_ms", 10000)
                ))
            except Exception as e:
                logger.warning(f"Skipping improperly formatted step: {step} - Error: {e}")
                
        return validated
