# QAMind — Parte 4: Editor de Steps (Frontend)
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1, 2 e 3 concluídas. API `/parse-prompt` funcionando.

---

## 🎯 Objetivo desta parte

Criar a interface de edição de casos de teste: o usuário pode escrever um prompt ou gravar no celular, ver os steps gerados, reordenar, editar, inserir novos steps, adicionar asserts e salvar/versionar o caso de teste. Referência visual: Repeato + Notion.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| Framework | Next.js 14 + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Estado | Zustand |
| Forms | React Hook Form + Zod |
| Ícones | Lucide React |

---

## 🗺️ Rotas e Páginas

```
/tests/new                → Criar novo teste (escolher: prompt ou gravação)
/tests/[id]/edit          → Editor completo do caso de teste
/tests/[id]/run           → Interface de execução (Parte 5)
```

---

## 🎨 Layout do Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: "Teste: Login BancoX"  [Salvar ▼]  [▶ Executar]        │
├────────────────────┬────────────────────────────────────────────┤
│                    │                                            │
│  PAINEL ESQUERDO   │  PAINEL DIREITO                            │
│  (420px)           │  (flex)                                    │
│                    │                                            │
│  [+ Adicionar via  │  Step selecionado ou                       │
│     prompt]        │  boas-vindas quando nenhum selecionado     │
│                    │                                            │
│  ┌─────────────┐   │  ┌──────────────────────────────────────┐  │
│  │ Step 1  ✅  │   │  │  Action: tap                          │  │
│  │ Abrir BancoX│   │  │  Target: [btn_login_______________]  │  │
│  └─────────────┘   │  │  Value:  [_______________________]  │  │
│  ┌─────────────┐   │  │  Description: [___________________] │  │
│  │ Step 2  ✅  │   │  │  Timeout: [10000] ms                 │  │
│  │ Tap usuário │   │  │  Screenshot after: [✓]               │  │
│  └─────────────┘   │  └──────────────────────────────────────┘  │
│  ┌─────────────┐   │                                            │
│  │ Step 3  ▶   │   │  [Preview da screenshot do step]          │
│  │ Em exec...  │   │                                            │
│  └─────────────┘   │                                            │
│                    │                                            │
│  [+ Novo Step]     │                                            │
└────────────────────┴────────────────────────────────────────────┘
```

---

## 🧩 Componentes a Implementar

### 1. `PromptInput` — Entrada principal

```tsx
/**
 * Campo de prompt com histórico e execução.
 * Aparece no topo da lista de steps quando nenhum step existe ainda.
 * Pode ser chamado a qualquer momento para adicionar mais steps.
 */
interface PromptInputProps {
  onStepsGenerated: (steps: TestStep[]) => void;
  onRecordingStart: () => void;
  isGenerating: boolean;
  projectId: string;
}

// UI:
// - Textarea grande com placeholder: "Descreva o que o teste deve fazer..."
// - Abaixo do textarea: dois botões lado a lado:
//   [✨ Gerar com IA]  [📱 Gravar no Celular]
// - Ao clicar em "Gerar com IA": mostrar loading animado + "Gerando steps..."
// - Ao concluir: animar a entrada dos steps na lista
// - Suporte a Enter+Shift para nova linha, Enter para submeter
```

### 2. `StepList` — Lista de steps com drag & drop

```tsx
/**
 * Lista ordenável de steps com drag & drop.
 * Usar @dnd-kit/sortable para o arrastar e soltar.
 */
interface StepListProps {
  steps: TestStep[];
  selectedStepId: string | null;
  runningStepNum: number | null;   // null quando não está executando
  stepResults: Record<string, StepStatus>;  // resultados de execução
  onSelect: (step: TestStep) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  onDelete: (stepId: string) => void;
  onDuplicate: (stepId: string) => void;
  onAddAfter: (stepId: string) => void;
}
```

### 3. `StepCard` — Card individual de cada step

```tsx
/**
 * Card de step na lista.
 * Visual compacto: ícone da ação + descrição + status + handle de drag.
 */
interface StepCardProps {
  step: TestStep;
  index: number;
  isSelected: boolean;
  status: 'idle' | 'running' | 'passed' | 'failed' | 'pending';
  screenshotUrl?: string;
  isDragging: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

// Design do card:
// ┌─────────────────────────────────────────┐
// │ ⠿  3  [ícone]  "Digitar senha"      ✅ │  ← ⠿ é o handle de drag
// │         tap › campo_senha              │
// └─────────────────────────────────────────┘
//
// Status colors:
// idle → cinza  |  running → azul pulsando  |  passed → verde  |  failed → vermelho
//
// Hover: mostrar botões [✏️ Editar] [⧉ Duplicar] [🗑 Deletar] à direita
```

**Ícones por ação:**
```typescript
const ACTION_ICONS: Record<StepAction, string> = {
  open_app:       '📱',
  tap:            '👆',
  type:           '⌨️',
  swipe:          '👋',
  scroll:         '📜',
  longpress:      '🖐️',
  wait:           '⏳',
  assert_text:    '✅',
  assert_element: '🔍',
  assert_url:     '🔗',
  back:           '⬅️',
  home:           '🏠',
  screenshot:     '📸',
};
```

### 4. `StepEditor` — Formulário de edição do step selecionado

```tsx
/**
 * Painel direito: formulário de edição do step selecionado.
 * Campos adaptativos baseados no tipo de ação.
 */

// Campos comuns (sempre presentes):
// - Action: Select com todas as ações disponíveis
// - Description: Input de texto
// - Timeout (ms): Input numérico
// - Screenshot after: Toggle

// Campos por ação:
const FIELDS_BY_ACTION = {
  tap:            ['target'],
  type:           ['target', 'value (texto a digitar)'],
  swipe:          ['value (up|down|left|right)'],
  scroll:         ['target (opcional)', 'value (up|down)'],
  longpress:      ['target', 'value (duração ms)'],
  wait:           ['value (ms OU nome do elemento)'],
  assert_text:    ['value (texto esperado)', 'target (elemento - opcional)'],
  assert_element: ['target', 'value (visible|exists|enabled|gone)'],
  open_app:       ['value (package name)'],
  // back, home, screenshot: sem campos adicionais
};

// Extra: campo "Target Helper"
// Ao lado do campo target, botão [🔍 Inspecionar]
// Ao clicar: abre modal com dump de UI do dispositivo atual
// Usuário clica no elemento no dump → target preenchido automaticamente
```

### 5. `VersionHistory` — Histórico de versões

```tsx
/**
 * Modal de histórico de versões do caso de teste.
 * Acessível via botão [Salvar ▼] → "Ver histórico"
 */
// Lista todas as versões com: número, data, quem salvou, nota opcional
// Botão "Restaurar esta versão" em cada item
// Diff visual: highlights dos steps que mudaram entre versões
```

### 6. `AddStepMenu` — Menu de inserção de step

```tsx
/**
 * Menu flutuante para adicionar step em uma posição específica.
 * Aparece ao clicar em [+ Novo Step] ou no espaço entre steps.
 */
// Opções:
// [✨ Gerar com IA]    → abre mini-input de prompt
// [👆 Tap]            → insere step de tap vazio
// [⌨️ Type]           → insere step de type vazio
// [✅ Assert]         → insere step de assert
// [⏳ Wait]           → insere step de wait
// [📸 Screenshot]     → insere step de screenshot
```

---

## 🗃️ Estado Global — Zustand Store

```typescript
// store/testEditor.ts
import { create } from 'zustand';
import { temporal } from 'zundo';  // para undo/redo

interface TestEditorState {
  // Estado do teste
  testCase: TestCase | null;
  isDirty: boolean;          // true quando há mudanças não salvas
  isSaving: boolean;
  lastSavedAt: Date | null;
  
  // Seleção e UI
  selectedStepId: string | null;
  isGenerating: boolean;     // gerando steps via IA
  isRecording: boolean;      // gravando no celular
  
  // Ações
  setTestCase: (tc: TestCase) => void;
  addStep: (step: Partial<TestStep>, afterId?: string) => void;
  updateStep: (stepId: string, updates: Partial<TestStep>) => void;
  deleteStep: (stepId: string) => void;
  reorderSteps: (oldIndex: number, newIndex: number) => void;
  duplicateStep: (stepId: string) => void;
  
  // Prompt
  generateStepsFromPrompt: (prompt: string) => Promise<void>;
  appendStepsFromPrompt: (prompt: string, afterId?: string) => Promise<void>;
  
  // Persistência
  saveTestCase: () => Promise<void>;
  loadTestCase: (id: string) => Promise<void>;
}

// IMPORTANTE: Usar zundo para undo/redo (Ctrl+Z / Ctrl+Y)
// Máximo 50 estados no histórico de undo
export const useTestEditor = create<TestEditorState>()(
  temporal(
    (set, get) => ({
      // implementação...
    }),
    { limit: 50 }
  )
);
```

---

## 💾 Auto-save

```typescript
// hooks/useAutoSave.ts
/**
 * Hook de auto-save que salva quando há mudanças não salvas
 * após 2 segundos de inatividade.
 * 
 * Comportamento:
 * - Debounce de 2000ms após última mudança
 * - Indicador visual: "Salvando..." → "Salvo às 14:32" → erro se falhar
 * - NUNCA salvar durante execução de teste
 * - Salvar versão anterior antes de sobrescrever (para histórico)
 */
export function useAutoSave(testCaseId: string) {
  const { isDirty, saveTestCase, isSaving } = useTestEditor();
  
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => saveTestCase(), 2000);
    return () => clearTimeout(timer);
  }, [isDirty]);
}
```

---

## 🎬 Animações

```typescript
// Usar Tailwind classes para animações consistentes:

// Step sendo adicionado (entrada)
'animate-in slide-in-from-top-2 duration-200'

// Step sendo deletado (saída)  
'animate-out slide-out-to-right duration-150'

// Step em execução (pulsing)
'ring-2 ring-blue-400 ring-offset-2 animate-pulse'

// Step passou (flash verde)
'bg-green-50 border-green-400 transition-colors duration-500'

// Step falhou (flash vermelho)
'bg-red-50 border-red-400 transition-colors duration-500'

// Drag ghost (semi-transparente)
'opacity-50 scale-95 rotate-1'
```

---

## 📱 Modo de Gravação — Integração com Daemon

```typescript
// Quando usuário clica em "Gravar no Celular":
// 1. Verificar se há dispositivo online (GET /devices)
// 2. Se não → mostrar modal "Conecte um dispositivo Android"
// 3. Se sim → abrir seletor de dispositivo
// 4. POST /recordings/start com { udid }
// 5. Mostrar banner vermelho "● REC Gravando..."
// 6. Ouvir eventos WS 'step_recorded' e ir adicionando na lista
// 7. Cada step novo anima a entrada na lista
// 8. Botão [⏹ Parar Gravação] → POST /recordings/stop
// 9. Receber steps finais, mesclar com lista atual
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] Criar teste via prompt: campo → gerar → steps aparecem animados na lista
- [ ] Drag & drop de steps funciona suavemente (sem jank)
- [ ] Editar step selecionado: campos adaptam baseado no tipo de ação
- [ ] Inserir novo step em qualquer posição da lista
- [ ] Deletar step com confirmação visual (não modal)
- [ ] Duplicar step (aparece logo abaixo do original)
- [ ] Undo/Redo funciona (Ctrl+Z desfaz última ação)
- [ ] Auto-save com indicador de status visível
- [ ] Histórico de versões abre em modal com lista de versões
- [ ] Restaurar versão anterior funciona
- [ ] Modo gravação: steps aparecem em tempo real ao usar o celular
- [ ] "Adicionar via prompt" no meio da lista → steps inseridos na posição correta
- [ ] Teclado acessível: Tab entre campos, Enter para salvar inline
- [ ] Funciona bem em tela 1280px+ (desktop-first)
