# QAMind — Parte 5: Interface de Execução em Tempo Real
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1–4 concluídas. WebSocket do daemon estável.

---

## 🎯 Objetivo desta parte

Criar o painel de execução em tempo real: o usuário vê o celular sendo controlado ao vivo, com preview no tamanho exato do dispositivo, indicadores de progresso, log de execução e controles de pause/cancel. Esta é a tela mais visualmente impressionante do produto.

---

## 🎨 Layout da Tela de Execução

```
/tests/[id]/run
```

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Voltar  |  "Login BancoX"  |  ● Online: Pixel 7  |  [⏸] [✕]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  STEPS (250px)   │    │  DEVICE (390px)  │    │  LOG (350px) │  │
│  │                  │    │                  │    │              │  │
│  │ ✅ 1 Abrir app   │    │  ┌────────────┐  │    │ 14:32:01 ✅  │  │
│  │ ✅ 2 Tap usuário │    │  │            │  │    │ Abriu app    │  │
│  │ ▶  3 Digitar...  │    │  │  [preview  │  │    │              │  │
│  │ ⏳ 4 Tap senha   │    │  │   tela do  │  │    │ 14:32:02 ✅  │  │
│  │ ⏳ 5 Tap Entrar  │    │  │   celular] │  │    │ Tap: campo   │  │
│  │ ⏳ 6 Assert...   │    │  │            │  │    │ usuário OK   │  │
│  │                  │    │  │            │  │    │              │  │
│  │ ─────────────    │    │  └────────────┘  │    │ 14:32:03 ▶   │  │
│  │ 2 / 6 steps      │    │                  │    │ Digitando... │  │
│  │ [████░░░░] 33%   │    │  Step atual:     │    │              │  │
│  │                  │    │  "Digitando      │    │              │  │
│  │                  │    │   admin@..."     │    │              │  │
│  └──────────────────┘    └──────────────────┘    └──────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Componentes a Implementar

### 1. `DevicePreview` — Preview do dispositivo em tempo real

```tsx
/**
 * O componente mais importante desta parte.
 * Exibe um "celular virtual" com a screenshot atual atualizada em tempo real.
 */
interface DevicePreviewProps {
  screenshotUrl: string | null;
  deviceWidth: number;     // ex: 1080 (resolução real)
  deviceHeight: number;    // ex: 2400
  highlightedElement?: ElementHighlight | null;
  isLoading: boolean;
  statusBarContent?: string;
}

interface ElementHighlight {
  x: number;      // coordenadas em pixels do dispositivo real
  y: number;
  width: number;
  height: number;
  color: string;  // cor do highlight ('blue' | 'green' | 'red')
  label?: string; // ex: "btn_login"
}
```

**Implementação do DevicePreview:**

```tsx
export function DevicePreview({ screenshotUrl, deviceWidth, deviceHeight, highlightedElement }: DevicePreviewProps) {
  // IMPORTANTE: Renderizar como "casca de celular" com proporção correta
  // A altura do preview deve ser: largura_container * (deviceHeight / deviceWidth)
  // Usar CSS aspect-ratio para manter proporção ao redimensionar janela
  
  // Scale factor para converter coordenadas reais → coordenadas do preview:
  // scaleX = previewWidth / deviceWidth
  // scaleY = previewHeight / deviceHeight
  
  // Estrutura HTML:
  return (
    <div className="device-shell">          {/* borda estilo celular */}
      <div className="device-screen">       {/* área da tela */}
        <img src={screenshotUrl} />         {/* screenshot atual */}
        {highlightedElement && (
          <ElementOverlay                   {/* box colorido sobre elemento */}
            element={highlightedElement}
            scaleX={scaleX}
            scaleY={scaleY}
          />
        )}
        {isLoading && <LoadingOverlay />}   {/* loading semi-transparente */}
      </div>
    </div>
  );
  
  // CSS da casca do celular:
  // - border-radius: 36px (cantos arredondados)
  // - border: 12px solid #1a1a2e (borda escura)
  // - box-shadow: interna e externa para profundidade
  // - notch ou barra superior
}
```

**Atualização da screenshot:**
```typescript
// A screenshot deve atualizar via evento WS 'screenshot_updated'
// NÃO usar polling — apenas WebSocket
// Fade suave ao trocar imagem (opacity transition 150ms)
// Manter a imagem anterior enquanto a nova carrega (sem piscar)

useEffect(() => {
  ws.on('screenshot_updated', ({ url }) => {
    // Pre-load da nova imagem antes de trocar
    const img = new Image();
    img.onload = () => setScreenshotUrl(url);
    img.src = url;
  });
}, []);
```

---

### 2. `StepProgressList` — Lista de steps com status em tempo real

```tsx
/**
 * Lista lateral com todos os steps e seus status.
 * Scrolla automaticamente para manter o step atual visível.
 */
interface StepProgressListProps {
  steps: TestStep[];
  currentStepNum: number | null;
  stepStatuses: Record<number, StepStatus>;
  stepDurations: Record<number, number>;    // duração em ms de cada step
  onStepClick: (stepNum: number) => void;   // ver screenshot do step clicado
}

// Visual de cada item:
// ┌─────────────────────────────────────────┐
// │ ✅  3  "Digitar email admin@..."  342ms  │  ← step passou
// │ ▶   4  "Clicar em Entrar"         ...   │  ← step em execução (pulsing)
// │ ⏳  5  "Verificar tela inicial"         │  ← aguardando
// │ ❌  6  "Assert: Bem-vindo"              │  ← step falhou (vermelho)
// └─────────────────────────────────────────┘
//
// Auto-scroll: quando step atual muda, scroll suave para mantê-lo no centro
```

---

### 3. `ExecutionLog` — Log em tempo real

```tsx
/**
 * Painel direito com log detalhado de tudo que está acontecendo.
 * Similar ao console de um navegador, mas visual e amigável.
 */
interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'ai';
  message: string;
  stepNum?: number;
  details?: string;    // expandível ao clicar
}

// Ícones por tipo:
// info → 📋 cinza    success → ✅ verde    warning → ⚠️ amarelo
// error → ❌ vermelho    ai → 🤖 roxo (análise da IA)

// Comportamento:
// - Auto-scroll para baixo quando novo item chega
// - Botão [Pausar scroll] quando usuário rola manualmente
// - Máximo 500 entradas no log (remover mais antigas)
// - Timestamp relativo: "agora", "2s atrás", "há 1min"
// - Filtro: [Todos] [Erros] [IA]
```

---

### 4. `ExecutionControls` — Controles de execução

```tsx
/**
 * Header da tela de execução com controles.
 */
interface ExecutionControlsProps {
  status: RunStatus;
  currentStep: number;
  totalSteps: number;
  elapsedMs: number;
  deviceName: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onStepByStep: () => void;
}

// Layout do header:
// ┌─────────────────────────────────────────────────────────┐
// │ ← Voltar  "Login BancoX"  ● Pixel 7   ⏱ 0:42  [⏸][✕] │
// └─────────────────────────────────────────────────────────┘
//
// Estados visuais do header:
// Running → fundo normal
// Paused → fundo amarelo suave + badge "PAUSADO"
// Failed → fundo vermelho suave + badge "FALHOU"
// Passed → fundo verde suave + badge "PASSOU" + confetti 🎉

// Barra de progresso abaixo do header:
// [████████░░░░░░░░░░░░] 4/10 steps — 40%
// Cor: azul em andamento → verde ao completar → vermelho ao falhar
```

---

### 5. `StepDetailModal` — Detalhes do step ao clicar

```tsx
/**
 * Modal que aparece ao clicar em um step na lista.
 * Mostra: screenshots before/after, análise da IA, duração, tentativas.
 */
interface StepDetailModalProps {
  step: TestStep;
  result: StepResult;
  screenshotBefore?: string;
  screenshotAfter?: string;
  aiAnalysis?: string;
  isOpen: boolean;
  onClose: () => void;
}

// Layout do modal:
// ┌──────────────────────────────────────────────────────┐
// │ Step 4 — Clicar em Entrar              [X fechar]   │
// ├──────────────────────────────────────────────────────┤
// │  ANTES              │  DEPOIS                        │
// │  [screenshot small] │  [screenshot small]            │
// ├──────────────────────────────────────────────────────┤
// │  🤖 Análise da IA:                                   │
// │  "O botão foi clicado com sucesso. A tela de         │
// │   dashboard apareceu conforme esperado."             │
// ├──────────────────────────────────────────────────────┤
// │  ⏱ 342ms  |  ✅ Passou na 1ª tentativa               │
// └──────────────────────────────────────────────────────┘
```

---

## 🔌 WebSocket Hook

```typescript
// hooks/useExecutionSocket.ts
/**
 * Hook que conecta ao WebSocket do daemon e processa todos os eventos
 * relacionados à execução em andamento.
 */
export function useExecutionSocket(runId: string) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [currentStepNum, setCurrentStepNum] = useState<number | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<number, StepStatus>>({});
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [highlightedElement, setHighlightedElement] = useState<ElementHighlight | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('pending');
  
  useEffect(() => {
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/${runId}`);
    
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      
      switch (payload.type) {
        case 'screenshot_updated':
          // Pre-load antes de trocar
          preloadImage(payload.data.url).then(() => setScreenshotUrl(payload.data.url));
          break;
          
        case 'step_started':
          setCurrentStepNum(payload.data.step_num);
          setStepStatuses(prev => ({ ...prev, [payload.data.step_num]: 'running' }));
          addLog({ type: 'info', message: `▶ Step ${payload.data.step_num}: ${payload.data.description}` });
          break;
          
        case 'step_completed':
          setStepStatuses(prev => ({ ...prev, [payload.data.step_num]: 'passed' }));
          setHighlightedElement(payload.data.element_highlighted);
          addLog({ type: 'success', message: `✅ Step ${payload.data.step_num} passou (${payload.data.duration_ms}ms)` });
          break;
          
        case 'step_failed':
          setStepStatuses(prev => ({ ...prev, [payload.data.step_num]: 'failed' }));
          addLog({ type: 'error', message: `❌ Step ${payload.data.step_num} falhou: ${payload.data.error}` });
          break;
          
        case 'ai_autocorrect':
          addLog({ type: 'ai', message: `🤖 IA tentando correção: ${payload.data.suggestion}` });
          break;
          
        case 'run_completed':
          setRunStatus('passed');
          addLog({ type: 'success', message: `🎉 Teste concluído com sucesso!` });
          break;
          
        case 'run_failed':
          setRunStatus('failed');
          addLog({ type: 'error', message: `💥 Teste falhou no step ${payload.data.failed_step}` });
          break;
      }
    };
    
    return () => ws.close();
  }, [runId]);
  
  return { screenshotUrl, currentStepNum, stepStatuses, logEntries, runStatus, connectionStatus, highlightedElement };
}
```

---

## 🎯 Modo Step-by-Step

```typescript
/**
 * Modo especial onde o usuário aprova cada step antes de avançar.
 * Útil para depurar um teste com problemas.
 *
 * Ativar: botão [Step-by-Step] no header
 * Comportamento:
 * - Após cada step ser executado, execução PAUSA
 * - Aparece overlay no preview: "Step 3 concluído. Continuar?" [▶ Próximo] [✕ Cancelar]
 * - Usuário pode ver o screenshot, log e análise da IA antes de avançar
 * - Enviar evento WS 'run_step_approved' para o daemon continuar
 */
```

---

## 📊 Métricas em Tempo Real

```typescript
// Exibir no rodapé do painel central:
interface RunMetrics {
  elapsedMs: number;
  stepsCompleted: number;
  totalSteps: number;
  aiCallsCount: number;       // quantas chamadas à IA foram feitas
  screenshotCount: number;    // quantos screenshots foram tirados
  estimatedCostUSD: number;   // custo estimado da execução até agora
}
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] Preview do dispositivo exibe screenshot atualizado em < 500ms após cada step
- [ ] Proporção correta do celular mantida em diferentes tamanhos de tela
- [ ] Elemento destacado (overlay colorido) aparece no preview após step de tap
- [ ] Lista de steps atualiza em tempo real: idle → running (pulsing) → passed/failed
- [ ] Auto-scroll da lista de steps mantém step atual visível
- [ ] Log de execução atualiza em tempo real com entradas formatadas
- [ ] Botão Pausar para a execução; Retomar continua do mesmo ponto
- [ ] Botão Cancelar encerra e volta para o editor com confirmação
- [ ] Modo step-by-step: usuário aprova cada step individualmente
- [ ] Ao clicar em step na lista → abre modal com before/after screenshots
- [ ] Visual de sucesso ao final (badge verde + animação)
- [ ] Visual de falha (badge vermelho, step com erro destacado em vermelho)
- [ ] Reconexão automática do WebSocket se cair (com feedback visual)
- [ ] Funciona corretamente com 20+ steps sem degradação de performance
