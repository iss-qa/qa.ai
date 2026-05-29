# QAMind — Parte 2: Módulo Android (ADB + uiautomator2)
> **Prompt de desenvolvimento para IA**
> Pré-requisito: Parte 1 concluída. Schema Supabase e tipos `TestStep` disponíveis.

---

## 🎯 Objetivo desta parte

Criar o daemon Python que se conecta a dispositivos Android via ADB, captura eventos de interação em tempo real, tira screenshots, faz dump de UI e executa steps programaticamente. Este é o motor de execução do QAMind para Android.

---

## 📦 Stack desta parte

| Componente | Tecnologia |
|-----------|-----------|
| Linguagem | Python 3.11+ |
| Driver Android | uiautomator2 |
| Comunicação | WebSocket (websockets lib) + REST (FastAPI) |
| Screenshots | ADB nativo + uiautomator2 |
| Eventos | uiautomator2 watcher |
| Empacotamento | Docker (opcional) |

---

## 🗂️ Estrutura do Daemon

```
daemon/
├── main.py                    # Entry point: FastAPI + WebSocket server
├── android/
│   ├── __init__.py
│   ├── device_manager.py      # Detectar, conectar, monitorar dispositivos
│   ├── executor.py            # Executar steps TestStep no dispositivo
│   ├── recorder.py            # Gravar interações do usuário em tempo real
│   ├── screenshot.py          # Captura e envio de screenshots
│   └── ui_inspector.py        # uiautomator dump e análise de elementos
├── models/
│   ├── step.py                # Mapeamento de TestStep para ações u2
│   ├── device.py              # Modelo de Device
│   └── run_event.py           # Eventos emitidos via WebSocket
├── ws/
│   ├── server.py              # WebSocket server handlers
│   └── events.py              # Definição de eventos WS
├── requirements.txt
└── .env
```

---

## 📋 Instalação e Setup

### requirements.txt
```
uiautomator2==3.3.1
fastapi==0.111.0
uvicorn==0.30.0
websockets==12.0
python-dotenv==1.0.1
pillow==10.3.0
httpx==0.27.0
aiofiles==23.2.1
```

### Instalar dependências de sistema
```bash
# uiautomator2 precisa do atxagent no dispositivo
pip install uiautomator2
python -m uiautomator2 init   # instala o agente no dispositivo conectado
```

---

## 🔧 device_manager.py — Gerenciador de Dispositivos

```python
"""
Responsável por detectar dispositivos Android via ADB,
manter a lista atualizada e monitorar o status de conexão.
"""
import asyncio
import subprocess
import uiautomator2 as u2
from typing import Dict, Optional
from models.device import Device, DeviceStatus

class DeviceManager:
    """
    Gerencia conexões com dispositivos Android.
    
    Comportamento esperado:
    - poll_devices() deve ser chamado em loop (a cada 5s)
    - Detecta novas conexões e desconexões automaticamente
    - Emite eventos via WebSocket quando status muda
    - Suporta conexão USB e WiFi (adb connect <ip>:<porta>)
    """
    
    def __init__(self, ws_broadcaster=None):
        self.devices: Dict[str, Device] = {}
        self.connections: Dict[str, u2.Device] = {}
        self.ws_broadcaster = ws_broadcaster
    
    async def poll_devices(self):
        """
        Lista dispositivos ADB e atualiza o estado interno.
        Emite evento 'device_connected' ou 'device_disconnected' quando há mudança.
        """
        # Implementar:
        # 1. Chamar `adb devices` via subprocess
        # 2. Parsear a saída para obter lista de UDIDs
        # 3. Para cada UDID novo: criar Device, tentar conectar u2, emitir evento
        # 4. Para cada UDID removido: atualizar status para offline, emitir evento
        raise NotImplementedError
    
    def connect(self, udid: str) -> u2.Device:
        """
        Conecta ao dispositivo via uiautomator2.
        Retorna o objeto u2.Device para uso pelo Executor.
        
        Levanta DeviceConnectionError se não conseguir conectar.
        """
        raise NotImplementedError
    
    def get_device_info(self, udid: str) -> dict:
        """
        Retorna informações do dispositivo:
        - model, manufacturer, android_version
        - screen_width, screen_height
        - battery_level
        
        Use: d.info via uiautomator2
        """
        raise NotImplementedError
    
    def list_online_devices(self) -> list[Device]:
        """Retorna apenas dispositivos com status online."""
        raise NotImplementedError
```

---

## ⚡ executor.py — Executor de Steps

```python
"""
Executa steps do tipo TestStep em um dispositivo Android.
Este é o componente mais crítico — cada tipo de ação deve ser mapeado
para a chamada correta do uiautomator2.
"""
import uiautomator2 as u2
import asyncio
from models.step import TestStep, StepAction
from models.run_event import RunEvent

class StepExecutor:
    """
    Executa steps individualmente no dispositivo.
    
    Importante:
    - Cada step deve retornar StepResult com status, screenshot, duração
    - Em caso de falha, NUNCA lançar exception — retornar StepResult com status='failed'
    - Sempre tirar screenshot DEPOIS de executar (para o loop de visão da IA)
    - Implementar timeout configurável por step (padrão: 10s)
    """
    
    def __init__(self, device: u2.Device, screenshot_handler, ws_broadcaster):
        self.d = device
        self.screenshot_handler = screenshot_handler
        self.ws_broadcaster = ws_broadcaster
    
    async def execute_step(self, step: TestStep) -> StepResult:
        """
        Ponto de entrada principal. Despacha para o método correto
        baseado em step.action.
        
        Antes de executar: emitir evento WS 'step_started'
        Após executar: capturar screenshot, emitir 'step_completed' ou 'step_failed'
        """
        raise NotImplementedError
    
    # ─── Implementar cada ação abaixo ────────────────────────────
    
    async def _tap(self, step: TestStep) -> bool:
        """
        Toca na tela. Estratégia de localização (em ordem de prioridade):
        1. Se step.target tem formato "x,y": usar coordenadas diretas
           → self.d.click(x, y)
        2. Se step.target é text: buscar elemento pelo texto visível
           → self.d(text=step.target).click()
        3. Se step.target é resource-id: buscar pelo ID Android
           → self.d(resourceId=step.target).click()
        4. Se step.target é xpath: usar XPath
           → self.d.xpath(step.target).click()
        
        Aguardar elemento ficar clicável com timeout step.timeout_ms
        """
        raise NotImplementedError
    
    async def _type_text(self, step: TestStep) -> bool:
        """
        Digita texto no elemento focado.
        1. Se step.target definido: clicar no elemento primeiro
        2. Limpar campo: self.d.clear_text()
        3. Digitar: self.d.send_keys(step.value)
        
        ATENÇÃO: Para campos de senha, logar como '****' no evento WS
        """
        raise NotImplementedError
    
    async def _swipe(self, step: TestStep) -> bool:
        """
        Desliza na tela.
        step.value formato: "up|down|left|right" ou "x1,y1,x2,y2"
        
        Para direções simples, calcular coordenadas baseado no tamanho da tela.
        Velocidade padrão: 300ms de duração
        """
        raise NotImplementedError
    
    async def _long_press(self, step: TestStep) -> bool:
        """Toque longo. Duração padrão: 1500ms. step.value pode sobrescrever."""
        raise NotImplementedError
    
    async def _press_back(self, step: TestStep) -> bool:
        """Pressiona botão voltar: self.d.press('back')"""
        raise NotImplementedError
    
    async def _press_home(self, step: TestStep) -> bool:
        """Pressiona botão home: self.d.press('home')"""
        raise NotImplementedError
    
    async def _scroll(self, step: TestStep) -> bool:
        """
        Scroll em um container.
        step.target: elemento container (opcional)
        step.value: "up|down|left|right" + quantidade opcional
        """
        raise NotImplementedError
    
    async def _wait(self, step: TestStep) -> bool:
        """
        Aguarda um elemento aparecer OU tempo fixo.
        step.target: seletor do elemento a aguardar (opcional)
        step.value: tempo em ms (padrão: 2000ms)
        
        Se target definido: self.d(...).wait(timeout=X)
        Se não: asyncio.sleep(X/1000)
        """
        raise NotImplementedError
    
    async def _assert_text(self, step: TestStep) -> bool:
        """
        Verifica se um texto está visível na tela.
        step.value: texto a verificar
        step.target: elemento específico a verificar (opcional)
        
        Retorna True se encontrado, False caso contrário.
        Não lança exception — retorna False com mensagem de erro descritiva.
        """
        raise NotImplementedError
    
    async def _assert_element(self, step: TestStep) -> bool:
        """
        Verifica se um elemento existe e está visível.
        step.target: seletor do elemento
        step.value: "visible|exists|enabled|gone" (padrão: "visible")
        """
        raise NotImplementedError
    
    async def _open_app(self, step: TestStep) -> bool:
        """
        Abre o aplicativo.
        step.value: package name (ex: com.banco.app)
        
        Usar: self.d.app_start(step.value)
        Aguardar até 5s para o app estar em foreground.
        """
        raise NotImplementedError
```

---

## 📸 recorder.py — Gravador de Interações

```python
"""
Grava as interações do usuário no dispositivo em tempo real.
Converte toques/gestos em objetos TestStep para o editor.
"""
import uiautomator2 as u2
from models.step import TestStep

class InteractionRecorder:
    """
    Monitora o dispositivo e captura interações em tempo real.
    
    Funcionamento:
    - Usa uiautomator2 watcher para detectar cliques
    - Tira screenshot e dump de UI após cada interação
    - Tenta identificar o elemento clicado pelo dump de UI
    - Emite via WebSocket cada step capturado para o frontend
    
    O frontend exibe os steps sendo gerados em tempo real no editor.
    """
    
    is_recording: bool = False
    recorded_steps: list[TestStep] = []
    
    async def start_recording(self, udid: str):
        """
        Inicia a gravação.
        1. Conectar ao dispositivo
        2. Configurar listeners de eventos
        3. Definir is_recording = True
        4. Emitir evento WS 'recording_started'
        """
        raise NotImplementedError
    
    async def stop_recording(self) -> list[TestStep]:
        """
        Para a gravação e retorna os steps capturados.
        Emite evento WS 'recording_stopped' com a lista de steps.
        """
        raise NotImplementedError
    
    async def _on_touch_event(self, x: int, y: int):
        """
        Chamado a cada toque detectado.
        
        1. Tirar screenshot antes do próximo render
        2. Fazer dump de UI: self.d.dump_hierarchy()
        3. Encontrar o elemento em (x, y) no XML do dump
        4. Extrair: resource-id, text, content-desc, class
        5. Criar TestStep com a melhor estratégia de localização:
           - Preferir resource-id quando disponível
           - Fallback para text
           - Fallback para coordenadas
        6. Emitir evento WS 'step_recorded' com o step
        """
        raise NotImplementedError
    
    def _parse_element_at(self, dump_xml: str, x: int, y: int) -> dict:
        """
        Parseia o XML do dump de UI para encontrar o elemento
        nas coordenadas (x, y).
        
        Retorna dict com: resource_id, text, content_desc, class_name, bounds
        """
        raise NotImplementedError
    
    def _build_best_selector(self, element_info: dict, x: int, y: int) -> tuple[str, str]:
        """
        Escolhe a melhor estratégia de seletor para o elemento.
        Retorna tuple (target, target_type) onde target_type é
        'resource_id' | 'text' | 'coordinates'
        """
        raise NotImplementedError
```

---

## 📡 ws/events.py — Protocolo de Eventos WebSocket

```python
"""
Define todos os eventos trocados entre o daemon e o frontend via WebSocket.
IMPORTANTE: Manter compatibilidade — o frontend depende deste contrato.
"""
from enum import Enum
from dataclasses import dataclass
from typing import Any, Optional
import json
from datetime import datetime

class EventType(str, Enum):
    # Dispositivos
    DEVICE_CONNECTED = "device_connected"
    DEVICE_DISCONNECTED = "device_disconnected"
    DEVICE_STATUS_CHANGED = "device_status_changed"
    
    # Gravação
    RECORDING_STARTED = "recording_started"
    RECORDING_STOPPED = "recording_stopped"
    STEP_RECORDED = "step_recorded"         # novo step capturado pelo recorder
    SCREENSHOT_UPDATED = "screenshot_updated"  # nova screenshot disponível
    
    # Execução
    RUN_STARTED = "run_started"
    RUN_COMPLETED = "run_completed"
    RUN_FAILED = "run_failed"
    RUN_CANCELLED = "run_cancelled"
    STEP_STARTED = "step_started"
    STEP_COMPLETED = "step_completed"
    STEP_FAILED = "step_failed"
    STEP_RETRYING = "step_retrying"
    
    # IA
    AI_ANALYSIS_STARTED = "ai_analysis_started"
    AI_ANALYSIS_COMPLETED = "ai_analysis_completed"
    AI_AUTOCORRECT = "ai_autocorrect"       # IA tentando corrigir step
    
    # Bug Report
    BUG_REPORT_GENERATING = "bug_report_generating"
    BUG_REPORT_READY = "bug_report_ready"
    
    # Erros
    ERROR = "error"

@dataclass
class RunEvent:
    type: EventType
    run_id: str
    data: dict
    timestamp: str = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()
    
    def to_json(self) -> str:
        return json.dumps({
            "type": self.type.value,
            "run_id": self.run_id,
            "data": self.data,
            "timestamp": self.timestamp
        })

# Exemplos de payloads:

# STEP_COMPLETED payload:
# {
#   "step_num": 3,
#   "action": "tap",
#   "target": "btn_login",
#   "status": "passed",
#   "duration_ms": 342,
#   "screenshot_url": "https://storage.supabase.../step3_after.jpg",
#   "element_highlighted": {"x": 540, "y": 1200, "w": 120, "h": 48}
# }

# SCREENSHOT_UPDATED payload:
# {
#   "url": "https://storage.supabase.../screenshot_live.jpg",
#   "step_num": 3,
#   "timestamp": "2026-01-15T14:30:00Z"
# }
```

---

## 🌐 main.py — Entry Point FastAPI

```python
"""
Servidor principal do daemon.
Expõe endpoints REST para controle e WebSocket para streaming.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="QAMind Daemon", version="1.0.0")

# Endpoints REST a implementar:
# GET  /health                    → status do daemon e dispositivos
# GET  /devices                   → lista dispositivos conectados
# POST /devices/{udid}/connect    → conectar a um dispositivo
# POST /runs                      → iniciar execução de um test case
# POST /runs/{run_id}/cancel      → cancelar execução em andamento
# POST /recordings/start          → iniciar gravação em dispositivo
# POST /recordings/stop           → parar gravação e retornar steps
# POST /screenshot/{udid}         → capturar screenshot atual

# WebSocket:
# WS /ws/{client_id}              → canal de eventos em tempo real
```

---

## 📸 screenshot.py — Captura e Upload

```python
"""
Captura screenshots do dispositivo e faz upload para o Supabase Storage.
Otimizar: comprimir para JPEG 80% antes do upload.
"""
import uiautomator2 as u2
from PIL import Image
import io
import httpx

class ScreenshotHandler:
    
    QUALITY = 80           # JPEG quality (balancear velocidade vs qualidade)
    MAX_WIDTH = 1080       # Redimensionar se maior que isso
    
    async def capture_and_upload(
        self, 
        device: u2.Device,
        run_id: str,
        step_num: int,
        phase: str   # "before" | "after" | "live"
    ) -> str:
        """
        1. Capturar: img = device.screenshot()
        2. Redimensionar se necessário (manter aspect ratio)
        3. Comprimir para JPEG
        4. Upload para Supabase Storage: screenshots/{run_id}/step_{num}_{phase}.jpg
        5. Retornar URL pública
        
        Deve completar em menos de 500ms no total.
        """
        raise NotImplementedError
```

---

## ✅ Critérios de Conclusão desta Parte

- [ ] `python main.py` inicia o daemon sem erros
- [ ] `GET /health` retorna dispositivos detectados corretamente
- [ ] Conectar dispositivo Android via USB → aparece na lista com info correta
- [ ] `_tap` executa toque por coordenada e por resource-id com sucesso
- [ ] `_type_text` digita texto num campo de input
- [ ] `_assert_text` retorna True para texto visível, False para invisível
- [ ] `_open_app` abre o aplicativo e aguarda estar em foreground
- [ ] Gravação: cada toque no celular emite evento WS `step_recorded` com step correto
- [ ] Screenshot capturado e upado para Supabase em < 500ms
- [ ] Evento `screenshot_updated` emitido com URL após cada step
- [ ] Reconexão automática se dispositivo desconectar e reconectar

---

## 🔗 Contrato para a Próxima Parte

A Parte 3 (Orquestrador de IA) vai chamar `executor.execute_step(step)` e espera receber:

```python
@dataclass
class StepResult:
    step_num: int
    status: str          # "passed" | "failed"
    duration_ms: int
    screenshot_url: str  # URL do screenshot após a execução
    error_message: str | None
    element_found: bool
    retry_count: int
```

O WebSocket deve estar estável antes de avançar para a próxima parte.
