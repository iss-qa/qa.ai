# PROMPT DE REIMPLEMENTAÇÃO — GRAVADOR DE TESTES MAESTRO (QAMind)

## CONTEXTO GERAL

Você é um engenheiro sênior de automação mobile reimplementando do zero o módulo de **gravação e reprodução de testes** de uma plataforma chamada **QAMind**. A interface já existe (ver imagem de referência), mas a implementação atual do gravador está quebrada e deve ser **completamente descartada e reescrita**.

O sistema usa o framework **Maestro** para interagir com dispositivos Android conectados via ADB. A gravação captura interações reais do usuário no dispositivo e as converte em passos YAML compatíveis com Maestro.

---

## OBJETIVO

Reimplementar o fluxo completo de **gravação → passos YAML → reprodução**, com as seguintes etapas:

1. **Usuário clica em "Gravar"** → sistema começa a capturar eventos touch no dispositivo via ADB
2. **Usuário interage com o app** (toca, digita, rola) → cada ação é convertida em um passo Maestro
3. **Passos aparecem na lateral** em tempo real conforme o usuário interage
4. **Usuário clica em "Parar"** → gravação encerra, YAML final é salvo
5. **Usuário clica em "Reproduzir"** → executa o arquivo YAML gerado no dispositivo via `maestro test`

---

## PASSO 1 — ESTUDO DO MAESTRO (OBRIGATÓRIO ANTES DE IMPLEMENTAR)

Clone e leia o repositório oficial para entender os comandos disponíveis:

```
git clone https://github.com/mobile-dev-inc/maestro
```

Foque especialmente em:
- `/maestro-cli/src/` → como os comandos são invocados via linha de comando
- `/maestro-sdk/` → comandos YAML disponíveis (`tapOn`, `inputText`, `scroll`, `assertVisible`, etc.)
- `/docs/` → sintaxe YAML de cada comando

Comandos Maestro que serão usados na gravação:

```yaml
# Verificar que elemento está visível
- assertVisible:
    id: "element_id"

# Tocar em elemento
- tapOn:
    id: "element_id"

# Digitar texto
- inputText: "texto digitado"

# Scroll para baixo
- scroll

# Scroll para cima
- scrollUntilVisible:
    element:
      id: "element_id"
    direction: UP

# Limpar campo
- clearText

# Pressionar tecla Back
- pressKey: Back

# Aguardar (fallback)
- waitForAnimationToEnd
```

---

## PASSO 2 — ESTRUTURA DO JSON DE ESCANEAMENTO

Antes de gravar, o sistema executa um escaneamento do app que gera um arquivo JSON com todos os elementos mapeados por tela. Este JSON é a **fonte de verdade** para identificar elementos durante a gravação.

### Estrutura do JSON:

```json
{
  "project_id": "...",
  "project_name": "Foxbit Mobile",
  "app_package": "br.com.foxbit.foxbitandroid",
  "screen_size": "1220x2712",
  "screens": {
    "NomeDaTela": {
      "elements": [
        {
          "id": "bt_welcome_login",
          "content_desc": "Entrar",
          "class": "android.widget.Button",
          "clickable": true,
          "bounds": "[624,627][1182,742]"
        },
        {
          "id": "inp_login_email",
          "text": "placeholder",
          "class": "android.widget.EditText",
          "clickable": true,
          "bounds": "[43,1004][1177,1124]",
          "index": 0
        }
      ]
    }
  }
}
```

### Função de lookup por coordenada (a ser implementada no backend):

```typescript
interface ScannedElement {
  id?: string;
  content_desc?: string;
  text?: string;
  class: string;
  clickable?: boolean;
  bounds: string; // formato: "[x1,y1][x2,y2]"
  index?: number;
}

function parseBounds(bounds: string): { x1: number; y1: number; x2: number; y2: number } {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) throw new Error(`Invalid bounds: ${bounds}`);
  return {
    x1: parseInt(match[1]),
    y1: parseInt(match[2]),
    x2: parseInt(match[3]),
    y2: parseInt(match[4]),
  };
}

function findElementByCoordinates(
  elements: ScannedElement[],
  tapX: number,
  tapY: number
): ScannedElement | null {
  // Prioridade: elementos clickable, do menor bounding box (mais específico) para o maior
  const candidates = elements.filter((el) => {
    const b = parseBounds(el.bounds);
    return tapX >= b.x1 && tapX <= b.x2 && tapY >= b.y1 && tapY <= b.y2;
  });

  if (candidates.length === 0) return null;

  // Menor área = mais específico
  return candidates.sort((a, b) => {
    const ba = parseBounds(a.bounds);
    const bb = parseBounds(b.bounds);
    const areaA = (ba.x2 - ba.x1) * (ba.y2 - ba.y1);
    const areaB = (bb.x2 - bb.x1) * (bb.y2 - bb.y1);
    return areaA - areaB;
  })[0];
}
```

---

## PASSO 3 — CAPTURA DE EVENTOS VIA ADB

### 3.1 — Detecção de touch events

O backend deve escutar eventos do dispositivo em tempo real usando ADB. Existem duas abordagens; use a **Abordagem B** (uiautomator dump + coordenadas do getevent) por ser mais confiável:

**Abordagem A — getevent (baixo nível, requer parsing de hex):**
```bash
adb -s <device_id> shell getevent -lt /dev/input/event1
```

**Abordagem B (RECOMENDADA) — ADB shell + coordenadas absolutas:**
```bash
# Captura toques via método de polling com uiautomator
adb -s <device_id> shell uiautomator events
```

**Abordagem C — Overlay de captura via servidor local no device (mais precisa):**

Instale um APK listener no device que captura `MotionEvent` e envia via socket local para o backend. Este é o método mais robusto para produção.

Para o MVP, use **adb shell getevent** com parsing das coordenadas ABS_MT_POSITION_X / ABS_MT_POSITION_Y:

```typescript
import { exec, spawn } from 'child_process';

interface TouchEvent {
  type: 'tap' | 'swipe_up' | 'swipe_down' | 'long_press';
  x: number;
  y: number;
  endX?: number;
  endY?: number;
}

class AdbEventCapture {
  private process: ReturnType<typeof spawn> | null = null;
  private deviceId: string;
  private screenWidth: number;
  private screenHeight: number;

  constructor(deviceId: string, screenWidth: number, screenHeight: number) {
    this.deviceId = deviceId;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  start(onEvent: (event: TouchEvent) => void): void {
    // Descobre o device de input correto
    this.process = spawn('adb', [
      '-s', this.deviceId,
      'shell', 'getevent', '-lt'
    ]);

    let buffer = '';
    let pendingX: number | null = null;
    let pendingY: number | null = null;
    let rawX: number | null = null;
    let rawY: number | null = null;

    this.process.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Parse ABS_MT_POSITION_X e ABS_MT_POSITION_Y
        if (line.includes('ABS_MT_POSITION_X')) {
          const hex = line.trim().split(/\s+/).pop();
          if (hex) rawX = parseInt(hex, 16);
        }
        if (line.includes('ABS_MT_POSITION_Y')) {
          const hex = line.trim().split(/\s+/).pop();
          if (hex) rawY = parseInt(hex, 16);
        }
        // SYN_REPORT = evento completo
        if (line.includes('SYN_REPORT') && rawX !== null && rawY !== null) {
          // Normaliza coordenadas para a resolução real da tela
          const normalizedX = Math.round((rawX / 32767) * this.screenWidth);
          const normalizedY = Math.round((rawY / 32767) * this.screenHeight);
          
          onEvent({ type: 'tap', x: normalizedX, y: normalizedY });
          rawX = null;
          rawY = null;
        }
      }
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }
}
```

### 3.2 — Detecção de texto digitado

Após um `tapOn` em um `EditText`, o próximo input do teclado deve ser capturado como `inputText`:

```typescript
// Monitora via adb logcat filtrado por InputMethodManager
const logcatProcess = spawn('adb', [
  '-s', deviceId,
  'shell', 'logcat', '-s', 'InputMethodManager:V'
]);

// Alternativa mais simples: após tap em EditText, fazer dump da UI e ler o texto atual
async function getEditTextCurrentValue(deviceId: string, elementId: string): Promise<string> {
  const result = await execAsync(
    `adb -s ${deviceId} shell uiautomator dump /sdcard/dump.xml && adb -s ${deviceId} pull /sdcard/dump.xml /tmp/dump.xml`
  );
  // Parse XML e encontra o elemento pelo resource-id
  // retorna o atributo "text"
}
```

**Estratégia mais simples para MVP:** Após detectar tap em um `EditText`, abrir um modal/overlay na interface web pedindo ao usuário "Qual texto você digitou?", capturar e gerar o passo `inputText`.

### 3.3 — Detecção de scroll

```typescript
// Detecta swipe comparando posição inicial e final do toque
function classifyGesture(
  startX: number, startY: number,
  endX: number, endY: number
): 'tap' | 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right' {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 20) return 'tap'; // Movimento pequeno = tap

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy < 0 ? 'swipe_up' : 'swipe_down';
  } else {
    return dx < 0 ? 'swipe_left' : 'swipe_right';
  }
}
```

---

## PASSO 4 — CONVERSÃO DE EVENTOS EM PASSOS MAESTRO

Esta é a função central. Para cada evento capturado, gera os passos YAML correspondentes:

```typescript
interface MaestroStep {
  raw: object;        // estrutura para serializar em YAML
  display: string;    // texto legível para mostrar na UI
  type: 'tap' | 'input' | 'scroll' | 'assert' | 'back';
  elementId?: string;
}

function generateStepsForTap(
  element: ScannedElement | null,
  tapX: number,
  tapY: number
): MaestroStep[] {
  const steps: MaestroStep[] = [];

  if (element?.id) {
    // PRIORIDADE 1: usar ID
    steps.push({
      raw: { assertVisible: { id: element.id } },
      display: `assertVisible: id="${element.id}"`,
      type: 'assert',
      elementId: element.id,
    });
    steps.push({
      raw: { tapOn: { id: element.id } },
      display: `tapOn: id="${element.id}"`,
      type: 'tap',
      elementId: element.id,
    });
  } else if (element?.content_desc) {
    // PRIORIDADE 2: usar content_desc (texto visível)
    steps.push({
      raw: { assertVisible: { text: element.content_desc } },
      display: `assertVisible: text="${element.content_desc}"`,
      type: 'assert',
    });
    steps.push({
      raw: { tapOn: { text: element.content_desc } },
      display: `tapOn: text="${element.content_desc}"`,
      type: 'tap',
    });
  } else {
    // PRIORIDADE 3: fallback para coordenadas
    steps.push({
      raw: { tapOn: { point: `${tapX},${tapY}` } },
      display: `tapOn: point="${tapX},${tapY}" (sem ID - fallback)`,
      type: 'tap',
    });
  }

  // Se for EditText, adiciona passo de inputText (após capturar texto)
  if (element?.class === 'android.widget.EditText') {
    steps.push({
      raw: { inputText: '__PENDING_INPUT__' },
      display: `inputText: [aguardando digitação...]`,
      type: 'input',
      elementId: element.id,
    });
  }

  return steps;
}

function generateStepsForScroll(direction: 'swipe_up' | 'swipe_down'): MaestroStep[] {
  if (direction === 'swipe_down') {
    return [{
      raw: { scroll: null },
      display: 'scroll (para baixo)',
      type: 'scroll',
    }];
  } else {
    return [{
      raw: { scroll: { direction: 'UP' } },
      display: 'scroll (para cima)',
      type: 'scroll',
    }];
  }
}
```

---

## PASSO 5 — SERIALIZAÇÃO PARA YAML

```typescript
import * as yaml from 'js-yaml';

interface MaestroFlow {
  appId: string;
  steps: MaestroStep[];
}

function serializeToYaml(flow: MaestroFlow): string {
  const header = `appId: ${flow.appId}\n---\n`;

  const steps = flow.steps
    .filter(s => s.raw['inputText'] !== '__PENDING_INPUT__') // Remove pending
    .map(s => s.raw);

  return header + yaml.dump(steps, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

// Exemplo de saída esperada:
/*
appId: br.com.foxbit.foxbitandroid
---
- assertVisible:
    id: bt_welcome_login
- tapOn:
    id: bt_welcome_login
- assertVisible:
    id: inp_login_email
- tapOn:
    id: inp_login_email
- inputText: "user@email.com"
- scroll
- assertVisible:
    id: bt_login_submit
- tapOn:
    id: bt_login_submit
*/
```

---

## PASSO 6 — API DO BACKEND (Fastify)

```typescript
// routes/recording.ts

// POST /api/recording/start
// Body: { projectId, deviceId, scanFileId }
// - Carrega o JSON de escaneamento do projeto
// - Inicia AdbEventCapture para o device
// - Retorna { recordingId }

// POST /api/recording/stop
// Body: { recordingId }
// - Para o AdbEventCapture
// - Serializa passos para YAML
// - Salva o arquivo .yaml no storage (Cloudflare R2 ou disco)
// - Retorna { yamlContent, yamlFileUrl, steps[] }

// POST /api/recording/confirm-input
// Body: { recordingId, stepIndex, textValue }
// - Atualiza o passo pendente __PENDING_INPUT__ com o texto real
// - Retorna { updatedStep }

// POST /api/tests/execute
// Body: { yamlFileUrl, deviceId }
// - Baixa o YAML
// - Executa: maestro test <arquivo.yaml> --device <deviceId>
// - Faz streaming do stdout/stderr via SSE para o frontend
// - Retorna { success, output }

// GET /api/tests/:testId/stream (SSE)
// - Stream em tempo real da execução do maestro
```

---

## PASSO 7 — EXECUÇÃO VIA MAESTRO CLI

```typescript
import { spawn } from 'child_process';

async function executeMaestroTest(
  yamlFilePath: string,
  deviceId: string,
  onOutput: (line: string) => void
): Promise<{ success: boolean; exitCode: number }> {
  return new Promise((resolve) => {
    const process = spawn('maestro', [
      'test',
      yamlFilePath,
      '--device', deviceId,
      '--format', 'junit', // para parsing de resultado
    ]);

    process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(onOutput);
    });

    process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(onOutput);
    });

    process.on('close', (code) => {
      resolve({ success: code === 0, exitCode: code ?? 1 });
    });
  });
}
```

**Pré-requisito no servidor:** Maestro CLI instalado e acessível no PATH:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
```

---

## PASSO 8 — FRONTEND (INTEGRAÇÃO COM A UI EXISTENTE)

A interface já existe. Os pontos de integração são:

### 8.1 — Botão "Gravar"
```typescript
const handleStartRecording = async () => {
  const response = await fetch('/api/recording/start', {
    method: 'POST',
    body: JSON.stringify({ projectId, deviceId, scanFileId }),
  });
  const { recordingId } = await response.json();
  setRecordingId(recordingId);
  setIsRecording(true);
  
  // Inicia SSE para receber passos em tempo real
  const eventSource = new EventSource(`/api/recording/${recordingId}/events`);
  eventSource.onmessage = (e) => {
    const step = JSON.parse(e.data);
    setTestSteps(prev => [...prev, step]);
    
    // Se o passo for inputText pendente, mostrar modal
    if (step.type === 'input' && step.raw.inputText === '__PENDING_INPUT__') {
      setShowInputModal({ visible: true, stepIndex: step.index });
    }
  };
};
```

### 8.2 — Modal de captura de texto (para EditText)
```tsx
{showInputModal.visible && (
  <Modal>
    <p>Qual texto você digitou no campo?</p>
    <input
      autoFocus
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key === 'Enter') {
          await fetch('/api/recording/confirm-input', {
            method: 'POST',
            body: JSON.stringify({
              recordingId,
              stepIndex: showInputModal.stepIndex,
              textValue: inputValue,
            }),
          });
          setShowInputModal({ visible: false });
          setInputValue('');
        }
      }}
    />
  </Modal>
)}
```

### 8.3 — Botão "Executar Teste"
```typescript
const handleExecuteTest = async () => {
  setIsExecuting(true);
  const eventSource = new EventSource(`/api/tests/${testId}/stream`);
  eventSource.onmessage = (e) => {
    const { line, success } = JSON.parse(e.data);
    setExecutionLogs(prev => [...prev, line]);
    if (success !== undefined) {
      setExecutionResult(success ? 'passed' : 'failed');
      setIsExecuting(false);
      eventSource.close();
    }
  };
};
```

---

## PASSO 9 — FLUXO COMPLETO ESPERADO

```
[Usuário clica Gravar]
        │
        ▼
Backend inicia AdbEventCapture ──────────────────────────────┐
        │                                                     │
        ▼                                                     │
[Usuário toca no dispositivo]                    JSON de scan carregado
        │                                        (fonte de IDs)
        ▼
ADB captura coordenadas (x, y)
        │
        ▼
findElementByCoordinates(elements, x, y)
        │
        ├─── Encontrou com ID ──► assertVisible(id) + tapOn(id)
        │
        ├─── Encontrou com content_desc ──► assertVisible(text) + tapOn(text)
        │
        └─── Não encontrou ──► tapOn(point: "x,y")
                  │
                  ▼
        Passo enviado via SSE para o frontend
                  │
                  ▼
        Passo aparece na lista lateral em tempo real
                  │
        [Se EditText: modal pede o texto]
                  │
                  ▼
        inputText: "valor digitado"

[Usuário clica Parar]
        │
        ▼
Serializa todos os passos → arquivo.yaml
Salva no storage

[Usuário clica Executar]
        │
        ▼
maestro test arquivo.yaml --device <id>
        │
        ▼
Output via SSE → tela de logs em tempo real
        │
        ▼
Resultado: ✅ Passou / ❌ Falhou
```

---

## RESTRIÇÕES E DECISÕES TÉCNICAS

| Decisão | Escolha | Justificativa |
|---|---|---|
| Captura de touch | ADB getevent | Sem necessidade de app auxiliar no device |
| Prioridade de seletor | ID → content_desc → coordenadas | Alinhado com padrão Maestro |
| Captura de texto digitado | Modal na interface web | Mais confiável que interceptar InputMethod via ADB |
| Formato de saída | YAML (js-yaml) | Compatível nativamente com Maestro CLI |
| Execução | maestro test via child_process | Direto no servidor onde o device está conectado |
| Scroll | Detectar swipe > 20px | Simples e eficaz para MVP |

---

## O QUE DEVE SER DESCARTADO DA IMPLEMENTAÇÃO ATUAL

- ❌ Qualquer simulação de cliques via JavaScript/DOM no front
- ❌ Passos gerados por heurística sem leitura real do device
- ❌ Passo `[unresolved]` — isso é bug da implementação atual (sem lookup no JSON)
- ❌ Lógica de gravação que não usa ADB real
- ❌ YAML gerado sem `assertVisible` antes do `tapOn`

---

## ENTREGÁVEIS ESPERADOS

- [ ] `AdbEventCapture` — serviço de captura de eventos do device
- [ ] `ElementLookupService` — lookup de elementos por coordenada no JSON de scan
- [ ] `StepGenerator` — converte eventos em passos Maestro com prioridade correta
- [ ] `YamlSerializer` — serializa lista de passos para `.yaml` válido
- [ ] `MaestroExecutor` — executa `maestro test` e faz streaming do output
- [ ] Rotas Fastify: `start`, `stop`, `confirm-input`, `execute`, `stream`
- [ ] Ajustes no frontend para consumir os novos endpoints e mostrar passos em tempo real