import anthropic
import httpx
import json
import logging
from typing import List, Dict, Any
from models.step import TestStep, StepAction
import uuid

try:
    from ai.premises_loader import format_premises_context
except ImportError:
    try:
        from premises_loader import format_premises_context
    except ImportError:
        def format_premises_context(path=None): return ""

logger = logging.getLogger("prompt_parser")

try:
    from log_manager import log_manager as _log_manager
except ImportError:
    _log_manager = None


def _build_log(message: str, build_id: str, level: str = "INFO"):
    if _log_manager and build_id:
        _log_manager.build(message, build_id=build_id, level=level)

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
Voce e um Engenheiro de Automacao Mobile Senior especialista no Maestro v2.x e em IA para testes.
Sua funcao: converter instrucoes de teste em passos Maestro PERFEITOS, seguindo rigorosamente o pipeline abaixo.

=================================================================
 PIPELINE DE GERACAO -- SIGA ESTA ORDEM SEMPRE
=================================================================

-----------------------------------------------------------------
ETAPA 1 -- INGESTAO DE CONTEXTO (antes de qualquer geracao)
-----------------------------------------------------------------
Leia e processe TODOS os contextos recebidos nesta ordem:
  [OBRIGATORIO]  Premissas do projeto (bloco acima desta mensagem, se presente)
  [SE PRESENTE]  Element map / JSON do scanner
                 -> extraia: id, text, hint, contentDescription, bounds, className
  [SE PRESENTE]  Imagens/screenshots
                 -> extraia visualmente: textos visiveis, botoes, campos, placeholders, icones
  [SE PRESENTE]  Hierarquia XML
                 -> extraia: resource-id, text, content-desc, class

SO avance para a ETAPA 2 apos processar TUDO que foi recebido.

-----------------------------------------------------------------
ETAPA 2 -- INTERPRETACAO SEMANTICA (NAO literal)
-----------------------------------------------------------------
O usuario escreve em linguagem natural. Voce DEVE:
  * Separar INTENCOES: acao (tap, input, scroll) vs. validacao (assertVisible)
  * Extrair o IDENTIFICADOR correto do elemento, sem o tipo de componente
  * Ordenar passos: validacao ANTES de acao quando o usuario pedir
  * Adicionar passos implicitos (ex: waitForAnimationToEnd apos launchApp)

PROIBIDO usar palavras descritivas nos seletores:
  "botao", "campo", "tela", "aba", "menu", "icone", "link", "elemento",
  "ficar", "habilitado", "visivel", "aparecer", "para", "realizar", "fazer"

EXEMPLOS:
  Usuario: "Clica no botao Entrar, mas antes valide que existe"
  ERRADO: assertVisible: "botao Entrar"  CERTO: assertVisible: "Entrar" (primeiro)
  ERRADO: tapOn: "botao Entrar"          CERTO: tapOn: "Entrar" (depois)

  Usuario: "Toca no campo de email"
  ERRADO: tapOn: "email"    CERTO: tapOn: "Digite seu e-mail" (placeholder real)

-----------------------------------------------------------------
ETAPA 3 -- RESOLUCAO DE ELEMENTOS (hierarquia de fallback)
-----------------------------------------------------------------
Para cada elemento, aplique esta hierarquia (do mais ao menos confiavel):
  1. resourceId / id nativo Android     -> tapOn: { id: "btn_login" }
  2. text exato visivel na tela         -> tapOn: "Entrar"
  3. contentDescription / accessibility -> tapOn: "descricao acessibilidade"
  4. hint / placeholder do campo        -> tapOn: "Digite seu e-mail"
  5. label semantico
  6. index na hierarquia Android        -> tapOn: { text: "Entrar", index: 0 }
  7. coordenadas absolutas (ULTIMO)     -> tapOn: { point: "50%,80%" }

Regra: NUNCA use coordenadas se houver qualquer outra evidencia disponivel.

-----------------------------------------------------------------
ETAPA 4 -- SIMULACAO INTERNA + CRUZAMENTO DE EVIDENCIAS (CRITICO)
-----------------------------------------------------------------
Antes de escrever qualquer linha do YAML final, para CADA passo:

  1. Tente o seletor de maior prioridade (id)
  2. Se nao houver id no element_map, tente o proximo nivel
  3. Valide com cruzamento de evidencias:
     - O elemento aparece no element_map/JSON do scanner com esse atributo?
     - O elemento e visivel na imagem/print fornecida?
     - A hierarquia XML/Android confirma esse elemento nessa posicao?

  SE >= 2 evidencias confirmarem -> use o seletor + confidence: "high"
  SE apenas 1 evidencia           -> use o seletor + confidence: "low"
  SE nenhuma evidencia            -> NAO inclua o passo + adicione ao unresolved_elements

  REGRA ABSOLUTA: Prefira um YAML menor e correto a um YAML completo e instavel.

-----------------------------------------------------------------
ETAPA 5 -- MONTAGEM DO YAML FINAL
-----------------------------------------------------------------
  * Escreva SOMENTE os comandos que passaram na simulacao interna
  * Adicione comentarios inline de confianca no yaml_flow:
      # [OK] id confirmado no scanner + imagem   -> high
      # [OK] texto confirmado no scanner          -> high
      # [BAIXA] texto extraido so da imagem       -> low
      # [BAIXA] sem evidencia direta, inferido    -> low

REGRAS DE MONTAGEM OBRIGATORIAS:
  * Apos launchApp: SEMPRE extendedWaitUntil com elemento da primeira tela
  * Apos tap que muda de tela: waitForAnimationToEnd
  * Antes de tap em botao apos digitacao: hideKeyboard
  * NAO usar clearState (causa "app not installed")
  * Timeout padrao: 8000ms para extendedWaitUntil

COMANDOS PROIBIDOS (nao existem no Maestro v2):
  wait, sleep, delay -> Use extendedWaitUntil

=================================================================
 COMANDOS VALIDOS DO MAESTRO v2
=================================================================
- launchApp
- tapOn: "texto"
- tapOn: { id: "resource_id" }
- tapOn: { text: "texto", index: N }
- tapOn: { point: "X%,Y%" }
- inputText: "valor"
- assertVisible: "texto"
- assertVisible: { id: "resource_id" }
- assertNotVisible: "texto"
- waitForAnimationToEnd
- extendedWaitUntil:
    visible: "texto"
    timeout: 8000
- extendedWaitUntil:
    visible:
      id: "resource_id"
    timeout: 8000
- hideKeyboard
- back
- scroll
- swipe:
    direction: LEFT
- longPressOn: "texto"
- pressKey: Home

=================================================================
 APPS CONHECIDOS (com elementos reais confirmados)
=================================================================
- Foxbit: appId = "br.com.foxbit.foxbitandroid"
  Tela inicial: botoes "Entrar", "Criar conta"
  Tela de login:
    - Label "E-mail" | placeholder "Digite seu e-mail"
    - Label "Senha" | placeholder "Digite sua senha"
    - Botao "Entrar" (desabilitado ate preencher)
    - Link "Esqueci minha senha"

- WasteZero: appId = "com.app.wastezero_app"

Convencoes para apps desconhecidos (sem imagem/XML):
  email -> "Digite seu e-mail" ou "E-mail"
  senha -> "Digite sua senha" ou "Senha"
  busca -> "Buscar" ou "Pesquisar"

=================================================================
 FORMATO DE SAIDA OBRIGATORIO (JSON puro, sem markdown)
=================================================================
{
  "test_name": "nome_descritivo_em_snake_case",
  "app_id": "com.package.name",
  "env_vars_needed": [],
  "estimated_duration_s": 30,
  "confidence_report": {
    "high_confidence_steps": [1, 2, 3],
    "low_confidence_steps": [4],
    "unresolved_elements": ["nome do elemento nao resolvido"]
  },
  "steps": [
    {
      "num": 1,
      "action": "launchApp",
      "description": "Abre o app",
      "confidence": "high",
      "confidence_comment": "razao da confianca",
      "maestro_command": "- launchApp"
    }
  ],
  "yaml_flow": "appId: ...\\n---\\n- launchApp # [OK] confirmado\\n..."
}

RETORNAR APENAS JSON valido -- sem markdown, sem texto explicativo fora do JSON.
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

    async def parse_stream(self, prompt: str, platform: str = "android", ui_context: str = "",
                           model: str = "claude-sonnet-4-6", engine: str = "uiautomator2",
                           images_base64: list[dict] = None,
                           element_map_context: str = "",
                           build_id: str = ""):
        """
        Generate test steps from prompt, optionally using reference images, UI hierarchy,
        and a pre-scanned element map.

        images_base64: list of {"data": "<base64>", "media_type": "image/jpeg", "label": "nome"}
        element_map_context: text with all known elements from the app (from 'Ler Aplicacao' scan)
        build_id: optional ID for structured build logging
        """
        has_images = bool(images_base64)
        has_hierarchy = bool(ui_context)
        has_element_map = bool(element_map_context)
        logger.info(f"Stream parsing | platform={platform} | model={model} | engine={engine} "
                     f"| ui_context={has_hierarchy} | images={len(images_base64 or [])} "
                     f"| element_map={has_element_map}")

        # Detailed build log — strategy selection
        _build_log(f"Iniciando geração com Claude ({model})", build_id)
        _build_log(f"Engine: {engine.upper()} | Plataforma: {platform}", build_id)
        _build_log(f"Contextos disponíveis para IA:", build_id)
        if has_images:
            _build_log(f"  [IMAGENS] ✓ {len(images_base64)} imagem(ns) de referência → usadas como fonte primária de seletores", build_id)
            for i, img in enumerate(images_base64 or []):
                _build_log(f"    [{i+1}] {img.get('label', 'sem-nome')} ({img.get('media_type', '?')})", build_id)
        else:
            _build_log(f"  [IMAGENS] ✗ Nenhuma imagem de referência", build_id)
        if has_hierarchy:
            _build_log(f"  [XML] ✓ Hierarquia XML do device: {len(ui_context)} chars → usada para extrair resource-ids reais", build_id)
        else:
            _build_log(f"  [XML] ✗ Sem hierarquia XML (device não conectado ou não respondeu)", build_id)
        if has_element_map:
            _build_log(f"  [ELEMENT_MAP] ✓ Mapa de elementos escaneado: {len(element_map_context)} chars → IDs e textos confirmados do app real", build_id)
        else:
            _build_log(f"  [ELEMENT_MAP] ✗ Sem element map (execute 'Ler Aplicação' no projeto para escanear)", build_id)

        priority = []
        if has_element_map: priority.append("element_map")
        if has_images: priority.append("imagens")
        if has_hierarchy: priority.append("hierarquia_xml")
        if not priority: priority.append("conhecimento_geral")
        _build_log(f"Prioridade de seletores: {' > '.join(priority)}", build_id)

        is_maestro = engine == "maestro"
        system_prompt = MAESTRO_SYSTEM_PROMPT if is_maestro else PARSE_SYSTEM_PROMPT

        # Build multimodal user message
        content_blocks = []

        # 0. Inject premises context FIRST for Maestro (ETAPA 1 do pipeline)
        if is_maestro:
            premises_text = format_premises_context()
            if premises_text:
                content_blocks.append({
                    "type": "text",
                    "text": premises_text,
                })
                _build_log("  [PREMISSAS] ✓ premises.yaml injetado como contexto primário", build_id)

        # 1. Add reference images FIRST (so the AI sees them before the prompt)

        if images_base64:
            content_blocks.append({
                "type": "text",
                "text": (
                    "══ IMAGENS DE REFERENCIA DO APP ══\n"
                    "Analise CADA imagem abaixo com atencao. Extraia todos os textos EXATOS "
                    "visiveis: botoes, labels, placeholders, hints, titulos.\n"
                    "Use SOMENTE esses textos exatos nos seletores Maestro.\n"
                    f"Total de imagens: {len(images_base64)}\n"
                )
            })
            for i, img in enumerate(images_base64):
                label = img.get("label", f"screenshot_{i+1}")
                content_blocks.append({
                    "type": "text",
                    "text": f"\n--- Imagem {i+1}: {label} ---"
                })
                content_blocks.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img.get("media_type", "image/jpeg"),
                        "data": img["data"],
                    }
                })

        # 2. Add UI hierarchy (for both Maestro and UIAutomator2)
        if ui_context:
            # Truncate very long hierarchies to avoid token limits
            xml_truncated = ui_context[:15000] if len(ui_context) > 15000 else ui_context
            content_blocks.append({
                "type": "text",
                "text": (
                    "\n══ HIERARQUIA XML DO ANDROID (device conectado) ══\n"
                    "Extraia resource-ids, texts, hints e content-descriptions de cada elemento.\n"
                    "Cruze com as imagens acima para confirmar os seletores.\n"
                    f"```xml\n{xml_truncated}\n```\n"
                )
            })

        # 3. Add element map from scanner (if available)
        if element_map_context:
            content_blocks.append({
                "type": "text",
                "text": (
                    f"\n{element_map_context}\n"
                    "IMPORTANTE: Este mapa foi coletado automaticamente do app real. "
                    "Os resource-ids e textos acima sao REAIS e confirmados. "
                    "USE ESTES SELETORES com prioridade maxima na montagem dos passos. "
                    "Se um elemento tem id, use tapOn: {{ id: \"id\" }}. "
                    "Se tem hint, use tapOn: \"hint_text\".\n"
                )
            })

        # 4. Add the user prompt
        instruction_prefix = ""
        if has_images:
            instruction_prefix = (
                "IMPORTANTE: Voce recebeu imagens de referencia do app acima. "
                "Use os textos EXATOS que voce ve nas imagens como seletores. "
                "NAO interprete o prompt abaixo de forma literal. "
                "Exemplo: se o usuario diz 'clica no botao Entrar' e na imagem voce ve um botao escrito 'Entrar', "
                "use tapOn: \"Entrar\" e NAO tapOn: \"botao Entrar\".\n\n"
            )
        if has_hierarchy:
            instruction_prefix += (
                "IMPORTANTE: Voce recebeu a hierarquia XML do device. "
                "Use os resource-ids encontrados no XML quando disponiveis. "
                "Confirme que os textos batem com o que aparece nas imagens.\n\n"
            )
        if has_element_map:
            instruction_prefix += (
                "IMPORTANTE: Voce recebeu o MAPA DE ELEMENTOS do app escaneado. "
                "Estes IDs e textos foram confirmados no device real. USE-OS.\n\n"
            )

        content_blocks.append({
            "type": "text",
            "text": f"{instruction_prefix}Plataforma: {platform}\n\nInstrucao do usuario: {prompt}"
        })

        try:
            async with self.client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": content_blocks
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
                    confidence_report = data.get("confidence_report", {
                        "high_confidence_steps": [],
                        "low_confidence_steps": [],
                        "unresolved_elements": [],
                    })
                    # Backfill confidence from step data if report is empty
                    if not confidence_report.get("high_confidence_steps") and not confidence_report.get("low_confidence_steps"):
                        for s in maestro_steps:
                            num = s.get("num", 0)
                            conf = s.get("confidence", "high")
                            if conf == "low":
                                confidence_report.setdefault("low_confidence_steps", []).append(num)
                            elif conf != "unresolved":
                                confidence_report.setdefault("high_confidence_steps", []).append(num)

                    final_payload = {
                        "type": "result",
                        "engine": "maestro",
                        "steps": maestro_steps,
                        "test_name": data.get("test_name", "maestro_test"),
                        "estimated_duration_s": data.get("estimated_duration_s", 30),
                        "yaml_flow": data.get("yaml_flow", ""),
                        "app_id": data.get("app_id", ""),
                        "env_vars_needed": data.get("env_vars_needed", []),
                        "confidence_report": confidence_report,
                    }
                    yield f"data: {json.dumps(final_payload)}\n\n"

                    # Log result summary
                    _build_log(f"─── Resultado Maestro Gerado ───", build_id)
                    _build_log(f"Teste: {data.get('test_name', '?')} | App: {data.get('app_id', 'N/A')} | Duração estimada: {data.get('estimated_duration_s', '?')}s", build_id)
                    _build_log(f"Total de passos: {len(maestro_steps)}", build_id)
                    for s in maestro_steps:
                        cmd = s.get('maestro_command', '').replace('\n', ' ').strip()[:80]
                        _build_log(f"  [{s.get('num','?')}] {s.get('action','?')}: {s.get('description','')[:60]} → {cmd}", build_id)
                    env_vars = data.get("env_vars_needed", [])
                    if env_vars:
                        _build_log(f"Variáveis de ambiente necessárias: {', '.join(env_vars)}", build_id)
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

                    # Log result summary
                    _build_log(f"─── Resultado UIAutomator2 Gerado ───", build_id)
                    _build_log(f"Teste: {result.test_name} | Duração estimada: {result.estimated_duration_s}s | Total: {len(result.steps)} passos", build_id)
                    for s in result.steps:
                        strats = ', '.join(s.target_strategies[:2]) if s.target_strategies else 'N/A'
                        _build_log(f"  [{s.id[:6]}] {s.action}: {s.description or s.target or ''} → [{strats}]", build_id)

        except Exception as e:
            logger.error(f"Error streaming parsing prompt with AI: {e}")
            _build_log(f"ERRO na geração: {e}", build_id, level="ERROR")
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
