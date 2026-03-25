import anthropic
import httpx
import json
import logging
from typing import List, Dict, Any
from models.step import TestStep, StepAction
import uuid

logger = logging.getLogger("prompt_parser")

PARSE_SYSTEM_PROMPT = """
Você é um Engenheiro de Automação Android Sênior (UIAutomator2 / ADB).
Seu trabalho é converter instruções de teste em steps executáveis com seletores REAIS extraídos do XML da tela.

══════════════════════════════════════════════════════
 REGRAS FUNDAMENTAIS
══════════════════════════════════════════════════════
1. Cada step = UMA ação atômica. Nunca agrupe duas ações.
2. Após abrir app: step wait 2000ms.
3. Formulário: TAP no campo → TYPE o valor (type não tem target_strategies).
4. Após ações críticas (login/submit): ASSERT_TEXT para validar.
5. RETORNE SOMENTE JSON VÁLIDO — zero markdown, zero texto fora do JSON.

══════════════════════════════════════════════════════
 ALGORITMO DE GERAÇÃO DE target_strategies (OBRIGATÓRIO)
══════════════════════════════════════════════════════

Quando o CONTEXTO DE UI (XML) estiver disponível, execute este algoritmo para cada step de tap/assert:

─── FASE 1: MAPEAMENTO SEMÂNTICO ───
Procure no XML o elemento que corresponde semanticamente à intenção do usuário.
Mapeamento de termos comuns:
  "login" / "entrar"  → resource-id: login, entrar, signin, acessar, bt_welcome_login, bt_login
  "email" / "usuário" → resource-id: email, user, username, login_id, et_email, et_user
  "senha" / "password"→ resource-id: password, senha, pass, et_password, et_senha
  "confirmar"/"submit"→ resource-id: confirm, submit, ok, done, proceed, bt_confirm
  NÃO se limite ao texto literal — busque semanticamente no resource-id.

─── FASE 2: EXTRAÇÃO DE SELETORES (em ordem de prioridade) ───

► A — resource-id (PRIORIDADE MÁXIMA):
  Se resource-id NÃO for "" → adicione "resource-id:<valor_exato>"
  JAMAIS invente um resource-id. Só use os que existem no XML.

► B — text:
  Se text NÃO for "" → adicione "text:<valor_exato>"
  Se text="" → NÃO adicione estratégia de text.

► C — content-desc (use descriptionContains, NUNCA descriptionMatches):
  Se content-desc NÃO for "" → "descriptionContains:<primeiro_segmento_antes_de_newline>"
  Ex: content-desc="Entrar\nEntrar" → "descriptionContains:Entrar"
  Ex: content-desc="Criar conta\nCriar conta" → "descriptionContains:Criar conta"

► D — XPath estrutural (OBRIGATÓRIO quando A+B+C são todos vazios):
  Para android.widget.EditText sem atributos úteis:
    1º campo na tela → "xpath://android.widget.EditText[1]"
    2º campo na tela → "xpath://android.widget.EditText[2]"
  Para android.widget.Button com resource-id:
    → "xpath://android.widget.Button[@resource-id='<id>']"

─── FASE 3: REGRA PARA APPS REACT NATIVE / FLUTTER ───
Esses apps FREQUENTEMENTE têm resource-id="", text="", content-desc="" em campos de input.
Sinal: package="com.*.android*" com muitos nodes class="android.view.View" aninhados e EditText sem atributos.
SOLUÇÃO: Use sempre "xpath://android.widget.EditText[<índice>]" para campos de formulário.

══════════════════════════════════════════════════════
 EXEMPLOS REAIS
══════════════════════════════════════════════════════

EXEMPLO 1 — Botão com resource-id e content-desc multiline:
  XML: resource-id="bt_welcome_login" text="" content-desc="Entrar\nEntrar"
  → ["resource-id:bt_welcome_login", "descriptionContains:Entrar"]

EXEMPLO 2 — Campo email React Native (todos atributos vazios, 1º EditText):
  XML: resource-id="" text="" content-desc="" class="android.widget.EditText"
  → ["xpath://android.widget.EditText[1]"]

EXEMPLO 3 — Campo senha React Native (2º EditText, password="true"):
  XML: resource-id="" text="" content-desc="" class="android.widget.EditText" password="true"
  → ["xpath://android.widget.EditText[2]"]

EXEMPLO 4 — Botão com text visível:
  XML: resource-id="" text="Criar conta" content-desc="Criar conta"
  → ["text:Criar conta", "descriptionContains:Criar conta"]

══════════════════════════════════════════════════════
 ESTRATÉGIAS SUPORTADAS
══════════════════════════════════════════════════════
  "resource-id:<id>"           → busca por resourceId exato
  "text:<exato>"               → busca por text exato
  "textContains:<parcial>"     → busca parcial no text
  "descriptionContains:<sub>"  → busca substring no content-desc (funciona com newlines)
  "xpath:<expressão>"          → seletor estrutural XPath

══════════════════════════════════════════════════════
 FORMATO DE SAÍDA
══════════════════════════════════════════════════════
{
  "test_name": "nome curto do teste",
  "estimated_duration_s": 30,
  "steps": [
    {
      "num": 1,
      "action": "open_app",
      "target": "NomeApp",
      "description": "Abrir o aplicativo",
      "target_strategies": ["package:com.exemplo.app"]
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
      "target_strategies": ["resource-id:bt_welcome_login", "descriptionContains:Entrar"]
    },
    {
      "num": 4,
      "action": "tap",
      "target": "campo de email",
      "description": "Tocar no campo de email",
      "target_strategies": ["xpath://android.widget.EditText[1]"]
    },
    {
      "num": 5,
      "action": "type",
      "value": "usuario@email.com",
      "description": "Digitar o email"
    },
    {
      "num": 6,
      "action": "tap",
      "target": "campo de senha",
      "description": "Tocar no campo de senha",
      "target_strategies": ["xpath://android.widget.EditText[2]"]
    },
    {
      "num": 7,
      "action": "type",
      "value": "senha123",
      "description": "Digitar a senha"
    }
  ]
}

══════════════════════════════════════════════════════
 AÇÕES DISPONÍVEIS
══════════════════════════════════════════════════════
  open_app       → abrir app pelo nome
  tap            → tocar em elemento (requer target_strategies)
  type           → digitar no campo focado (só value, sem target_strategies)
  swipe          → deslizar (value: "up"|"down"|"left"|"right")
  wait           → aguardar (value: milissegundos como string)
  assert_text    → verificar texto visível (value: múltiplos com |)
  assert_element → verificar existência de elemento
  back           → botão voltar
  home           → botão home
"""


MAESTRO_SYSTEM_PROMPT = """
Voce e especialista no framework de testes mobile Maestro v2.x (https://maestro.dev).

HIERARQUIA DE BUSCA DE ELEMENTOS (usar nesta ordem de prioridade):
1. semantics id / testTag: tapOn: { id: "semanticsId" }  -- apps Compose/Flutter
2. resource-id: tapOn: { id: "resource_id_curto" }       -- apps nativos Android
3. Texto exato visivel: tapOn: "Texto do botao"           -- mais confiavel para textos
4. Placeholder/hint: tapOn: "Digite seu e-mail"           -- campos de input
5. content-description: tapOn: "descricao acessibilidade"
6. Texto parcial com index: tapOn: { text: "Entrar", index: 0 }  -- quando ha duplicatas
7. Coordenadas percentuais: tapOn: { point: "50%,80%" }  -- ULTIMO RECURSO

COMANDOS VALIDOS DO MAESTRO v2:
- launchApp
- tapOn: "texto"
- tapOn: { id: "resource_id" }
- tapOn: { text: "texto", index: N }
- tapOn: { point: "X%,Y%" }
- inputText: "valor"
- assertVisible: "texto"
- assertNotVisible: "texto"
- waitForAnimationToEnd
- extendedWaitUntil: { visible: "texto", timeout: 5000 }
- hideKeyboard
- back
- scroll
- swipe: { direction: LEFT }
- longPressOn: "texto"
- pressKey: Home

COMANDOS PROIBIDOS (nao existem no Maestro v2):
- wait (NAO EXISTE! Use extendedWaitUntil)
- sleep (NAO EXISTE! Use extendedWaitUntil)
- delay (NAO EXISTE!)

APPS CONHECIDOS:
- Foxbit: appId = "br.com.foxbit.foxbitandroid"
  Tela inicial: botao "Entrar", "Criar conta"
  Tela login: campos "Digite seu e-mail", "Digite sua senha", botao "Entrar"

SEU TRABALHO:
1. Identificar o app e usar o package correto (ex: Foxbit = br.com.foxbit.foxbitandroid)
2. Quebrar em steps atomicos, uma acao por step
3. Usar texto visivel como localizador (tapOn: "texto do placeholder ou botao")
4. Apos launchApp, SEMPRE usar extendedWaitUntil com o primeiro elemento esperado
5. Adicionar waitForAnimationToEnd apos taps que causam transicao de tela
6. Adicionar hideKeyboard antes de tapOn em botoes apos inputText
7. NAO usar clearState em apps de login (pode causar "app not installed" no Maestro)
8. Para senhas, colocar o valor direto no inputText (nao usar ${VAR})

EXEMPLO REAL VALIDADO (12/12 steps passaram):
{
  "test_name": "login_foxbit",
  "app_id": "br.com.foxbit.foxbitandroid",
  "env_vars_needed": [],
  "estimated_duration_s": 30,
  "steps": [
    {"num": 1, "action": "launchApp", "description": "Abre o app Foxbit", "maestro_command": "- launchApp"},
    {"num": 2, "action": "extendedWaitUntil", "description": "Aguarda botao Entrar aparecer", "maestro_command": "- extendedWaitUntil:\\n    visible: \\"Entrar\\"\\n    timeout: 8000"},
    {"num": 3, "action": "tapOn", "description": "Clica em Entrar na tela inicial", "maestro_command": "- tapOn: \\"Entrar\\""},
    {"num": 4, "action": "waitForAnimationToEnd", "description": "Aguarda transicao para tela de login", "maestro_command": "- waitForAnimationToEnd"},
    {"num": 5, "action": "extendedWaitUntil", "description": "Aguarda campo de email", "maestro_command": "- extendedWaitUntil:\\n    visible: \\"Digite seu e-mail\\"\\n    timeout: 5000"},
    {"num": 6, "action": "tapOn", "description": "Toca no campo de email", "maestro_command": "- tapOn: \\"Digite seu e-mail\\""},
    {"num": 7, "action": "inputText", "description": "Digita o email", "maestro_command": "- inputText: \\"isaias@gmail.com\\""},
    {"num": 8, "action": "tapOn", "description": "Toca no campo de senha", "maestro_command": "- tapOn: \\"Digite sua senha\\""},
    {"num": 9, "action": "inputText", "description": "Digita a senha", "maestro_command": "- inputText: \\"Isaias123\\""},
    {"num": 10, "action": "hideKeyboard", "description": "Esconde o teclado", "maestro_command": "- hideKeyboard"},
    {"num": 11, "action": "tapOn", "description": "Clica em Entrar para login", "maestro_command": "- tapOn: \\"Entrar\\""},
    {"num": 12, "action": "waitForAnimationToEnd", "description": "Aguarda pos-login", "maestro_command": "- waitForAnimationToEnd"}
  ],
  "yaml_flow": "appId: br.com.foxbit.foxbitandroid\\n---\\n- launchApp\\n- extendedWaitUntil:\\n    visible: \\"Entrar\\"\\n    timeout: 8000\\n- tapOn: \\"Entrar\\"\\n- waitForAnimationToEnd\\n- extendedWaitUntil:\\n    visible: \\"Digite seu e-mail\\"\\n    timeout: 5000\\n- tapOn: \\"Digite seu e-mail\\"\\n- inputText: \\"isaias@gmail.com\\"\\n- tapOn: \\"Digite sua senha\\"\\n- inputText: \\"Isaias123\\"\\n- hideKeyboard\\n- tapOn: \\"Entrar\\"\\n- waitForAnimationToEnd"
}

RETORNAR APENAS JSON valido — sem markdown, sem texto explicativo.
"""


MAESTRO_RECORDING_PROMPT = """
Voce e especialista em Maestro.
Converta as interacoes gravadas em um YAML de qualidade de producao que passe 10 vezes consecutivas.

INTERACOES GRAVADAS: {recorded_events}
Resolucao do device: {width}x{height}

REGRAS DE CONVERSAO:
1. element_info.text existe -> tapOn: "texto" (descartar coordenadas)
2. element_info.resourceId existe, sem texto -> tapOn: id: "id_sem_prefixo_do_package"
   (Ex: "com.foxbit.exchange:id/btn_login" -> "btn_login")
3. element_info null -> converter para percentual: x_pct = round(x/largura*100), y_pct = round(y/altura*100) -> point: "X%,Y%"
4. Events de type consecutivos no mesmo campo -> unificar em um inputText
5. Adicionar waitForAnimationToEnd apos taps que causam transicao de tela
6. Adicionar assertVisible apos login e navegacoes importantes
7. Substituir [SENHA_MASCARADA] por ${{SENHA}}
8. Se o primeiro launchApp e para tela de login -> adicionar clearState antes dele
9. Inferir appId pelo prefixo do resourceId se disponivel

Retornar o mesmo formato JSON:
{{
  "test_name": "nome_descritivo_em_snake_case",
  "app_id": "com.package.name",
  "env_vars_needed": ["SENHA", "EMAIL"],
  "estimated_duration_s": 30,
  "steps": [
    {{
      "num": 1,
      "action": "launchApp",
      "description": "Descricao legivel em portugues",
      "maestro_command": "- launchApp"
    }}
  ],
  "yaml_flow": "appId: com.foxbit.exchange\\n---\\n- clearState\\n- launchApp\\n..."
}}
"""


class ParseResult:
    def __init__(self, steps: List[TestStep], test_name: str, estimated_duration_s: int,
                 yaml_flow: str = "", env_vars_needed: list = None, app_id: str = ""):
        self.steps = steps
        self.test_name = test_name
        self.estimated_duration_s = estimated_duration_s
        self.yaml_flow = yaml_flow
        self.env_vars_needed = env_vars_needed or []
        self.app_id = app_id


class PromptParser:
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=httpx.AsyncClient(verify=False)
        )

    async def parse(self, prompt: str, platform: str = "android", model: str = "claude-sonnet-4-6") -> ParseResult:
        try:
            logger.info(f"Parsing prompt for {platform} with model {model}: {prompt}")
            message = await self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=PARSE_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Plataforma: {platform}\n\nInstrução: {prompt}"
                }]
            )

            content = message.content[0].text
            content = _clean_json(content)
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

    async def parse_stream(self, prompt: str, platform: str = "android", ui_context: str = "", model: str = "claude-sonnet-4-6", engine: str = "uiautomator2"):
        logger.info(f"Stream parsing for {platform} | model={model} | engine={engine} | ui_context={bool(ui_context)}")

        is_maestro = engine == "maestro"
        system_prompt = MAESTRO_SYSTEM_PROMPT if is_maestro else PARSE_SYSTEM_PROMPT

        user_content = f"Plataforma: {platform}\n\nInstrução: {prompt}"
        if ui_context and not is_maestro:
            user_content += (
                f"\n\n══ CONTEXTO DE UI DA TELA ATUAL ══\n"
                f"Analise o XML abaixo e extraia os seletores REAIS para cada elemento:\n"
                f"```xml\n{ui_context}\n```\n"
                f"LEMBRE-SE: resource-id vazio + text vazio + content-desc vazio = use xpath://android.widget.EditText[índice]"
            )

        try:
            async with self.client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": user_content
                }]
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"

                message = await stream.get_final_message()
                content = _clean_json(message.content[0].text)
                data = json.loads(content)

                if is_maestro:
                    # Maestro returns a different format with yaml_flow
                    maestro_steps = data.get("steps", [])
                    final_payload = {
                        "type": "result",
                        "engine": "maestro",
                        "steps": maestro_steps,
                        "test_name": data.get("test_name", "maestro_test"),
                        "estimated_duration_s": data.get("estimated_duration_s", 30),
                        "yaml_flow": data.get("yaml_flow", ""),
                        "app_id": data.get("app_id", ""),
                        "env_vars_needed": data.get("env_vars_needed", []),
                    }
                    yield f"data: {json.dumps(final_payload)}\n\n"
                else:
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
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    def _validate_steps(self, steps_data: List[Dict[str, Any]]) -> List[TestStep]:
        validated = []
        for step in steps_data:
            try:
                action_str = step.get("action", "")
                try:
                    action = StepAction(action_str)
                except ValueError:
                    if action_str == "type":
                        action = StepAction.TYPE_TEXT
                    elif action_str == "back":
                        action = StepAction.PRESS_BACK
                    elif action_str == "home":
                        action = StepAction.PRESS_HOME
                    else:
                        continue

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

    async def convert_recording_to_maestro(self, recorded_events: list, width: int, height: int, model: str = "claude-sonnet-4-6") -> dict:
        """Convert recorded interactions to Maestro YAML via Claude."""
        prompt = MAESTRO_RECORDING_PROMPT.format(
            recorded_events=json.dumps(recorded_events, ensure_ascii=False),
            width=width,
            height=height,
        )
        try:
            message = await self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=prompt,
                messages=[{
                    "role": "user",
                    "content": "Converta as interacoes gravadas acima em um YAML Maestro de producao.",
                }],
            )
            content = _clean_json(message.content[0].text)
            return json.loads(content)
        except Exception as e:
            logger.error(f"Maestro recording conversion failed: {e}")
            raise ValueError(f"Failed to convert recording: {str(e)}")


def _clean_json(content: str) -> str:
    """Strip markdown code blocks from AI output."""
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    return content.strip()
