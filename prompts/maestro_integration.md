# QAMind — Maestro Integration — Final Version (English + Português)

---

# ENGLISH VERSION

## Project Overview

QAMind is an AI-powered mobile test automation framework with a web interface. It already has:
- Real-time Android device mirroring via scrcpy/SSE streaming
- Natural language prompt field connected to Claude Sonnet
- UIAutomator2 as the current execution engine (keep it 100% untouched)
- Test recording via web mirror (tap/swipe/type captured from browser)
- WebSocket for real-time step status updates
- Logging system writing to `/logs` folder

**The goal of this task:** Integrate Maestro (https://maestro.dev) as a second execution engine alongside UIAutomator2. The user selects the engine via a combobox. UIAutomator2 stays exactly as it is today. Maestro is purely additive — zero regression allowed.

**The ultimate success criterion: the same test must run 10 consecutive times without a single failure.** This is the only verdict that confirms the integration is working correctly.

**Do NOT clone the Maestro source code repository.** The source is ~50k lines of Kotlin/Java focused on the internal runtime — irrelevant for this integration. All syntax, CLI behavior, and output format needed are documented in this prompt.

---

## Maestro YAML Syntax Reference

### File structure
```yaml
appId: com.foxbit.exchange
---
- launchApp
- tapOn: "Entrar"
- inputText: "isaias@gmail.com"
- assertVisible: "Portfólio"
```

### Complete command reference

**App control:**
```yaml
- launchApp
- launchApp:
    appId: com.other.app
- stopApp
- clearState                         # clears app data — use before launchApp in login tests
- openLink: https://foxbit.com.br
```

**Tapping elements — use in this priority order:**
```yaml
- tapOn: "Button text"               # 1st choice: visible text
- tapOn:
    id: "resource_id"                # 2nd choice: accessibility id
- tapOn:
    text: "Entrar"
    index: 1                         # 3rd choice: text + index (0-based) when duplicates exist
- tapOn:
    point: "50%,80%"                 # LAST RESORT: percentage coordinates only
- longPressOn: "Element"
- doubleTapOn: "Element"
```

**Text input:**
```yaml
- tapOn: "Email field"               # always tap field first
- inputText: "isaias@gmail.com"
- inputText: ${PASSWORD}             # env variable for sensitive data
- clearTextField
- hideKeyboard
```

**Scrolling and swiping:**
```yaml
- scroll
- scroll:
    direction: UP                    # UP, DOWN, LEFT, RIGHT
- scrollUntilVisible:
    element:
      text: "Target text"
    direction: DOWN
- swipe:
    direction: LEFT
- swipe:
    start: "10%,50%"
    end: "90%,50%"
```

**Assertions and waiting — critical for stability:**
```yaml
- assertVisible: "Expected text"
- assertVisible:
    id: "element_id"
- assertNotVisible: "Error message"
- waitForAnimationToEnd              # always add after taps that trigger screen transitions
- extendedWaitUntil:
    visible:
      text: "Content loaded"
    timeout: 10000                   # use for any element loaded from network
- wait:
    minDuration: 2000
```

**Navigation:**
```yaml
- back
- pressKey: Home                     # Home, Back, VolumeUp, VolumeDown, Enter
- takeScreenshot: step_label
```

**Environment variables:**
```yaml
# Reference: ${VAR_NAME}
# Pass at runtime: maestro test --env PASSWORD=secret flow.yaml
- inputText: ${EMAIL}
- inputText: ${PASSWORD}
```

### Maestro CLI commands
```bash
maestro --version
maestro --device {udid} test flow.yaml
maestro --device {udid} test --env EMAIL=user@test.com --env PASSWORD=secret flow.yaml
maestro studio                       # visual inspector — use when element not found
```

### Maestro CLI output format
```
✅ Run test: launchApp (2341ms)
✅ Run test: tapOn "Entrar" (412ms)
❌ Run test: assertVisible "Portfólio" - No visible elements match (10000ms)
```
Exit code 0 = all passed. Exit code 1 = at least one step failed.

---

## Part 1 — Engine Selector UI

Add an engine combobox to the bottom toolbar of the test editor, between the LLM model selector and "Gerar Tests":

```
[Claude Sonnet 4.6 ▼]  [⚙ Engine ▼]  [✓ Gerar Tests]  [✏ MOCK]  [● Gravar Testes]
```

Dropdown options:
```
UIAutomator2   — current engine, zero change to existing behavior
Maestro        — new integration
```

Rules:
- Default: UIAutomator2
- Persist selection per project in database field `default_engine`
- Switching engine only affects new test creation — existing tests keep their engine forever
- Each step card shows a small badge: `[u2]` or `[maestro]`

---

## Part 2 — Maestro Health Check

```
GET /api/engines/status
```

Returns:
```json
{
  "uiautomator2": { "available": true, "version": "3.3.1" },
  "maestro": { "available": true, "version": "1.40.0" }
}
```

Detection: run `maestro --version` via subprocess, timeout 3 seconds.

If Maestro is not installed and the user selects it, show inline warning:
```
⚠️  Maestro not found.
    Install: curl -Ls "https://get.maestro.mobile.dev" | bash
    Then restart the QAMind daemon.
```

### Port 7001 forward — handle conflicts

Before running `adb -s {udid} forward tcp:7001 tcp:7001`, check existing forwards:

```python
result = subprocess.run(['adb', 'forward', '--list'], capture_output=True, text=True)

# If tcp:7001 is already forwarded to the same device → reuse, do nothing
# If tcp:7001 is forwarded to a different device → remove it first, then re-forward
# If not forwarded at all → forward normally

if f"{udid} tcp:7001" in result.stdout:
    pass  # already correct, reuse
elif "tcp:7001" in result.stdout:
    subprocess.run(['adb', 'forward', '--remove', 'tcp:7001'])
    subprocess.run(['adb', '-s', udid, 'forward', 'tcp:7001', 'tcp:7001'])
else:
    subprocess.run(['adb', '-s', udid, 'forward', 'tcp:7001', 'tcp:7001'])
```

---

## Part 3 — Path A: Natural Language / Gherkin → Maestro YAML → Execute

The user types in natural language or Gherkin. The LLM must deliver a complete, ready-to-execute Maestro YAML — every element fully mapped so Maestro can find it without guessing.

### System prompt sent to Claude when Maestro engine is selected

```
You are an expert in the Maestro mobile testing framework (https://maestro.dev).
The user will describe a mobile test scenario in natural language or Gherkin.

YOUR JOB:
1. Identify the app being tested (infer package ID from context if not explicit)
2. Break the scenario into atomic, single-action steps
3. For each step, choose the BEST Maestro locator in this order:
   - Visible text → tapOn: "text"
   - Accessibility ID → tapOn: id: "id"
   - Text + index when duplicates → tapOn: { text: "text", index: N }
   - Percentage coordinates as absolute last resort → tapOn: { point: "X%,Y%" }
4. Add assertVisible after every critical action (login, navigation, form submit)
5. Add wait: minDuration: 2000 after launchApp
6. Add waitForAnimationToEnd before assertions that follow screen transitions
7. Add extendedWaitUntil (timeout: 10000) for any element loaded from network
8. Use ${VAR_NAME} for all passwords and sensitive data
9. If the test involves a login screen, add clearState before launchApp

GHERKIN MAPPING:
- Given / Dado → setup steps (launchApp, clearState, openLink)
- When / Quando → action steps (tapOn, inputText, scroll, swipe)
- Then / Então → assertion steps (assertVisible, assertNotVisible)
- And / E → additional steps of the same type as the previous line

RELIABILITY RULES — tests must pass 10 consecutive times:
- Never use fixed pixel coordinates when text or ID is available
- Always clearState before launchApp in login flow tests
- Always waitForAnimationToEnd before asserting after transitions
- Always use extendedWaitUntil for network-loaded elements (balances, lists, user data)
- Assert a unique post-login element, not just any element on screen

RETURN ONLY valid JSON — no markdown fences, no explanation text:
{
  "test_name": "descriptive_name_in_snake_case",
  "app_id": "com.package.name",
  "env_vars_needed": ["PASSWORD", "EMAIL"],
  "steps": [
    {
      "num": 1,
      "description": "Human readable description in the user's language",
      "maestro_command": "- launchApp"
    }
  ],
  "yaml_flow": "appId: com.foxbit.exchange\n---\n- clearState\n- launchApp\n..."
}
```

### After Claude responds

1. Parse JSON → extract `steps` → render in left panel animated one by one (120ms delay)
2. Extract `yaml_flow` → **validate before saving** (see Part 2 validation below)
3. Write validated YAML to `/flows/{project_id}/{test_name}.yaml`
4. If `env_vars_needed` is not empty → show modal before executing:
   ```
   ┌─────────────────────────────────┐
   │  Environment variables needed   │
   │  EMAIL:    [________________]   │
   │  PASSWORD: [________________]   │
   │                      [Run Test] │
   └─────────────────────────────────┘
   ```
5. Execute via `maestro --device {udid} test --env KEY=value flow.yaml`
6. Stream output via WebSocket → update step statuses in real time

### YAML validation before saving

Before writing the YAML file, validate the syntax locally:

```python
import yaml

def validate_maestro_yaml(content: str) -> tuple[bool, str]:
    try:
        # Split on --- separator (Maestro uses multi-document YAML)
        parts = content.split('---', 1)
        if len(parts) != 2:
            return False, "Missing --- separator between appId and flow commands"
        
        header = yaml.safe_load(parts[0])
        if not header or 'appId' not in header:
            return False, "Missing appId at the top of the flow"
        
        flow = yaml.safe_load(parts[1])
        if not isinstance(flow, list):
            return False, "Flow commands must be a YAML list"
        
        return True, "OK"
    except yaml.YAMLError as e:
        return False, str(e)
```

If validation fails, do not save the file. Show the error inline in the modal editor so the user can fix it. Do not close the modal.

---

## Part 4 — Path B: Recording → LLM Converts → Maestro YAML

### Recording phase (keep existing code — no changes)

- Activate recording mode (● REC badge)
- Capture every interaction on the web mirror: tap coordinates, swipes, typed text
- After each tap, run `adb shell uiautomator dump` and parse XML to enrich with element info
- Show steps appearing in real time in the left panel

### Conversion phase — send recorded events to Claude

When the user clicks "Parar Gravação", send the recorded events to Claude:

```
You are a Maestro test automation expert.
The following interactions were recorded from a real device session.
Convert them into a production-quality Maestro YAML flow that will pass reliably 10 consecutive times.

RECORDED INTERACTIONS:
{json_array_of_recorded_events}

Each event has:
- type: "tap", "type", "swipe", "keyevent"
- coordinates: x, y in pixels — device resolution: {width}x{height}
- element_info: { text, resourceId, contentDescription } from XML dump — may be null
- value: typed text (passwords already masked as [MASKED_PASSWORD])

CONVERSION RULES (apply in this order):
1. element_info.text exists → tapOn: "text" (discard coordinates)
2. element_info.resourceId exists, no text → tapOn: id: "stripped_resource_id"
   (strip the package prefix: "com.foxbit.exchange:id/btn_login" → "btn_login")
3. element_info is null → convert to percentage: x_pct = round(x/width*100), y_pct = round(y/height*100) → point: "X%,Y%"
4. Consecutive type events on the same field → merge into one inputText
5. Add waitForAnimationToEnd after taps that cause screen transitions
6. Add assertVisible after login and major navigation steps
7. Replace [MASKED_PASSWORD] with ${PASSWORD}
8. If the first launchApp is for a login screen → prepend clearState before it
9. Infer appId from resourceId prefix if available

Return the same JSON format as Path A.
```

### Save modal with editable YAML preview

```
┌──────────────────────────────────────────────────────────┐
│  Save Recorded Test                                      │
│                                                          │
│  Name:    [Login Foxbit__________________________]       │
│  Project: [Foxbit ▼]                                     │
│  Engine:  Maestro                                        │
│                                                          │
│  Generated YAML:                            [📋 Copy]   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ appId: com.foxbit.exchange                         │ │
│  │ ---                                                │ │
│  │ - clearState                                       │ │
│  │ - launchApp                                        │ │
│  │ - wait:                                            │ │
│  │     minDuration: 2000                              │ │
│  │ - tapOn: "Entrar"                                  │ │
│  │ - tapOn:                                           │ │
│  │     id: "email_input"                              │ │
│  │ - inputText: "isaias@gmail.com"                    │ │
│  │ - tapOn:                                           │ │
│  │     id: "password_input"                           │ │
│  │ - inputText: ${PASSWORD}                           │ │
│  │ - tapOn: "Entrar"                                  │ │
│  │ - waitForAnimationToEnd                            │ │
│  │ - assertVisible: "Portfólio"                       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [inline validation error shown here if YAML is invalid] │
│                                                          │
│  [Cancel]    [Edit YAML manually]    [💾 Save Test]      │
└──────────────────────────────────────────────────────────┘
```

Validate YAML on every keystroke when in manual edit mode. Show error inline — do not allow saving invalid YAML.

---

## Part 5 — Execution Engine

```python
# daemon/engines/maestro_runner.py

async def run_with_maestro(yaml_path, udid, run_id, env_vars, ws_broadcaster):
    cmd = ['maestro', '--device', udid, 'test']
    
    for key, value in env_vars.items():
        cmd += ['--env', f'{key}={value}']
    
    cmd.append(yaml_path)
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )
    
    async for raw_line in process.stdout:
        line = raw_line.decode('utf-8', errors='replace').strip()
        if not line:
            continue
        
        # Always broadcast raw log line
        await ws_broadcaster.broadcast(run_id, {
            "type": "maestro_log",
            "line": line,
            "run_id": run_id
        })
        
        # Parse step status — check both emoji AND text keywords
        # (emoji may not render on some Linux locales)
        event = parse_maestro_line(line, run_id)
        if event:
            await ws_broadcaster.broadcast(run_id, event)
    
    code = await process.wait()
    await ws_broadcaster.broadcast(run_id, {
        "type": "run_completed",
        "status": "passed" if code == 0 else "failed",
        "run_id": run_id
    })


def parse_maestro_line(line: str, run_id: str) -> dict | None:
    """
    Parse Maestro CLI output into WebSocket events.
    Checks BOTH emoji and text keywords as fallback
    because emoji rendering depends on terminal locale.
    
    Maestro output patterns:
    Success: "✅ Run test: tapOn ..." OR line contains "Completed" / "PASSED"
    Failure: "❌ Run test: ..."     OR line contains "FAILED" / "Error" / "not found"
    Running: "- tapOn ..."          OR line contains "Running"
    """
    line_upper = line.upper()
    
    is_success = '✅' in line or 'COMPLETED' in line_upper or 'PASSED' in line_upper
    is_failure = '❌' in line or 'FAILED' in line_upper or 'NOT FOUND' in line_upper or 'ERROR' in line_upper
    is_running = line.strip().startswith('- ') or 'RUNNING' in line_upper
    
    if is_success:
        return {"type": "step_completed", "run_id": run_id, "message": line}
    elif is_failure:
        return {"type": "step_failed", "run_id": run_id, "message": line}
    elif is_running:
        return {"type": "step_started", "run_id": run_id, "message": line}
    
    return None
```

---

## Part 6 — Debug: Maestro Studio Suggestion

When a test run fails with a step containing "not found" or "No visible elements", show a debug suggestion in the UI below the failed step:

```
❌ Step 3 failed — Element not found: tapOn "Entrar"

💡 Debug tip: Open Maestro Studio to inspect live elements on screen.
   Run in terminal: maestro studio
   Then navigate to the failing screen and find the correct locator.
```

This helps the user quickly identify why an element was not found and update the YAML with the correct locator.

---

## Part 7 — Logs for Maestro Engine

Extend the existing `/logs` system. When engine = Maestro, every execution log must include:

```
[2026-03-24 14:40:00.000] [RUN:abc123] [INFO]    Engine: MAESTRO v1.40.0
[2026-03-24 14:40:00.000] [RUN:abc123] [INFO]    YAML: /flows/foxbit/login_foxbit.yaml
[2026-03-24 14:40:00.000] [RUN:abc123] [INFO]    Env vars: EMAIL=*** PASSWORD=***
[2026-03-24 14:40:01.234] [RUN:abc123] [MAESTRO] ▶ Running: clearState
[2026-03-24 14:40:01.891] [RUN:abc123] [MAESTRO] ✅ clearState (657ms)
[2026-03-24 14:40:01.892] [RUN:abc123] [MAESTRO] ▶ Running: launchApp
[2026-03-24 14:40:04.012] [RUN:abc123] [MAESTRO] ✅ launchApp (2120ms)
[2026-03-24 14:40:04.013] [RUN:abc123] [MAESTRO] ▶ Running: tapOn "Entrar"
[2026-03-24 14:40:04.891] [RUN:abc123] [MAESTRO] ❌ tapOn "Entrar" FAILED — No visible elements match
[2026-03-24 14:40:04.892] [RUN:abc123] [ERROR]   Exit code: 1
[2026-03-24 14:40:04.893] [RUN:abc123] [INFO]    Maestro Studio hint: run `maestro studio` to inspect screen
[2026-03-24 14:40:04.894] [RUN:abc123] [INFO]    Full YAML content:
appId: com.foxbit.exchange
---
- clearState
- launchApp
...
```

Mask env var values in logs: show `EMAIL=***` not `EMAIL=actual@value.com`.

---

## Part 8 — Coexistence Rules

1. UIAutomator2 tests always execute with UIAutomator2 — the engine is stored per test, not per session
2. Maestro tests always execute with Maestro
3. The combobox only affects new test creation
4. YAML files are only created for Maestro tests
5. Device mirror, scrcpy streaming, and real-time preview work identically regardless of engine
6. No existing UIAutomator2 code may be modified as part of this task

---

## Acceptance Criteria

- [ ] Engine combobox in toolbar, UIAutomator2 selected by default
- [ ] Selecting UIAutomator2 produces zero change in existing behavior
- [ ] `GET /api/engines/status` returns availability and version of both engines
- [ ] Maestro not installed → inline warning with install command
- [ ] Port 7001 conflict handled: check existing forwards before running `adb forward`
- [ ] Path A: natural language / Gherkin → Claude generates YAML → steps animated in panel → Maestro executes on device
- [ ] Path B: recording → stop → Claude converts → save modal with editable YAML preview → YAML validated before save
- [ ] YAML validation runs before every save — invalid YAML shown inline, save blocked
- [ ] Env vars modal appears when YAML contains `${VAR}` references — values masked in logs
- [ ] Step statuses update in real time during Maestro execution
- [ ] Device mirror continues working during Maestro execution
- [ ] `parse_maestro_line` detects success/failure via both emoji AND text keywords
- [ ] When step fails with "element not found" → Maestro Studio hint shown in UI and in log
- [ ] YAML files saved to `/flows/{project_id}/`
- [ ] Full Maestro CLI output captured in log file per execution
- [ ] **A recorded login test passes 10 consecutive executions without modification**

---
---

# VERSÃO EM PORTUGUÊS

## Visão Geral do Projeto

QAMind é um framework de automação de testes mobile com IA e interface web. Já possui:
- Espelhamento em tempo real do device Android via scrcpy/SSE
- Campo de prompt em linguagem natural conectado ao Claude Sonnet
- UIAutomator2 como engine de execução atual (manter 100% intacto)
- Gravação de testes via espelhamento web
- WebSocket para atualização em tempo real do status dos steps
- Sistema de logs gravando em `/logs`

**Objetivo desta tarefa:** Integrar o Maestro (https://maestro.dev) como segunda engine de execução. O usuário seleciona a engine por combobox. UIAutomator2 permanece exatamente como está. Maestro é puramente adicional — zero regressão permitida.

**Critério definitivo de sucesso: o mesmo teste deve rodar 10 vezes consecutivas sem falha.** Esse é o único veredicto que confirma que a integração funcionou.

**NÃO clonar o repositório fonte do Maestro.** O fonte tem ~50k linhas de Kotlin/Java focadas no runtime interno — irrelevante para esta integração. Toda sintaxe, comportamento do CLI e formato de output necessários estão documentados neste prompt.

---

## Referência de Sintaxe YAML do Maestro

### Estrutura do arquivo
```yaml
appId: com.foxbit.exchange
---
- launchApp
- tapOn: "Entrar"
- inputText: "isaias@gmail.com"
- assertVisible: "Portfólio"
```

### Referência completa de comandos

**Controle do app:**
```yaml
- launchApp
- launchApp:
    appId: com.outro.app
- stopApp
- clearState                         # limpa dados do app — usar antes de launchApp em testes de login
- openLink: https://foxbit.com.br
```

**Tocar em elementos — usar nesta ordem de prioridade:**
```yaml
- tapOn: "Texto do botão"            # 1ª opção: texto visível
- tapOn:
    id: "resource_id"                # 2ª opção: id de acessibilidade
- tapOn:
    text: "Entrar"
    index: 1                         # 3ª opção: texto + índice quando há duplicatas (base 0)
- tapOn:
    point: "50%,80%"                 # ÚLTIMO RECURSO: coordenadas percentuais
- longPressOn: "Elemento"
- doubleTapOn: "Elemento"
```

**Entrada de texto:**
```yaml
- tapOn: "Campo de e-mail"           # sempre tocar no campo primeiro
- inputText: "isaias@gmail.com"
- inputText: ${SENHA}                # variável de ambiente para dados sensíveis
- clearTextField
- hideKeyboard
```

**Scroll e swipe:**
```yaml
- scroll
- scroll:
    direction: UP                    # UP, DOWN, LEFT, RIGHT
- scrollUntilVisible:
    element:
      text: "Texto alvo"
    direction: DOWN
- swipe:
    direction: LEFT
- swipe:
    start: "10%,50%"
    end: "90%,50%"
```

**Assertions e espera — crítico para estabilidade:**
```yaml
- assertVisible: "Texto esperado"
- assertVisible:
    id: "id_elemento"
- assertNotVisible: "Mensagem de erro"
- waitForAnimationToEnd              # sempre após taps que causam transição de tela
- extendedWaitUntil:
    visible:
      text: "Conteúdo carregado"
    timeout: 10000                   # usar para qualquer elemento carregado da rede
- wait:
    minDuration: 2000
```

**Navegação:**
```yaml
- back
- pressKey: Home
- takeScreenshot: label_do_step
```

**Variáveis de ambiente:**
```yaml
- inputText: ${EMAIL}
- inputText: ${SENHA}
# Passar na execução: maestro test --env SENHA=segredo flow.yaml
```

### Comandos CLI do Maestro
```bash
maestro --version
maestro --device {udid} test flow.yaml
maestro --device {udid} test --env EMAIL=user@test.com --env SENHA=segredo flow.yaml
maestro studio                       # inspetor visual — usar quando elemento não é encontrado
```

### Formato de output do CLI
```
✅ Run test: launchApp (2341ms)
✅ Run test: tapOn "Entrar" (412ms)
❌ Run test: assertVisible "Portfólio" - No visible elements match (10000ms)
```
Código de saída 0 = todos passaram. Código 1 = pelo menos um falhou.

---

## Parte 1 — Combobox de Engine na UI

Adicionar combobox na toolbar inferior do editor, entre o seletor de modelo LLM e "Gerar Tests":

```
[Claude Sonnet 4.6 ▼]  [⚙ Engine ▼]  [✓ Gerar Tests]  [✏ MOCK]  [● Gravar Testes]
```

Opções:
```
UIAutomator2  — engine atual, zero alteração no comportamento existente
Maestro       — nova integração
```

Regras:
- Padrão: UIAutomator2
- Persistir seleção por projeto em `default_engine` no banco
- Trocar engine só afeta criação de novos testes — testes existentes mantêm sua engine para sempre
- Badge em cada card de step: `[u2]` ou `[maestro]`

---

## Parte 2 — Health Check do Maestro

```
GET /api/engines/status
```

Detecção: executar `maestro --version` via subprocess, timeout 3 segundos.

Se Maestro não estiver instalado e for selecionado, mostrar:
```
⚠️  Maestro não encontrado.
    Instalar: curl -Ls "https://get.maestro.mobile.dev" | bash
    Depois reiniciar o daemon do QAMind.
```

### Porta 7001 — tratar conflitos

Antes de executar `adb -s {udid} forward tcp:7001 tcp:7001`, verificar forwards existentes:

```python
result = subprocess.run(['adb', 'forward', '--list'], capture_output=True, text=True)

# tcp:7001 já configurado para o mesmo device → reusar, não fazer nada
# tcp:7001 configurado para device diferente → remover e reconfigurar
# Não configurado → configurar normalmente
```

---

## Parte 3 — Caminho A: Linguagem Natural / Gherkin → YAML → Execução

O LLM deve entregar um YAML completo e pronto para executar — todos os elementos mapeados de forma que o Maestro encontre sem adivinhar.

### System prompt enviado ao Claude com Maestro selecionado

```
Você é especialista no framework de testes mobile Maestro (https://maestro.dev).
O usuário vai descrever um cenário de teste em linguagem natural ou Gherkin.

SEU TRABALHO:
1. Identificar o app testado (inferir package ID pelo contexto se não informado)
2. Quebrar em steps atômicos, uma ação por step
3. Para cada step, escolher o MELHOR localizador Maestro nesta ordem:
   - Texto visível → tapOn: "texto"
   - ID de acessibilidade → tapOn: id: "id"
   - Texto + índice quando há duplicatas → tapOn: { text: "texto", index: N }
   - Coordenadas percentuais apenas como último recurso → tapOn: { point: "X%,Y%" }
4. Adicionar assertVisible após toda ação crítica (login, navegação, submit)
5. Adicionar wait: minDuration: 2000 após launchApp
6. Adicionar waitForAnimationToEnd antes de assertions após transições de tela
7. Adicionar extendedWaitUntil (timeout: 10000) para elementos carregados da rede
8. Usar ${NOME_VAR} para senhas e dados sensíveis
9. Se o teste envolve tela de login, adicionar clearState antes do launchApp

MAPEAMENTO GHERKIN:
- Dado/Given → setup (launchApp, clearState, openLink)
- Quando/When → ações (tapOn, inputText, scroll, swipe)
- Então/Then → assertions (assertVisible, assertNotVisible)
- E/And → steps adicionais do mesmo tipo da linha anterior

REGRAS DE CONFIABILIDADE — testes devem passar 10 vezes seguidas:
- Nunca usar coordenadas de pixels quando texto ou ID estiver disponível
- Sempre clearState antes de launchApp em testes de fluxo de login
- Sempre waitForAnimationToEnd antes de assertions após transições
- Sempre extendedWaitUntil para elementos dependentes de rede (saldo, listas, dados do usuário)
- Assertar elemento único pós-login, não qualquer elemento da tela

RETORNAR APENAS JSON válido — sem markdown, sem texto explicativo:
{
  "test_name": "nome_descritivo_em_snake_case",
  "app_id": "com.package.name",
  "env_vars_needed": ["SENHA", "EMAIL"],
  "steps": [
    {
      "num": 1,
      "description": "Descrição legível em português",
      "maestro_command": "- launchApp"
    }
  ],
  "yaml_flow": "appId: com.foxbit.exchange\n---\n- clearState\n- launchApp\n..."
}
```

### Após resposta do Claude

1. Parsear JSON → extrair `steps` → renderizar no painel esquerdo animado (120ms de delay entre cada)
2. Extrair `yaml_flow` → **validar antes de salvar** (ver validação abaixo)
3. Salvar YAML validado em `/flows/{project_id}/{test_name}.yaml`
4. Se `env_vars_needed` não vazio → mostrar modal pedindo valores antes de executar
5. Executar via `maestro --device {udid} test --env KEY=value flow.yaml`
6. Fazer streaming do output via WebSocket → atualizar status dos steps em tempo real

### Validação de YAML antes de salvar

```python
import yaml

def validate_maestro_yaml(content: str) -> tuple[bool, str]:
    try:
        parts = content.split('---', 1)
        if len(parts) != 2:
            return False, "Separador --- ausente entre appId e os comandos"
        
        header = yaml.safe_load(parts[0])
        if not header or 'appId' not in header:
            return False, "appId ausente no início do flow"
        
        flow = yaml.safe_load(parts[1])
        if not isinstance(flow, list):
            return False, "Os comandos do flow devem ser uma lista YAML"
        
        return True, "OK"
    except yaml.YAMLError as e:
        return False, str(e)
```

Se a validação falhar: não salvar o arquivo, mostrar o erro inline no modal, não fechar o modal.

---

## Parte 4 — Caminho B: Gravação → LLM Converte → YAML Maestro

### Fase de gravação (manter código existente — sem alterações)

### Fase de conversão — enviar para o Claude

Ao clicar em "Parar Gravação", enviar eventos gravados para o Claude com o prompt:

```
Você é especialista em Maestro.
Converta as interações gravadas em um YAML de qualidade de produção que passe 10 vezes consecutivas.

INTERAÇÕES GRAVADAS: {json_array}
Resolução do device: {largura}x{altura}

REGRAS DE CONVERSÃO:
1. element_info.text existe → tapOn: "texto" (descartar coordenadas)
2. element_info.resourceId existe, sem texto → tapOn: id: "id_sem_prefixo_do_package"
3. element_info null → converter para percentual: x_pct = round(x/largura*100), y_pct = round(y/altura*100)
4. Events de type consecutivos no mesmo campo → unificar em um inputText
5. Adicionar waitForAnimationToEnd após taps que causam transição de tela
6. Adicionar assertVisible após login e navegações importantes
7. Substituir [SENHA_MASCARADA] por ${SENHA}
8. Se o primeiro launchApp é para tela de login → adicionar clearState antes dele
9. Inferir appId pelo prefixo do resourceId se disponível

Retornar o mesmo formato JSON do Caminho A.
```

### Modal de salvar com preview editável

Permitir edição manual do YAML antes de salvar. Validar sintaxe em tempo real durante a edição. YAML inválido bloqueia o salvamento com erro inline.

---

## Parte 5 — Parser do Output do Maestro

```python
def parse_maestro_line(line: str, run_id: str) -> dict | None:
    """
    Verificar TANTO emojis QUANTO palavras-chave textuais como fallback.
    Emojis podem não renderizar dependendo do locale do Linux no servidor.
    """
    line_upper = line.upper()
    
    is_success = '✅' in line or 'COMPLETED' in line_upper or 'PASSED' in line_upper
    is_failure = '❌' in line or 'FAILED' in line_upper or 'NOT FOUND' in line_upper or 'ERROR' in line_upper
    is_running = line.strip().startswith('- ') or 'RUNNING' in line_upper
    
    if is_success:
        return {"type": "step_completed", "run_id": run_id, "message": line}
    elif is_failure:
        return {"type": "step_failed", "run_id": run_id, "message": line}
    elif is_running:
        return {"type": "step_started", "run_id": run_id, "message": line}
    
    return None
```

---

## Parte 6 — Sugestão de Debug: Maestro Studio

Quando um step falha com "element not found", mostrar na UI abaixo do step falho:

```
❌ Step 3 falhou — Elemento não encontrado: tapOn "Entrar"

💡 Dica de debug: Abra o Maestro Studio para inspecionar os elementos 
   visíveis na tela atual.
   Execute no terminal: maestro studio
   Navegue até a tela do step falho e encontre o localizador correto.
```

Registrar a mesma dica no arquivo de log da execução.

---

## Parte 7 — Logs para Engine Maestro

Extender o sistema `/logs` existente. Quando engine = Maestro:
- Registrar versão do Maestro, caminho do YAML, env vars com valores mascarados (`SENHA=***`)
- Registrar cada linha do output do CLI com prefixo `[MAESTRO]`
- Registrar código de saída e status final
- Incluir conteúdo completo do YAML no rodapé do log quando o teste falhar
- Registrar hint do Maestro Studio quando step falha com "element not found"

---

## Parte 8 — Regras de Coexistência

1. Testes UIAutomator2 sempre executam com UIAutomator2 — a engine é salva por teste, não por sessão
2. Testes Maestro sempre executam com Maestro
3. O combobox só afeta criação de novos testes
4. Arquivos YAML são criados apenas para testes Maestro
5. Espelhamento do device funciona identicamente independente da engine
6. Nenhum código UIAutomator2 existente pode ser modificado nesta tarefa

---

## Critérios de Aceite

- [ ] Combobox de engine na toolbar, UIAutomator2 selecionado por padrão
- [ ] Selecionar UIAutomator2 não produz nenhuma alteração no comportamento atual
- [ ] `GET /api/engines/status` retorna disponibilidade e versão de ambas engines
- [ ] Maestro não instalado → aviso inline com comando de instalação
- [ ] Conflito na porta 7001 tratado: verificar forwards existentes antes de configurar
- [ ] Caminho A: prompt em linguagem natural / Gherkin → Claude gera YAML → steps animados no painel → Maestro executa no device
- [ ] Caminho B: gravação → parar → Claude converte → modal com YAML editável → YAML validado antes de salvar
- [ ] Validação de YAML executada antes de todo salvamento — YAML inválido mostrado inline, salvamento bloqueado
- [ ] Modal de variáveis de ambiente aparece quando YAML contém `${VAR}` — valores mascarados nos logs
- [ ] Status dos steps atualiza em tempo real durante execução do Maestro
- [ ] Espelhamento do device continua funcionando durante execução do Maestro
- [ ] `parse_maestro_line` detecta sucesso/falha tanto por emoji quanto por palavras-chave
- [ ] Quando step falha com "element not found" → hint do Maestro Studio mostrado na UI e no log
- [ ] YAML salvo em `/flows/{project_id}/`
- [ ] Output completo do CLI do Maestro capturado no arquivo de log por execução
- [ ] **Um teste de login gravado passa 10 execuções consecutivas sem modificação**