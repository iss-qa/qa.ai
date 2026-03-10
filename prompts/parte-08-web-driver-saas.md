# QAMind — Parte 8: Web Driver (Playwright) + SaaS Multi-tenant
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Partes 1–7 concluídas e estáveis. MVP Android + Web funcionando.

---

## 🎯 Objetivo desta parte

Expandir o QAMind para testar aplicações web (usando Playwright) com o mesmo fluxo de prompt natural, e transformar o produto em um SaaS completo com suporte a múltiplas organizações, planos, onboarding e API pública.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| Web automation | Playwright (Node.js) |
| Multi-tenant | Supabase RLS (já configurado na Parte 1) |
| Billing | Stripe (checkout + webhooks) |
| Email transacional | Resend |
| Onboarding | tour de produto com driver.js |
| API pública | Fastify + JWT |

---

## 🌐 Módulo Playwright

### Estrutura

```
daemon/
└── web_driver/
    ├── executor.py         # Executor de steps para web (Python + playwright-python)
    ├── recorder.js         # Gravação de ações web (Node.js + playwright codegen)
    └── browser_manager.py  # Gerenciar instâncias de browser
```

### Mapeamento de Actions para Playwright

```python
"""
O mesmo tipo TestStep usado para Android é reutilizado para web.
Este módulo traduz as ações para Playwright.
"""
from playwright.async_api import async_playwright, Page, Browser

class WebStepExecutor:
    """
    Executa TestSteps em browser via Playwright.
    API deve ser compatível com StepExecutor do Android (Parte 2):
    - mesmo input: TestStep
    - mesmo output: StepResult
    """
    
    MAPEAMENTO_ACTIONS = {
        # TestStep.action  →  método Playwright
        'tap':             '_click',
        'type':            '_fill',
        'navigate':        '_goto',         # exclusivo web
        'scroll':          '_scroll',
        'wait':            '_wait',
        'assert_text':     '_assert_text',
        'assert_element':  '_assert_element',
        'assert_url':      '_assert_url',   # exclusivo web
        'screenshot':      '_screenshot',
        'back':            '_go_back',
        'open_app':        '_goto',         # em web = navegar para URL
    }
    
    async def execute_step(self, step: TestStep) -> StepResult:
        """
        Mesmo contrato do executor Android.
        Disparar step, capturar screenshot, retornar StepResult.
        """
        raise NotImplementedError
    
    async def _click(self, step: TestStep) -> bool:
        """
        Estratégia de seletor (em ordem de prioridade):
        1. role + name: page.get_by_role('button', name=step.value)
        2. text: page.get_by_text(step.target)
        3. label: page.get_by_label(step.target)
        4. placeholder: page.get_by_placeholder(step.target)
        5. CSS selector: page.locator(step.target)
        6. XPath: page.locator(f'xpath={step.target}')
        
        Aguardar elemento ser visível antes de clicar (default 10s).
        """
        raise NotImplementedError
    
    async def _fill(self, step: TestStep) -> bool:
        """
        Preencher campo de formulário.
        Limpar antes: page.locator(step.target).clear()
        Preencher: page.locator(step.target).fill(step.value)
        
        Para campos de senha: usar step.action='type' com value mascarado no log
        """
        raise NotImplementedError
    
    async def _assert_url(self, step: TestStep) -> bool:
        """
        Verificar URL atual.
        step.value: URL esperada ou regex
        
        page.url → comparar com step.value
        Suportar: URL exata, contains, regex, starts_with
        """
        raise NotImplementedError
    
    async def take_screenshot(self) -> bytes:
        """
        Screenshot do viewport atual.
        Retornar bytes JPEG comprimido.
        """
        return await self.page.screenshot(type='jpeg', quality=80)
```

### Mapeamento de Prompt para Web

O `PromptParser` (Parte 3) precisa receber `platform="web"` para gerar steps web:

```
System prompt adicional para web:
- Para navegação: usar action="navigate", value="URL"
- Para cliques: preferir get_by_role e get_by_text sobre CSS selectors
- Sempre incluir step de assert_url após navegação importante
- Para forms: usar get_by_label ou get_by_placeholder como target
- Após submit de formulário: aguardar navegação com action="wait", value="navigation"
```

### Preview Web no Frontend

```tsx
/**
 * Para web, o DevicePreview (Parte 5) exibe screenshots do browser.
 * Adaptar para mostrar:
 * - Frame de browser (barra de endereço, botões nav)
 * - Viewport 1280x720 (padrão) ou configurável
 * - Highlight de elementos usa mesma lógica do Android
 */
interface BrowserPreviewProps {
  screenshotUrl: string | null;
  currentUrl?: string;
  viewportWidth: number;    // padrão: 1280
  viewportHeight: number;   // padrão: 720
  highlightedElement?: ElementHighlight | null;
}
```

---

## 🏢 SaaS — Multi-tenant e Planos

### Fluxo de Onboarding

```
Signup
  ↓
Verificar email
  ↓
/onboarding/organization    → criar/nomear organização
  ↓
/onboarding/project         → criar primeiro projeto (Android ou Web)
  ↓
/onboarding/device          → conectar dispositivo (Android) ou configurar URL (Web)
  ↓
/onboarding/first-test      → criar primeiro teste com prompt
  ↓
/dashboard                  → produto completo (tour guiado com driver.js)
```

### Gerenciamento de Planos

```typescript
// Planos disponíveis (definir no banco e no Stripe)
const PLANS = {
  free: {
    max_projects: 1,
    max_executions_per_month: 50,
    max_devices: 1,
    web_testing: false,
    ai_bug_reports: false,
    pdf_export: false,
  },
  starter: {
    price_monthly_usd: 29,
    max_projects: 5,
    max_executions_per_month: 500,
    max_devices: 3,
    web_testing: false,
    ai_bug_reports: true,
    pdf_export: true,
  },
  pro: {
    price_monthly_usd: 79,
    max_projects: -1,    // ilimitado
    max_executions_per_month: 3000,
    max_devices: -1,
    web_testing: true,
    ai_bug_reports: true,
    pdf_export: true,
  }
}
```

### Feature Flags no Frontend

```typescript
// Hook para verificar acesso a features
export function useFeatureAccess() {
  const { org } = useOrganization();
  
  return {
    canUseWebTesting: org.plan !== 'free',
    canGenerateBugReports: org.plan !== 'free',
    canExportPDF: org.plan !== 'free',
    canAddMoreDevices: org.devices_count < org.plan_limits.max_devices,
    executionsRemaining: org.plan_limits.max_executions_per_month - org.executions_this_month,
  }
}

// Usar em qualquer componente:
// if (!canUseWebTesting) → mostrar "Upgrade para Pro" ao invés do recurso
```

### Integração com Stripe

```typescript
// Endpoints Fastify para billing:
// POST /api/billing/create-checkout     → cria sessão Stripe Checkout
// POST /api/billing/portal              → abre portal do cliente Stripe
// POST /api/webhooks/stripe             → recebe eventos do Stripe

// Eventos Stripe a tratar:
// checkout.session.completed → atualizar org.plan no Supabase
// customer.subscription.updated → atualizar plano
// customer.subscription.deleted → downgrade para free
```

---

## 🔑 API Pública

```
Autenticação: Bearer token (API Key por organização)

Endpoints disponíveis:
GET    /api/v1/projects                   → listar projetos
GET    /api/v1/tests                      → listar casos de teste
POST   /api/v1/runs                       → disparar execução
GET    /api/v1/runs/:id                   → status de uma execução
GET    /api/v1/runs/:id/bug-report        → bug report de uma execução
```

**Caso de uso principal da API:** integração com CI/CD

```yaml
# Exemplo: GitHub Actions
- name: Run QAMind Tests
  run: |
    curl -X POST https://app.qamind.io/api/v1/runs \
      -H "Authorization: Bearer ${{ secrets.QAMIND_API_KEY }}" \
      -d '{"test_suite_id": "abc123", "device_udid": "auto"}'
```

---

## 📧 Emails Transacionais (Resend)

```typescript
// Templates de email a implementar:

// 1. Boas-vindas (pós-signup)
// 2. Verificação de email
// 3. Convidar membro para organização
// 4. Execução concluída (passou)
// 5. Execução falhou + bug report embutido
// 6. Limite de execuções atingido (90% e 100%)
// 7. Upgrade de plano confirmado
```

---

## 📱 Página de Configurações

```
/settings/organization    → nome, slug, plano atual, uso do mês
/settings/members         → convidar, listar, remover membros, alterar role
/settings/devices         → gerenciar dispositivos, adicionar novo
/settings/api-keys        → gerar/revogar API keys
/settings/billing         → plano, próxima cobrança, histórico, upgrade/downgrade
/settings/notifications   → preferências de email por tipo de evento
```

---

## ✅ Critérios de Conclusão desta Parte

**Web Testing:**
- [ ] `POST /api/tests/parse-prompt` com `platform="web"` gera steps web válidos
- [ ] Playwright executa steps em Chrome sem erros para fluxo básico (login web)
- [ ] Preview do browser exibe screenshots com frame de browser
- [ ] Bug Engine funciona para falhas em testes web
- [ ] Mesma interface de execução funciona para Android e Web

**SaaS:**
- [ ] Onboarding completo funciona do signup até primeiro teste
- [ ] Planos implementados com limites reais (bloquear quando atingir cota)
- [ ] Upgrade para Starter via Stripe Checkout funciona end-to-end
- [ ] Feature flags aplicados: free não acessa web testing nem bug reports
- [ ] API pública documentada (Swagger/OpenAPI) e funcional
- [ ] Convite de membros por email funciona
- [ ] Página de configurações completa

---

## 🎯 Checklist Final do Produto Completo

Ao concluir todas as 8 partes, verificar:

- [ ] **Android**: gravar → gerar prompt → executar → bug report → PDF ✅
- [ ] **Web**: prompt → executar no Playwright → bug report → PDF ✅
- [ ] **Editor**: criar, editar, reordenar, versionar, restaurar ✅
- [ ] **Execução RT**: preview em tamanho real, log ao vivo, WebSocket ✅
- [ ] **IA Loop**: auto-correção funcionando, detecta popups ✅
- [ ] **Multi-tenant**: RLS funciona, planos com limites reais ✅
- [ ] **Performance**: execução < 500ms por step, preview < 500ms ✅
- [ ] **Segurança**: senhas mascaradas, HTTPS, RLS, rate limiting ✅
