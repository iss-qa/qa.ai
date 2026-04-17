# CONTEXTO DO PROJETO

Você está desenvolvendo o QAMind, uma plataforma SaaS de automação de testes mobile com IA, integrada ao framework Maestro. O stack é: Next.js 14 (App Router) no frontend, Fastify no backend, Python/uiautomator2 para comunicação com dispositivos Android, e o framework Maestro para execução de flows YAML.

O app mobile alvo é br.com.foxbit.foxbitandroid, testado nos dispositivos Samsung Galaxy A22 e Xiaomi Redmi Note 13. Um escaneamento completo do app já foi realizado anteriormente, que mapeou todos os elementos da interface com seus IDs (ex: txt_welcome_title, bt_welcome_login, input_email, input_password, btn_submit, etc.) e está armazenado no banco como "AppScan" associado ao projeto.

A funcionalidade que será implementada agora é: Gravação Inteligente de Testes com geração automática de steps Maestro + Execução do teste gravado no dispositivo com preview em tempo real.

---

# PROBLEMA ATUAL

PROBLEMA ATUAL (não funciona):
A gravação de testes está salvando os steps como TAP com coordenadas brutas (ex: TAP 69,385 / TAP 250,830), o que é inútil e quebra ao mudar de dispositivo ou resolução.

COMPORTAMENTO ESPERADO:
Quando o usuário clica em "Gravar" e interage com o app no celular, cada interação deve ser capturada, o elemento tocado deve ser identificado pelo seu ID (usando o AppScan já carregado), e o step deve ser gerado no formato YAML correto do Maestro, por exemplo:

  - assertVisible:
      id: "txt_welcome_title"
  - tapOn:
      id: "bt_welcome_login"
  - tapOn:
      id: "input_email"
  - inputText: "usuario@teste.com"
  - tapOn:
      id: "btn_submit"

Os steps devem aparecer no painel esquerdo em tempo real conforme o usuário interage com o dispositivo.

---

# ARQUITETURA DA GRAVAÇÃO

FLUXO DE GRAVAÇÃO — implemente exatamente desta forma:

1. INICIAR GRAVAÇÃO (botão "Gravar" clicado):
   - Frontend chama POST /api/tests/record/start com { deviceId, projectId }
   - Backend inicia sessão Python via uiautomator2 no dispositivo
   - Backend faz dump da tela atual (d.dump_hierarchy()) para obter snapshot XML dos elementos
   - Abre WebSocket ws://localhost:3001/record-session para streaming bidirecional
   - Backend começa a escutar eventos de toque no dispositivo em loop contínuo

2. CAPTURA DE TOQUE (a cada clique do usuário no celular):
   - Python detecta o evento de toque via uiautomator2 com coordenadas (x, y)
   - Python faz dump da hierarquia XML da tela ANTES do toque para pegar o estado atual
   - Encontra o elemento na posição (x, y) no XML: procura nó com bounds que contenha (x, y)
   - Extrai o resource-id do elemento (ex: "com.foxbit:id/bt_welcome_login" → limpa para "bt_welcome_login")
   - Se resource-id vazio: busca no AppScan pelo texto ou content-desc do elemento
   - Detecta o tipo de ação:
       * Toque simples → tapOn
       * Foco + teclado aberto em seguida → inputText (captura o texto digitado)
       * Scroll → scroll (direção detectada pelo delta)
   - Envia o step via WebSocket para o frontend em JSON:
     { "action": "tapOn", "id": "bt_welcome_login", "text": null, "timestamp": 1234567890 }

3. GERAÇÃO DO ASSERTVISIBLE AUTOMÁTICO:
   - Ao iniciar a gravação e a cada navegação de tela detectada (mudança significativa no dump XML),
     o sistema automaticamente adiciona um assertVisible com o primeiro elemento visível identificável da tela,
     garantindo que o flow confirme estar na tela certa antes de agir.

4. RENDERIZAÇÃO NO PAINEL (frontend):
   - O frontend recebe o JSON via WebSocket e converte para YAML Maestro visualmente:
       { action: "tapOn", id: "bt_welcome_login" }
       → exibe como:  tapOn › bt_welcome_login
   - Internamente armazena o step como objeto estruturado para posterior serialização em YAML real
   - O painel de steps mostra ícone por tipo: 👁 assertVisible, 👆 tapOn, ⌨ inputText, 📜 scroll

5. PARAR GRAVAÇÃO (botão "Parar"):
   - Frontend chama POST /api/tests/record/stop
   - Backend encerra a sessão Python e fecha o WebSocket
   - Frontend serializa todos os steps em YAML Maestro válido e salva via POST /api/tests/{id}
   - YAML final gerado:
     appId: br.com.foxbit.foxbitandroid
     ---
     - assertVisible:
         id: "txt_welcome_title"
     - tapOn:
         id: "bt_welcome_login"
     - tapOn:
         id: "input_email"
     - inputText: "usuario@teste.com"

---

# EXECUÇÃO NO DISPOSITIVO

FLUXO DE EXECUÇÃO — botão "Executar Teste":

1. PREPARAÇÃO:
   - Frontend chama POST /api/tests/{testId}/execute com { deviceId }
   - Backend recupera o YAML do teste do banco
   - Salva o YAML temporariamente em /tmp/qamind_tests/{testId}.yaml
   - Abre WebSocket ws://localhost:3001/execution-session/{testId} para streaming de status

2. EXECUÇÃO VIA MAESTRO:
   - Backend executa: maestro --device {deviceId} test /tmp/qamind_tests/{testId}.yaml
   - Captura stdout/stderr em tempo real via child_process (Node) com spawn()
   - Parseia cada linha de output do Maestro e envia via WebSocket ao frontend:
     { "type": "step_start", "stepIndex": 0, "stepName": "assertVisible txt_welcome_title" }
     { "type": "step_pass", "stepIndex": 0, "duration_ms": 230 }
     { "type": "step_fail", "stepIndex": 2, "error": "Element not found: input_email" }
     { "type": "execution_complete", "status": "passed", "total_ms": 4200 }

3. PREVIEW EM TEMPO REAL (painel direito):
   - A cada step executado, backend tira screenshot via: adb -s {deviceId} exec-out screencap -p
   - Envia screenshot como base64 via WebSocket
   - Frontend atualiza o preview do dispositivo em tempo real com a imagem recebida
   - Frequência: screenshot a cada step concluído (não em loop contínuo, para não sobrecarregar)

4. HIGHLIGHT DE STEPS NO PAINEL ESQUERDO:
   - Ao receber step_start: destaca o step atual em azul no painel
   - Ao receber step_pass: marca o step com ✓ verde
   - Ao receber step_fail: marca o step com ✗ vermelho e expande a mensagem de erro inline
   - Ao receber execution_complete: exibe badge de resultado geral (Passou / Falhou)

5. TRATAMENTO DE ERROS COMUNS:
   - "Element not found": o step fica vermelho, exibe sugestão "Verifique se o ID ainda existe no AppScan"
   - "App not running": backend reinicia o app via: adb shell monkey -p br.com.foxbit.foxbitandroid 1
   - Timeout (>30s sem resposta do Maestro): cancela execução e marca como "Timeout"
   - Xiaomi MIUI: adicionar flag --no-animation no comando Maestro para evitar AndroidDriverTimeoutException

---

# CONTRATOS DE API

ENDPOINTS FASTIFY necessários:

POST /api/tests/record/start
  body: { deviceId: string, projectId: string, testName: string }
  response: { sessionId: string, wsUrl: string }

POST /api/tests/record/stop
  body: { sessionId: string }
  response: { steps: Step[], yamlPreview: string }

POST /api/tests
  body: { projectId, name, steps: Step[], yaml: string }
  response: { testId: string }

POST /api/tests/:testId/execute
  body: { deviceId: string }
  response: { executionId: string, wsUrl: string }

GET /api/tests/:testId
  response: { id, name, steps, yaml, lastRun, status }

MODELO DE STEP (TypeScript):
interface TestStep {
  id: string;          // uuid
  order: number;
  action: 'assertVisible' | 'tapOn' | 'inputText' | 'scroll' | 'swipe' | 'waitForAnimationToEnd';
  elementId?: string;  // resource-id limpo do elemento
  value?: string;      // texto para inputText
  direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';  // para scroll/swipe
  timeout?: number;    // ms, padrão 5000
}

SERIALIZAÇÃO YAML (função utilitária):
function stepsToMaestroYaml(appId: string, steps: TestStep[]): string {
  const header = `appId: ${appId}\n---\n`;
  const body = steps.map(step => {
    switch (step.action) {
      case 'assertVisible':
        return `- assertVisible:\n    id: "${step.elementId}"`;
      case 'tapOn':
        return `- tapOn:\n    id: "${step.elementId}"`;
      case 'inputText':
        return `- inputText: "${step.value}"`;
      case 'scroll':
        return `- scroll`;
      case 'swipe':
        return `- swipe:\n    direction: ${step.direction}`;
      case 'waitForAnimationToEnd':
        return `- waitForAnimationToEnd:\n    timeout: ${step.timeout || 5000}`;
    }
  }).join('\n');
  return header + body;
}

---

# SERVIÇO PYTHON

Crie o arquivo services/device_recorder.py com a seguinte lógica:

import uiautomator2 as u2
import xml.etree.ElementTree as ET
import json, asyncio, websockets, re

def clean_resource_id(resource_id: str) -> str:
    """Remove o prefixo do pacote, ex: 'com.foxbit:id/btn_login' → 'btn_login'"""
    match = re.search(r'/(.+)$', resource_id)
    return match.group(1) if match else resource_id

def find_element_at(xml_dump: str, x: int, y: int) -> dict:
    """Encontra o elemento tocado pela posição (x,y) no XML dump da hierarquia"""
    root = ET.fromstring(xml_dump)
    best_match = None
    best_area = float('inf')
    
    for node in root.iter():
        bounds = node.get('bounds', '')
        match = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
        if not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        if x1 <= x <= x2 and y1 <= y <= y2:
            area = (x2 - x1) * (y2 - y1)
            if area < best_area:  # pega o menor elemento que contém o ponto
                best_area = area
                resource_id = node.get('resource-id', '')
                best_match = {
                    'resource_id': clean_resource_id(resource_id) if resource_id else None,
                    'text': node.get('text', ''),
                    'content_desc': node.get('content-desc', ''),
                    'class': node.get('class', ''),
                    'clickable': node.get('clickable') == 'true',
                    'focusable': node.get('focusable') == 'true',
                }
    return best_match

async def record_session(device_id: str, ws_uri: str, app_scan: dict):
    """
    Loop principal de gravação. Monitora toques no dispositivo,
    identifica elementos e envia steps via WebSocket.
    app_scan: dict { element_id: { text, bounds, type } } do escaneamento anterior
    """
    d = u2.connect(device_id)
    prev_xml = d.dump_hierarchy()
    prev_activity = d.app_current()['activity']
    
    async with websockets.connect(ws_uri) as ws:
        # Assertiva inicial da tela de entrada
        first_el = get_first_visible_id(prev_xml)
        if first_el:
            await ws.send(json.dumps({
                "action": "assertVisible", "id": first_el
            }))
        
        while True:
            # Espera evento de toque (polling leve via uiautomator2 watcher)
            event = d.wait_for_event(timeout=60)
            if event is None:
                continue
            
            x, y = event.get('x'), event.get('y')
            curr_xml = d.dump_hierarchy()
            element = find_element_at(prev_xml, x, y)
            
            if element and element['resource_id']:
                elem_id = element['resource_id']
            else:
                # fallback: busca no AppScan por texto ou content-desc
                elem_id = lookup_in_app_scan(app_scan, element)
            
            if element and element['focusable']:
                # Próxima ação pode ser inputText — espera 800ms para verificar
                await asyncio.sleep(0.8)
                text_entered = d.xpath(f'//[@resource-id="{elem_id}"]').get_text()
                await ws.send(json.dumps({"action": "tapOn", "id": elem_id}))
                if text_entered:
                    await ws.send(json.dumps({"action": "inputText", "value": text_entered}))
            else:
                await ws.send(json.dumps({"action": "tapOn", "id": elem_id}))
            
            # Detecta mudança de tela → insere novo assertVisible
            curr_activity = d.app_current()['activity']
            if curr_activity != prev_activity:
                new_id = get_first_visible_id(curr_xml)
                if new_id:
                    await ws.send(json.dumps({"action": "assertVisible", "id": new_id}))
                prev_activity = curr_activity
            
            prev_xml = curr_xml

---

# INTERFACE

COMPONENTE StepPanel (painel esquerdo):

- Cada step é renderizado com um componente StepItem que mostra:
  * Número do step (ordem)
  * Ícone do tipo: 👁 assertVisible | 👆 tapOn | ⌨ inputText | 📜 scroll
  * Label legível: "Confirmar tela › txt_welcome_title" ou "Tocar em › bt_welcome_login"
  * Durante gravação: badge "gravando" pulsante no step mais recente
  * Durante execução: estado visual (idle / running / passed / failed)
  * Em caso de falha: expand inline com mensagem de erro e sugestão

- O painel aceita edição manual dos steps:
  * Clique no step → abre modal de edição com campos: action (select), elementId (input com autocomplete do AppScan), value
  * Botão de reordenar (drag handle)
  * Botão de deletar step
  * Botão "+ Adicionar step" ao final

COMPONENTE DevicePreview (painel direito):

- Exibe o mirror do dispositivo durante gravação (usa scrcpy ou screenshot polling a cada 500ms)
- Durante execução: atualiza com screenshots recebidos via WebSocket a cada step
- Overlay de status no topo do preview: "Gravando..." (vermelho pulsante) | "Executando step 3/8" | "Passou ✓" | "Falhou ✗"
- Quando o teste passa: exibe confetti animado breve sobre o preview
- Quando falha: destaca o step com borda vermelha sobre o screenshot

TOOLBAR superior:
- Estado IDLE:      [Gravar ●]  [Executar ▶]  [Salvar 💾]
- Estado GRAVANDO:  [Parar ■]   [Executar ▶ desabilitado]  [Salvar 💾]
- Estado EXECUTANDO:[Cancelar ✕] [Status badge animado]

PERSISTÊNCIA LOCAL (durante gravação):
- A cada step recebido, salva automaticamente em localStorage['draft_steps_{testId}']
- Se a página for recarregada acidentalmente durante gravação, restaura o rascunho
- Ao salvar com sucesso, limpa o localStorage

---

# CHECKLIST DE VALIDAÇÃO

Após implementar, valide cada item antes de considerar concluído:

GRAVAÇÃO:
[ ] Clicar em um botão no celular → step "tapOn: id: bt_X" aparece no painel em < 1s
[ ] Digitar em um campo → steps "tapOn: id: input_X" + "inputText: valor" aparecem
[ ] Navegar para outra tela → step "assertVisible: id: primeiro_elemento" inserido automaticamente
[ ] Steps NÃO contêm coordenadas brutas (números sem id)
[ ] Steps aparecem em ordem correta, sem duplicatas
[ ] O YAML gerado ao salvar é válido e parseável pelo Maestro

EXECUÇÃO:
[ ] Clicar em "Executar Teste" → Maestro inicia o flow no dispositivo conectado
[ ] O preview do dispositivo atualiza com screenshot a cada step concluído
[ ] Steps passados ficam verdes ✓ no painel em tempo real
[ ] Steps com falha ficam vermelhos ✗ com mensagem de erro inline
[ ] Ao concluir: badge "Passou" ou "Falhou" aparece corretamente
[ ] Teste no Xiaomi Redmi Note 13 não dá AndroidDriverTimeoutException

EDGE CASES:
[ ] Elemento sem resource-id → fallback para texto/content-desc do AppScan
[ ] App crashar durante execução → step marcado como falha com "App encerrado inesperadamente"
[ ] Dispositivo desconectado durante gravação → modal de erro + rascunho salvo localmente
[ ] YAML com 0 steps → botão "Executar" desabilitado com tooltip "Nenhum step gravado"

---