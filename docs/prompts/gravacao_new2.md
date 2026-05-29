Aqui está o prompt completo, profissional e detalhado para implementar a feature de gravação de testes no QAMind:

---

## PROMPT — Feature: Test Recording Module (Maestro-First)

---

### CONTEXTO DO PROJETO

Você está trabalhando no **QAMind**, uma plataforma SaaS de automação de testes mobile com IA. O stack é: **Next.js 14 + TypeScript** no frontend, **Fastify** no backend, **Python/uiautomator2** como daemon Android, **scrcpy** para mirroring do device via WebSocket/H.264, e **Maestro** como engine de execução de testes YAML.

O editor de testes já existe e está funcionando. **Esta feature deve ser adicionada sem quebrar nenhuma funcionalidade existente.** Crie todos os arquivos novos em pastas isoladas e só modifique arquivos existentes onde estritamente necessário (ex: adicionar um botão "REC" na toolbar do editor).

---

### OBJETIVO DA FEATURE

Implementar um **módulo de gravação de testes no editor**, inspirado no Repeato (repeato.app), onde o usuário:

1. Inicia a gravação com um clique
2. Interage com o app espelhado no device físico/emulador
3. Cada ação é capturada e convertida em um **passo Maestro YAML válido**
4. Os passos são exibidos em tempo real no painel lateral
5. Ao finalizar, o usuário salva o arquivo `.yaml` e pode executar imediatamente

---

### FLUXO COMPLETO — PASSO A PASSO

#### ETAPA 1 — Modal "New Recording" (antes de iniciar)

Antes de começar a gravação, exibir um **modal de configuração** com:

```
┌──────────────────────────────────────────────┐
│  🎬  New Test Recording                      │
│                                              │
│  Test name: [________________________]       │
│                                              │
│  App ID:    [com.miui.calculator     ]       │
│             (ex: com.example.myapp)          │
│                                              │
│  Clear app state before launch?  [✓]         │
│                                              │
│  [ Cancel ]              [ Start Recording ] │
└──────────────────────────────────────────────┘
```

Ao confirmar, o sistema **já gera os primeiros passos automaticamente**:

```yaml
appId: com.miui.calculator
---
- launchApp:
    clearState: true
```

Esses passos aparecem imediatamente no painel de steps, **antes do usuário fazer qualquer interação**.

---

#### ETAPA 2 — Estado "Recording Ativo"

Após confirmar o modal:

- O botão `REC` na toolbar passa para estado `● RECORDING` com animação pulsante em vermelho
- O painel de steps lateral exibe os passos em tempo real, com o último passo destacado
- O device mirror (via scrcpy/WebSocket) fica em modo de escuta ativa
- Um **overlay sutil vermelho** no frame do device indica que está gravando
- Botões disponíveis na toolbar durante gravação:
  - `⏹ Stop` — finaliza gravação e entra no modo de revisão
  - `⏸ Pause` — pausa temporariamente (não registra ações)
  - `↩ Undo` — remove o último passo gravado

---

#### ETAPA 3 — Captura de Ações e Conversão para Maestro YAML

Para **cada interação** do usuário no device mirror, o backend deve:

1. **Consultar a hierarquia de elementos via uiautomator2** (`device.dump_hierarchy()`) para identificar o elemento clicado por coordenada
2. **Priorizar o `resource-id`** do elemento (o "ID" do elemento no app)
3. Fallback para `content-desc`, depois `text`, depois coordenadas absolutas (último recurso)

##### Mapeamento de ações → Maestro YAML:

| Ação do usuário | Maestro YAML gerado |
|---|---|
| Tap em elemento com ID | `assertVisible:\n  id: "com.app:id/btn_login"\n- tapOn:\n  id: "com.app:id/btn_login"` |
| Tap em elemento sem ID (com texto) | `assertVisible:\n  text: "Entrar"\n- tapOn:\n  text: "Entrar"` |
| Tap em elemento sem ID nem texto | `- tapOn:\n  point: "50%,75%"` |
| Long press | `- longPressOn:\n  id: "com.app:id/item_card"` |
| Input de texto em campo | `- tapOn:\n  id: "com.app:id/input_email"\n- inputText: "usuario@email.com"` |
| Swipe para cima | `- swipe:\n    direction: UP\n    duration: 400` |
| Swipe para baixo | `- swipe:\n    direction: DOWN\n    duration: 400` |
| Swipe custom (start → end) | `- swipe:\n    start: "20%,80%"\n    end: "20%,20%"` |
| Toggle / Checkbox / Switch | `- tapOn:\n  id: "com.app:id/toggle_notifications"` |
| Scroll em lista | `- scroll` |
| Pressionar BACK | `- pressKey: BACK` |
| Pressionar HOME | `- pressKey: HOME` |
| Pressionar ENTER/teclado | `- pressKey: ENTER` |

##### Regra crítica — assertVisible antes de tapOn:

**Sempre** que um elemento tiver `id` ou `text` identificável, inserir um `assertVisible` imediatamente antes do `tapOn`:

```yaml
- assertVisible:
    id: "com.miui.calculator:id/btn_equal"
- tapOn:
    id: "com.miui.calculator:id/btn_equal"
```

Isso garante testes robustos e auto-documentados.

---

#### ETAPA 4 — Painel de Steps em Tempo Real

O painel lateral exibe os passos gravados como uma lista editável:

```
┌─────────────────────────────────────────────┐
│ Recorded Steps:              [Device: SM-M315F] │
│─────────────────────────────────────────────│
│ 1. 🚀 launchApp (com.miui.calculator)        │
│ 2. ✅ assertVisible · id: btn_digit_7        │
│ 3. 👆 tapOn · id: btn_digit_7               │
│ 4. ✅ assertVisible · id: btn_digit_plus     │
│ 5. 👆 tapOn · id: btn_digit_plus            │
│ 6. ✅ assertVisible · id: btn_digit_3        │
│ 7. 👆 tapOn · id: btn_digit_3              │
│ 8. ✅ assertVisible · id: btn_equal         │
│ 9. 👆 tapOn · id: btn_equal       ◀ atual  │
└─────────────────────────────────────────────┘
```

- Cada step tem ícone visual por tipo (🚀 launch, 👆 tap, ⌨️ input, 🔄 swipe, ✅ assert)
- Clique no step abre inline editor para ajuste manual
- Botão de lixeira em cada step para remover
- O último step capturado tem destaque visual

---

#### ETAPA 5 — Finalização e Revisão

Ao clicar em `⏹ Stop`:

1. Gravação encerra
2. O YAML completo é gerado e exibido no editor principal (CodeMirror ou Monaco)
3. O usuário pode editar manualmente antes de salvar
4. Exibir botões:
   - `💾 Salvar` — salva o arquivo `.yaml` na pasta `/maestro/tests/`
   - `▶ Executar` — salva e executa via `maestro test <arquivo>.yaml`
   - `🔁 Regravar` — descarta e volta ao modal inicial

---

#### ETAPA 6 — Execução com Preview em Tempo Real

Ao clicar em `▶ Executar`:

- Backend executa `maestro test <arquivo>.yaml` via subprocess
- O output do Maestro é streamado via **SSE (Server-Sent Events)** ou **WebSocket** para o frontend
- No painel de steps, cada passo vai sendo marcado com:
  - 🔄 em execução (spinner)
  - ✅ passou (verde)
  - ❌ falhou (vermelho + mensagem de erro)
- O device mirror mostra o app sendo controlado em tempo real (já existe via scrcpy)
- Ao finalizar, exibir resumo: `X/Y steps passed | Tempo total: Xs`

---

### ARQUITETURA TÉCNICA

#### Novos arquivos a criar (sem impactar existentes):

```
frontend/
  components/
    recorder/
      RecorderModal.tsx          ← Modal "New Recording"
      RecorderToolbar.tsx        ← Botões REC/STOP/PAUSE/UNDO
      RecorderStepPanel.tsx      ← Lista de steps em tempo real
      RecorderStepItem.tsx       ← Item individual de step (com inline edit)
      useRecorder.ts             ← Hook principal de estado da gravação
      recorderUtils.ts           ← Funções de conversão ação → YAML

backend/
  routes/
    recorder/
      startRecording.ts          ← POST /api/recorder/start
      stopRecording.ts           ← POST /api/recorder/stop
      captureAction.ts           ← POST /api/recorder/action
      generateYaml.ts            ← POST /api/recorder/generate

python_daemon/
  recorder/
    element_inspector.py        ← dump_hierarchy + resolveElement(x,y)
    action_mapper.py            ← Converte ação bruta em MaestroStep
```

#### Comunicação durante gravação:

```
Frontend (device mirror click)
  → POST /api/recorder/action { x, y, action_type, value? }
  → Backend chama Python daemon: element_inspector.py resolve_element(x, y)
  → Retorna { resource_id, text, content_desc, bounds }
  → action_mapper.py converte para MaestroStep[]
  → Resposta SSE/WS: novo step aparece no painel em < 300ms
```

#### Modelo de dados — RecordingSession:

```typescript
interface RecordingSession {
  id: string
  testName: string
  appId: string
  clearState: boolean
  deviceSerial: string
  status: 'idle' | 'recording' | 'paused' | 'stopped'
  steps: MaestroStep[]
  startedAt: Date
  yamlOutput?: string
}

interface MaestroStep {
  id: string
  type: 'launchApp' | 'tapOn' | 'assertVisible' | 'inputText' | 'swipe' | 'scroll' | 'pressKey' | 'longPressOn'
  params: Record<string, string | boolean | number>
  raw_yaml: string
  status?: 'pending' | 'running' | 'passed' | 'failed'
  error?: string
}
```

---

### REGRAS DE IMPLEMENTAÇÃO

1. **Não modificar** nenhum componente existente do editor, exceto adicionar o botão `REC` na toolbar existente
2. **Isolar completamente** o estado da gravação em `useRecorder.ts` — não poluir o estado global do editor
3. **Maestro como fonte da verdade** — o YAML gerado deve ser 100% compatível com `maestro test`
4. **Prefira IDs sempre** — resource-id tem prioridade absoluta na resolução de elementos
5. **assertVisible é obrigatório** antes de todo tapOn com id ou text resolvido
6. **launchApp sempre primeiro** — o YAML nunca começa sem o launchApp com o appId configurado
7. **Streaming de execução** — nunca bloquear a UI durante `maestro test`, sempre usar SSE/WebSocket
8. **Tratamento de erro gracioso** — se `dump_hierarchy` falhar para um tap, gerar step com coordenadas e marcar com aviso visual `⚠️ ID not resolved`
9. **Performance** — a resolução de elemento deve retornar em < 500ms para não quebrar o fluxo natural de gravação
10. **Testes unitários** para `recorderUtils.ts` (conversão ação → YAML) e `action_mapper.py`

---

### EXEMPLO DE OUTPUT YAML ESPERADO

```yaml
appId: com.miui.calculator
---
- launchApp:
    clearState: true
- assertVisible:
    id: "com.miui.calculator:id/digit_7"
- tapOn:
    id: "com.miui.calculator:id/digit_7"
- assertVisible:
    id: "com.miui.calculator:id/op_add"
- tapOn:
    id: "com.miui.calculator:id/op_add"
- assertVisible:
    id: "com.miui.calculator:id/digit_3"
- tapOn:
    id: "com.miui.calculator:id/digit_3"
- assertVisible:
    id: "com.miui.calculator:id/eq"
- tapOn:
    id: "com.miui.calculator:id/eq"
- assertVisible:
    text: "10"
```

---

### ENTREGÁVEIS ESPERADOS

- [ ] `RecorderModal.tsx` — modal de configuração inicial
- [ ] `useRecorder.ts` — hook com máquina de estados da gravação
- [ ] `RecorderStepPanel.tsx` — painel de steps com ícones e inline edit
- [ ] `recorderUtils.ts` — conversão de eventos em YAML Maestro
- [ ] `element_inspector.py` — resolução de elemento por coordenada via uiautomator2
- [ ] `action_mapper.py` — mapeamento de ação bruta para MaestroStep
- [ ] Rotas Fastify isoladas em `/api/recorder/*`
- [ ] Streaming SSE para execução do teste com atualização de status por step

---

Esse prompt pode ser usado diretamente no Trae (ou Claude) para implementar a feature de forma estruturada, modular e sem risco de regressão no que já está funcionando no QAMind.