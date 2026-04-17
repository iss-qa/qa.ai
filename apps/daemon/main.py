import asyncio
import logging
import json
import re as _re
import tempfile
import uuid as _uuid_lib
import xml.etree.ElementTree as _ET
import base64 as _base64
from typing import List, Optional
import io
from PIL import Image
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import subprocess
import ssl
from pathlib import Path
import httpx

# Global bypass for SSL certificate verification
# Necessary for environments behind VPNs or Proxies with self-signed certs
ssl._create_default_https_context = ssl._create_unverified_context

from android.device_manager import device_manager_instance
from android.executor import StepExecutor
from android.screenshot import screenshot_handler, capture_screenshot_fast, capture_screenshot_with_native_size
from android.recorder import InteractionRecorder, active_recorders
from ws.server import ws_server
from ws.stream_manager import screen_stream_manager
from models.step import TestStep, StepResult
from models.device import DeviceStatus
from web_driver.executor import WebDriverExecutor
from routes.device_input import router as device_input_router
from routes.engines import router as engines_router
from engines.maestro_runner import run_with_maestro, save_yaml_flow
from engines.maestro_validator import validate_maestro_yaml
from log_manager import log_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

app = FastAPI(title="QAMind Daemon", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(device_input_router)
app.include_router(engines_router)

# Startup background tasks
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(device_manager_instance.poll_devices())
    logger.info("Started device polling background task.")
    # Run log rotation on startup
    try:
        log_manager.rotate_logs()
        logger.info("Log rotation completed.")
    except Exception as e:
        logger.warning(f"Log rotation failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Tear down the embedded maestro studio subprocess so ports/sessions don't leak."""
    global _mss_embedded_process
    if _mss_embedded_process and _mss_embedded_process.poll() is None:
        try:
            _mss_embedded_process.terminate()
            _mss_embedded_process.wait(timeout=5)
        except Exception:
            try: _mss_embedded_process.kill()
            except Exception: pass
        logger.info("Embedded maestro studio terminated.")

# --- REST Endpoints ---

@app.get("/health")
async def health_check():
    devices = device_manager_instance.list_online_devices()
    return {"status": "ok", "devices_connected": len(devices)}

@app.get("/devices")
async def list_devices():
    return {"devices": [d.model_dump() for d in device_manager_instance.list_online_devices()]}

@app.get("/devices/scan")
async def scan_devices():
    success = await device_manager_instance.scan_now()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to scan devices")
    return {"devices": [d.model_dump() for d in device_manager_instance.list_online_devices()]}

@app.post("/devices/{udid}/connect")
async def connect_device(udid: str):
    try:
        device_manager_instance.connect(udid)
        return {"status": "connected", "udid": udid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/devices/install-apk")
async def install_apk(udid: str = Form(...), apk: UploadFile = File(...)):
    # Save APK temporarily
    tmp_path = f"/tmp/{apk.filename}"
    with open(tmp_path, "wb") as f:
        f.write(await apk.read())
    
    # Install via ADB
    result = subprocess.run(
        ['adb', '-s', udid, 'install', '-r', tmp_path],
        capture_output=True, text=True, timeout=120
    )
    
    os.remove(tmp_path)
    
    if result.returncode == 0:
        return {"success": True}
    else:
        return {"success": False, "error": result.stderr or result.stdout}

@app.get("/api/devices/{udid}/screenshot")
async def get_screenshot(udid: str):
    """Returns a JPEG screenshot as an attachment for download."""
    jpeg_bytes = await capture_screenshot_fast(udid)
    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={"Content-Disposition": f"attachment; filename=screenshot-{udid}.jpg"}
    )

@app.websocket("/stream/{udid}")
async def websocket_device_stream(websocket: WebSocket, udid: str):
    # Check device is known via ADB (scrcpy doesn't need uiautomator2)
    known_devices = device_manager_instance.devices
    if udid not in known_devices or known_devices[udid].status != DeviceStatus.ONLINE:
        # Accept first so we can send a proper close code instead of 403
        await websocket.accept()
        await websocket.close(code=1008, reason=f"Device {udid} not found or offline")
        logger.warning(f"Stream rejected: device {udid} not found or offline")
        return

    try:
        # A própria função connect no stream_manager fará o bind das mensagens
        # e bloqueará até a desconexão ou erro.
        await screen_stream_manager.connect(udid, websocket)

    except WebSocketDisconnect:
        logger.info(f"Stream WebSocket disconnected normally for {udid}")
        await screen_stream_manager.disconnect(udid)
    except Exception as e:
        logger.error(f"Stream WebSocket error for {udid}: {e}")
        await screen_stream_manager.disconnect(udid)

class RunRequest(BaseModel):
    run_id: str
    steps: List[TestStep]

from ai.prompt_parser import PromptParser
from ai.vision_analyzer import VisionAnalyzer
from ai.auto_corrector import AutoCorrector
from ai.orchestrator import RunOrchestrator, TestCase
import os
from dotenv import load_dotenv

load_dotenv()

# Init AI dependencies
anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_KEY", "")
# Service role key bypasses RLS — use this for server-side inserts
supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY", "") or supabase_key

prompt_parser = PromptParser(anthropic_api_key)
vision_analyzer = VisionAnalyzer(anthropic_api_key)
auto_corrector = AutoCorrector()

class ImageData(BaseModel):
    data: str  # base64 encoded image
    media_type: str = "image/jpeg"
    label: str = ""

class ParseRequest(BaseModel):
    prompt: str
    platform: str = "android"
    project_id: str = "default_project"
    device_udid: Optional[str] = None
    model: str = "claude-sonnet-4-6"
    engine: str = "uiautomator2"
    images: Optional[List[ImageData]] = None

@app.post("/api/tests/parse-prompt")
async def parse_prompt(req: ParseRequest):
    try:
        result = await prompt_parser.parse(req.prompt, req.platform, model=req.model)
        return {
            "steps": [s.model_dump() for s in result.steps],
            "test_name": result.test_name,
            "estimated_duration_s": result.estimated_duration_s
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tests/parse-prompt-stream")
async def parse_prompt_stream(req: ParseRequest):
    import uuid as _uuid
    from android.element_scanner import load_element_map, element_map_to_prompt_context

    build_id = f"build_{_uuid.uuid4().hex[:12]}"

    # ── Log build start ─────────────────────────────────────────────
    log_manager.build(f"═══════════════════════════════════════", build_id=build_id)
    log_manager.build(f"NOVA MONTAGEM DE CASO DE TESTE", build_id=build_id)
    log_manager.build(f"Prompt: {req.prompt[:300]}", build_id=build_id)
    log_manager.build(f"Engine: {req.engine.upper()} | Modelo: {req.model} | Plataforma: {req.platform}", build_id=build_id)
    log_manager.build(f"Projeto: {req.project_id}", build_id=build_id)

    # ── UI Hierarchy ─────────────────────────────────────────────────
    ui_context = ""
    if req.device_udid:
        log_manager.build(f"Device: {req.device_udid} → capturando hierarquia XML...", build_id=build_id)
        try:
            d = device_manager_instance.get_device(req.device_udid)
            if d:
                ui_context = d.dump_hierarchy()
                logger.info(f"UI Context retrieved for {req.device_udid}, length: {len(ui_context)}")
                log_manager.build(f"  ✓ Hierarquia XML capturada: {len(ui_context)} chars", build_id=build_id)
            else:
                log_manager.build(f"  ✗ Device {req.device_udid} não encontrado no device_manager", build_id=build_id, level="WARN")
        except Exception as e:
            logger.warning(f"Failed to get UI context for {req.device_udid}: {e}")
            log_manager.build(f"  ✗ Falha ao capturar hierarquia XML: {e}", build_id=build_id, level="WARN")
    else:
        log_manager.build(f"Device: não informado (sem hierarquia XML)", build_id=build_id)

    # ── Element Map ───────────────────────────────────────────────────
    element_map_context = ""
    if req.project_id and req.project_id != "default_project":
        emap = load_element_map(req.project_id)
        if emap:
            element_map_context = element_map_to_prompt_context(emap)
            logger.info(f"Element map loaded for project {req.project_id}: {len(element_map_context)} chars")
            # Count elements in map
            elem_count = element_map_context.count("resource-id:") + element_map_context.count("text:")
            log_manager.build(f"  ✓ Element map carregado: {len(element_map_context)} chars (~{elem_count} referências)", build_id=build_id)
        else:
            log_manager.build(f"  ✗ Sem element map para projeto {req.project_id} (execute 'Ler Aplicação' para escanear)", build_id=build_id)
    else:
        log_manager.build(f"  ✗ project_id não informado → sem element map", build_id=build_id)

    # ── Reference Images ──────────────────────────────────────────────
    images_base64 = None
    if req.images:
        images_base64 = [img.model_dump() for img in req.images]
        logger.info(f"Received {len(images_base64)} reference images for analysis")
        log_manager.build(f"  ✓ Imagens de referência: {len(images_base64)}", build_id=build_id)
        for img in images_base64:
            log_manager.build(f"    - {img.get('label', 'sem-nome')} [{img.get('media_type', '?')}]", build_id=build_id)
    else:
        log_manager.build(f"  ✗ Sem imagens de referência", build_id=build_id)

    return StreamingResponse(
        prompt_parser.parse_stream(
            req.prompt, req.platform, ui_context=ui_context,
            model=req.model, engine=req.engine,
            images_base64=images_base64,
            element_map_context=element_map_context,
            build_id=build_id,
        ),
        media_type="text/event-stream"
    )

class RunAIRequest(BaseModel):
    test_case_id: str
    device_udid: Optional[str] = None
    run_id: str
    steps: list  # List[TestStep] for u2, list[dict] for maestro
    platform: str = "android"
    engine: str = "uiautomator2"
    yaml_path: Optional[str] = None
    env_vars: Optional[dict] = None

# Dictionary to keep track of active run orchestrators for cancellation
active_runs = {}

def _extract_element_name(text: str) -> str:
    """
    Extract the REAL UI element name from a user description.
    Aggressively removes action verbs, filler words, and context.
    The result should be the EXACT text visible on screen.

    "Clica em Busque seu produto" -> "Busque seu produto"
    "Aguarda o elemento Busque seu produto aparecer" -> "Busque seu produto"
    "Aguarda botao Entrar aparecer na tela" -> "Entrar"
    "Clica em Entrar para realizar o login" -> "Entrar"
    "Aguarda botao Entrar ficar habilitado" -> "Entrar"
    "Aguarda campo de email" -> "email"
    "Valida que feijao e exibido na aba de produtos" -> "feijao"
    """
    import re as _re
    label = text

    # 1. If quoted text exists, use it directly (user was explicit)
    quoted = _re.findall(r'"([^"]+)"', label)
    if quoted:
        return quoted[0]

    # 2. Remove action verb prefixes (longest first)
    prefixes = [
        'Aguarda o elemento ', 'Aguarda que o elemento ', 'Aguarda que ',
        'Aguarda a transicao de tela apos ', 'Aguarda a transicao',
        'Aguarda botao ', 'Aguarda o botao ', 'Aguarda campo de ',
        'Aguarda aba ', 'Aguarda o ', 'Aguarda ',
        'Clica no botao ', 'Clica no campo ', 'Clica em ',
        'Clica no ', 'Clica na ', 'Clica ',
        'Toca no campo de ', 'Toca no campo ', 'Toca no botao ',
        'Toca em ', 'Toca no ', 'Toca na ', 'Toca ',
        'Abre o app ', 'Abre o aplicativo ', 'Abre ',
        'Digita o email ', 'Digita a senha ', 'Digita o ', 'Digita a ', 'Digita ',
        'Valida que houve resultado e ', 'Valida que ', 'Valida se ',
        'Verifica que ', 'Verifica se ', 'Confirma que ',
        'Pressiona o botao ', 'Pressiona o ', 'Pressiona ', 'Esconde ',
        'Seleciona o ', 'Seleciona a ', 'Seleciona ',
    ]
    for p in prefixes:
        if label.startswith(p):
            label = label[len(p):]
            break

    # 3. Remove trailing context phrases
    suffixes = [
        ' aparecer na tela inicial', ' aparecer na tela', ' aparecer nos resultados',
        ' aparecer', ' apareca', ' na tela inicial', ' na tela',
        ' para garantir que esta selecionada', ' para garantir', ' para confirmar',
        ' para acessar', ' para fazer', ' para iniciar', ' para realizar',
        ' e exibido na aba de produtos', ' e exibido', ' esta visivel',
        ' nos resultados', ' na aba de produtos', ' no campo de busca',
        ' carregar', ' ficar visivel', ' ficar habilitado', ' ficar',
        ' apos tap', ' apos clicar', ' apos digitar',
    ]
    for s in suffixes:
        idx = label.find(s)
        if idx > 0:
            label = label[:idx]
            break

    # 4. Remove leftover filler words that should NEVER be in a selector
    # These are words from the user's description, not from the UI
    filler_words = [
        'botao ', 'o botao ', 'campo ', 'campo de ', 'o campo ',
        'tela ', 'aba ', 'menu ', 'icone ', 'link ',
        'elemento ', 'o elemento ',
    ]
    label_lower = label.lower()
    for fw in filler_words:
        if label_lower.startswith(fw):
            label = label[len(fw):]
            label_lower = label.lower()

    return label.strip()


# Known app package mappings (cache)
_APP_PACKAGE_CACHE: dict[str, str] = {
    "foxbit": "br.com.foxbit.foxbitandroid",
    "wastezero": "com.app.wastezero_app",
    "settings": "com.android.settings",
    "configuracoes": "com.android.settings",
}


def _resolve_app_package(app_name: str, udid: str = "") -> str:
    """
    Resolve an app name to its Android package ID.
    1. Check known cache
    2. Search installed packages on device via ADB
    3. Return best match or the name as-is
    """
    name_lower = app_name.lower().strip()

    # 1. Check cache
    for key, pkg in _APP_PACKAGE_CACHE.items():
        if key in name_lower or name_lower in key:
            return pkg

    # 2. Search on device via ADB
    if udid:
        try:
            result = subprocess.run(
                ['adb', '-s', udid, 'shell', 'pm', 'list', 'packages', '-3'],
                capture_output=True, text=True, timeout=5,
            )
            packages = [line.replace('package:', '').strip()
                       for line in result.stdout.strip().split('\n') if line.strip()]

            # Search by name similarity
            for pkg in packages:
                pkg_lower = pkg.lower()
                # Direct name match in package
                if name_lower.replace(' ', '') in pkg_lower.replace('.', '').replace('_', ''):
                    _APP_PACKAGE_CACHE[name_lower] = pkg
                    logger.info(f"[APP_RESOLVE] Found '{app_name}' -> {pkg}")
                    return pkg

            # Fuzzy: check each word of app name
            words = name_lower.split()
            for pkg in packages:
                pkg_lower = pkg.lower()
                if all(w in pkg_lower for w in words if len(w) > 2):
                    _APP_PACKAGE_CACHE[name_lower] = pkg
                    logger.info(f"[APP_RESOLVE] Fuzzy matched '{app_name}' -> {pkg}")
                    return pkg
        except Exception as e:
            logger.warning(f"[APP_RESOLVE] ADB search failed: {e}")

    return app_name


@app.get("/api/devices/{udid}/resolve-app")
async def resolve_app(udid: str, name: str):
    """Resolve an app name to its package ID on the device."""
    pkg = _resolve_app_package(name, udid)
    return {"app_name": name, "package_id": pkg, "resolved": pkg != name}


_PREMISES_PATH = Path(__file__).parent.parent.parent / "premises.yaml"
_premises_cache: dict = {}

def _load_premises() -> dict:
    """Carrega as premissas globais do arquivo premises.yaml (com cache em memória)."""
    global _premises_cache
    if _premises_cache:
        return _premises_cache
    try:
        import yaml as _yaml
        if _PREMISES_PATH.exists():
            with open(_PREMISES_PATH, encoding="utf-8") as f:
                _premises_cache = _yaml.safe_load(f) or {}
                logger.info(f"Premissas carregadas: {_PREMISES_PATH}")
    except Exception as e:
        logger.warning(f"Falha ao carregar premises.yaml: {e}")
        _premises_cache = {}
    return _premises_cache


# Generic terms that should be expanded to real placeholders/hints.
# When _extract_element_name returns a generic word like "email",
# we try to find the real hint text from premises or common conventions.
_GENERIC_TO_PLACEHOLDER = {
    "email": "Digite seu e-mail",
    "e-mail": "Digite seu e-mail",
    "senha": "Digite sua senha",
    "password": "Digite sua senha",
    "busca": "Buscar",
    "pesquisa": "Pesquisar",
    "pesquisar": "Pesquisar",
    "nome": "Digite seu nome",
    "telefone": "Digite seu telefone",
    "cpf": "Digite seu CPF",
}


def _resolve_generic_selector(elem: str) -> str:
    """
    If the extracted element name is a single generic word (e.g. "email", "senha"),
    try to expand it to the real placeholder/hint text.
    Also check premises.yaml common_elements for mappings.
    """
    elem_lower = elem.lower().strip()

    # Check common_elements in premises.yaml first
    premises = _load_premises()
    common = premises.get("common_elements", {})
    for _key, mapping in common.items():
        if elem_lower in (_key.lower(), mapping.get("text", "").lower()):
            # Return hint if available, else text
            return mapping.get("hint") or mapping.get("text") or elem

    # Check hardcoded generic-to-placeholder map
    if elem_lower in _GENERIC_TO_PLACEHOLDER:
        return _GENERIC_TO_PLACEHOLDER[elem_lower]

    return elem


def _action_to_maestro_command(action: str, target: str, value: str) -> str:
    """
    Convert a step action/target/value into a Maestro YAML command.
    Uses _extract_element_name to strip action verbs from user descriptions,
    then _resolve_generic_selector to expand generic terms to real placeholders.
    Applies global rules from premises.yaml automatically.
    """
    a = action.lower().strip()
    premises = _load_premises()
    if a == 'launchapp':
        after_launch = premises.get("global", {}).get("after_launch_wait", True)
        base = '- launchApp'
        return base + '\n- waitForAnimationToEnd' if after_launch else base
    elif a == 'clearstate':
        return '- clearState'
    elif a == 'tapon':
        elem = _resolve_generic_selector(_extract_element_name(target))
        return f'- tapOn: "{elem}"' if elem else ''
    elif a == 'inputtext':
        return f'- inputText: "{value}"' if value else ''
    elif a == 'assertvisible':
        elem = _resolve_generic_selector(_extract_element_name(target or value))
        return f'- assertVisible:\n    text: "{elem}"'
    elif a == 'assertnotvisible':
        elem = _resolve_generic_selector(_extract_element_name(target or value))
        return f'- assertNotVisible:\n    text: "{elem}"'
    elif a == 'waitforanimationtoend':
        return '- waitForAnimationToEnd'
    elif a == 'extendedwaituntil':
        timeout = value or str(premises.get("global", {}).get("default_wait_timeout_ms", 10000))
        elem = _resolve_generic_selector(_extract_element_name(target))
        if not elem:
            elem = "element"
        return (
            f'- extendedWaitUntil:\n'
            f'    visible: "{elem}"\n'
            f'    timeout: {timeout}'
        )
    elif a == 'back':
        return '- back'
    elif a == 'hidekeyboard':
        return '- hideKeyboard'
    elif a == 'scroll':
        return '- scroll'
    elif a in ('swipe',):
        direction = value.upper() if value else 'UP'
        return f'- swipe:\n    direction: {direction}'
    elif a in ('wait', 'sleep'):
        return f'- extendedWaitUntil:\n    visible: ".*"\n    timeout: {value or "2000"}'
    return ''


@app.post("/api/runs")
async def start_run(request: RunAIRequest):
    import traceback
    logger.info(f"[EXECUTOR] Recebida a requisição POST /api/runs: run_id={request.run_id}, udid={request.device_udid}, steps={len(request.steps)}, engine={request.engine}")
    try:
        # --- Maestro engine branch ---
        if request.engine == "maestro":
            if not request.device_udid:
                raise HTTPException(status_code=400, detail="device_udid is required for maestro runs")

            yaml_path = request.yaml_path
            # If no yaml_path, generate YAML from steps
            if not yaml_path:
                commands = []
                app_id = "com.app.unknown"

                # First pass: find app name from launchApp step
                for s in request.steps:
                    raw = s if isinstance(s, dict) else dict(s)
                    action = raw.get("action", "").lower()
                    if action == "launchapp":
                        # target contains the app name (e.g., "Abre o app WasteZero")
                        app_hint = raw.get("target", "") or raw.get("value", "")
                        if app_hint:
                            resolved = _resolve_app_package(app_hint, request.device_udid)
                            if resolved != app_hint:
                                app_id = resolved
                            else:
                                # Try extracting app name from description
                                words = app_hint.split()
                                for w in words:
                                    if len(w) > 3 and w[0].isupper():
                                        resolved2 = _resolve_app_package(w, request.device_udid)
                                        if resolved2 != w:
                                            app_id = resolved2
                                            break
                        break

                # Second pass: generate commands
                for s in request.steps:
                    raw = s if isinstance(s, dict) else dict(s)
                    cmd = raw.get("maestro_command", "")
                    if cmd:
                        commands.append(cmd)
                    else:
                        action = raw.get("action", "")
                        target = raw.get("target", "")
                        value = raw.get("value", "")
                        generated = _action_to_maestro_command(action, target, value)
                        if generated:
                            commands.append(generated)

                logger.info(f"[MAESTRO] Resolved appId: {app_id}")

                if commands:
                    yaml_content = f"appId: {app_id}\n---\n" + "\n".join(commands)
                    yaml_path = save_yaml_flow("runs", request.run_id, yaml_content)
                    logger.info(f"[MAESTRO] Auto-generated YAML: {yaml_path}")
                else:
                    raise HTTPException(status_code=400, detail="No yaml_path and steps could not be converted to Maestro commands")

            asyncio.create_task(run_with_maestro(
                yaml_path=yaml_path,
                udid=request.device_udid,
                run_id=request.run_id,
                env_vars=request.env_vars or {},
                ws_broadcaster=ws_server,
                total_steps=len(request.steps),
                max_retries=6,
                anthropic_client=prompt_parser.client if anthropic_api_key else None,
                test_case_id=request.test_case_id,
            ))
            return {"status": "started", "run_id": request.run_id, "engine": "maestro"}

        # --- UIAutomator2 engine (unchanged) ---
        if request.platform == "web":
            executor = WebDriverExecutor(ws_server)
        else:
            if not request.device_udid:
                raise HTTPException(status_code=400, detail="device_udid is required for android runs")
            d = device_manager_instance.connect(request.device_udid)
            executor = StepExecutor(d, screenshot_handler, ws_server)


        orchestrator = RunOrchestrator(
            executor=executor,
            vision_analyzer=vision_analyzer,
            auto_corrector=auto_corrector,
            screenshot_handler=screenshot_handler,
            ws_broadcaster=ws_server,
            supabase_url=supabase_url,
            supabase_key=supabase_key
        )

        active_runs[request.run_id] = orchestrator

        # Convert raw dicts to TestStep objects for UIAutomator2
        parsed_steps = []
        for s in request.steps:
            raw = s if isinstance(s, dict) else s.model_dump() if hasattr(s, 'model_dump') else dict(s)
            try:
                parsed_steps.append(TestStep(**raw))
            except Exception as step_err:
                logger.warning(f"Skipping invalid step: {step_err}")

        test_case = TestCase(steps=parsed_steps)

        # Wrapper to update test case status after u2 execution
        async def _run_and_update_status():
            try:
                summary = await orchestrator.run(test_case, request.run_id, request.device_udid, platform=request.platform)
                if request.test_case_id:
                    from engines.maestro_runner import _update_test_case_status
                    await _update_test_case_status(request.test_case_id, summary.status)
            except Exception as e:
                logger.error(f"[EXECUTOR] Run failed: {e}")
                if request.test_case_id:
                    from engines.maestro_runner import _update_test_case_status
                    await _update_test_case_status(request.test_case_id, "failed")

        asyncio.create_task(_run_and_update_status())

        return {"status": "started", "run_id": request.run_id}

    except Exception as e:
        traceback.print_exc()
        logger.error(f"[EXECUTOR] Exception in start_run: {e}")
        log_manager.error(f"start_run failed: {e}", context="EXECUTOR", run_id=request.run_id)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/runs/vision")
async def start_vision_run(
    run_id: str = Form(...),
    steps: str = Form(...),
    device_udid: str = Form(...),
    platform: str = Form("android"),
    image_step_mapping: Optional[str] = Form(None),
    reference_images: List[UploadFile] = File(...)
):
    """Start a test run with vision-first flow using reference images."""
    import traceback
    import json as json_mod
    logger.info(f"[VISION] Recebida requisição POST /api/runs/vision: run_id={run_id}, udid={device_udid}, images={len(reference_images)}")
    try:
        # Parse steps JSON
        steps_data = json_mod.loads(steps)
        parsed_steps = [TestStep(**s) for s in steps_data]

        # Read reference images into memory
        image_bytes_list: List[bytes] = []
        for img_file in reference_images:
            img_data = await img_file.read()
            image_bytes_list.append(img_data)

        # Parse optional mapping
        mapping = None
        if image_step_mapping:
            mapping = json_mod.loads(image_step_mapping)

        # Create executor
        if platform == "web":
            executor = WebDriverExecutor(ws_server)
        else:
            if not device_udid:
                raise HTTPException(status_code=400, detail="device_udid is required for android runs")
            d = device_manager_instance.connect(device_udid)
            executor = StepExecutor(d, screenshot_handler, ws_server)

        orchestrator = RunOrchestrator(
            executor=executor,
            vision_analyzer=vision_analyzer,
            auto_corrector=auto_corrector,
            screenshot_handler=screenshot_handler,
            ws_broadcaster=ws_server,
            supabase_url=supabase_url,
            supabase_key=supabase_key
        )

        # Set vision-first state
        orchestrator._reference_images = image_bytes_list
        orchestrator._image_step_mapping = mapping

        active_runs[run_id] = orchestrator

        test_case = TestCase(steps=parsed_steps)
        asyncio.create_task(orchestrator.run(test_case, run_id, device_udid, platform=platform))

        return {"status": "started", "run_id": run_id}

    except Exception as e:
        traceback.print_exc()
        logger.error(f"[VISION] Exception in start_vision_run: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class AmbiguityResolution(BaseModel):
    step_num: int
    x: int
    y: int

@app.post("/api/runs/{run_id}/resolve-ambiguity")
async def resolve_ambiguity(run_id: str, resolution: AmbiguityResolution):
    """Resolve an ambiguous element during vision-first execution."""
    if run_id not in active_runs:
        raise HTTPException(status_code=404, detail="Run not found")
    orchestrator = active_runs[run_id]
    await orchestrator.resolve_ambiguity(resolution.step_num, resolution.x, resolution.y)
    return {"status": "resolved"}

@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    if run_id in active_runs:
        await active_runs[run_id].cancel()
        return {"status": "cancelling"}
    return {"status": "not_found"}

class RecordingStartRequest(BaseModel):
    udid: str
    project_id: Optional[str] = None

@app.post("/recordings/start")
async def start_recording(req: RecordingStartRequest):
    """Start recording via ADB getevent. Returns recording_id for SSE subscription."""
    try:
        recorder = InteractionRecorder(ws_server)
        recording_id = await recorder.start_recording(req.udid, project_id=req.project_id)
        active_recorders[req.udid] = recorder
        return {"status": "recording_started", "udid": req.udid, "recording_id": recording_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RecordingStopRequest(BaseModel):
    udid: str

@app.post("/recordings/stop")
async def stop_recording(req: RecordingStopRequest):
    recorder = active_recorders.get(req.udid)
    if not recorder:
        raise HTTPException(status_code=404, detail="No active recording for this device")
    steps = await recorder.stop_recording()
    active_recorders.pop(req.udid, None)
    return {"status": "recording_stopped", "steps": steps}

class EnrichAndRecordRequest(BaseModel):
    udid: str
    x: int
    y: int
    action: str = "tap"
    stream_width: Optional[int] = None
    stream_height: Optional[int] = None
    project_id: Optional[str] = None

@app.post("/recordings/enrich-and-record")
async def enrich_and_record(req: EnrichAndRecordRequest):
    """
    Called by frontend when user taps on DevicePreview.
    Scales stream coords → physical, does u2 dump, stores + broadcasts step via SSE.
    Fire-and-forget from frontend perspective — result arrives via SSE.
    """
    recorder = active_recorders.get(req.udid)
    if not recorder:
        raise HTTPException(status_code=404, detail="No active recording for this device")
    asyncio.create_task(recorder.handle_frontend_tap(
        req.x, req.y, req.stream_width, req.stream_height
    ))
    return {"status": "ok"}

class ConfirmInputRequest(BaseModel):
    udid: str
    step_index: int
    text: str

@app.post("/recordings/confirm-input")
async def confirm_input(req: ConfirmInputRequest):
    """Resolve a pending inputText step with the actual typed text."""
    recorder = active_recorders.get(req.udid)
    if not recorder:
        raise HTTPException(status_code=404, detail="No active recording for this device")
    updated = await recorder.confirm_input(req.step_index, req.text)
    return {"status": "ok", "step": updated}

@app.get("/recordings/events")
async def recording_events(udid: str):
    """SSE stream — sends recording steps as they are captured in real time."""
    import json as _json

    recorder = active_recorders.get(udid)
    if not recorder:
        raise HTTPException(status_code=404, detail="No active recording for this device")

    q = recorder.subscribe_sse()

    async def event_generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield "event: ping\ndata: {}\n\n"
                    continue

                if data.get("__done__"):
                    yield f"event: done\ndata: {{}}\n\n"
                    break

                yield f"event: step\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"
        finally:
            recorder.unsubscribe_sse(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

class SaveTestRequest(BaseModel):
    name: str
    description: str = ""
    steps: list = []
    project_id: Optional[str] = None
    tags: list = ["recorded"]

LOCAL_TESTS_DIR = Path(__file__).parent.parent.parent / "data" / "test_cases"
LOCAL_TESTS_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/api/tests/save")
async def save_test(req: SaveTestRequest):
    """Save test — always saves locally, tries Supabase as bonus."""
    import json as json_mod
    import uuid as uuid_mod
    from datetime import datetime

    test_id = str(uuid_mod.uuid4())
    body: dict = {
        "id": test_id,
        "name": req.name,
        "description": req.description,
        "steps": req.steps,
        "tags": req.tags,
        "project_id": req.project_id,
        "is_active": True,
        "version": 1,
        "created_at": datetime.utcnow().isoformat(),
    }

    # Always save locally (guaranteed to work)
    local_file = LOCAL_TESTS_DIR / f"{test_id}.json"
    local_file.write_text(json_mod.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Test saved locally: {local_file}")

    # Try Supabase (priority)
    supabase_ok = False
    if supabase_url and supabase_service_key:
        try:
            headers = {
                "apikey": supabase_service_key,
                "Authorization": f"Bearer {supabase_service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }
            # Send full body to Supabase
            supabase_body = {
                "name": req.name,
                "description": req.description,
                "steps": req.steps,
                "tags": req.tags,
                "is_active": True,
                "version": 1,
            }
            if req.project_id:
                supabase_body["project_id"] = req.project_id

            async with httpx.AsyncClient(verify=False) as client:
                resp = await client.post(
                    f"{supabase_url}/rest/v1/test_cases",
                    headers=headers,
                    json=supabase_body,
                    timeout=10,
                )
            if resp.status_code in (200, 201):
                data = resp.json()
                supabase_ok = True
                saved = data[0] if isinstance(data, list) and data else data
                body["id"] = saved.get("id", test_id)
                logger.info(f"Test saved to Supabase: {body['id']}")
            else:
                logger.warning(f"Supabase insert failed ({resp.status_code}): {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Supabase save failed: {e}")

    save_run_id = f"save_{test_id[:12]}"
    log_manager.execution("═══════════════════════════════════════", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Teste salvo: {req.name}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] ID: {body['id']}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Projeto: {req.project_id or 'sem projeto'}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Descrição: {req.description or '(sem descrição)'}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Tags: {req.tags}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Passos: {len(req.steps)}", run_id=save_run_id)
    for i, step in enumerate(req.steps, 1):
        action = step.get("action", step.get("type", "?")) if isinstance(step, dict) else str(step)
        target = step.get("target", step.get("selector", step.get("value", ""))) if isinstance(step, dict) else ""
        log_manager.execution(f"[SAVE]   Passo {i:>2}: {action}" + (f" → {target}" if target else ""), run_id=save_run_id)
    log_manager.execution(f"[SAVE] Arquivo local: {local_file}", run_id=save_run_id)
    log_manager.execution(f"[SAVE] Supabase: {'✓ sincronizado' if supabase_ok else '✗ apenas local'}", run_id=save_run_id)
    log_manager.execution("═══════════════════════════════════════", run_id=save_run_id)
    return {"status": "saved", "test": body}


@app.delete("/api/tests/{test_id}")
async def delete_test(test_id: str):
    """Delete test — removes from local disk and tries Supabase."""
    import json as json_mod

    # Delete local file
    for f in LOCAL_TESTS_DIR.glob("*.json"):
        try:
            data = json_mod.loads(f.read_text(encoding="utf-8"))
            if data.get("id") == test_id:
                f.unlink()
                logger.info(f"Test deleted locally: {f}")
                break
        except Exception:
            pass

    # Try Supabase
    if supabase_url and supabase_service_key:
        try:
            headers = {
                "apikey": supabase_service_key,
                "Authorization": f"Bearer {supabase_service_key}",
            }
            async with httpx.AsyncClient(verify=False) as client:
                await client.delete(
                    f"{supabase_url}/rest/v1/test_cases?id=eq.{test_id}",
                    headers=headers,
                    timeout=10,
                )
        except Exception as e:
            logger.warning(f"Supabase delete failed: {e}")

    return {"status": "deleted", "test_id": test_id}


@app.get("/api/tests")
async def list_tests(project_id: Optional[str] = None):
    """List saved tests — from Supabase + local fallback."""
    import json as json_mod

    tests = []

    # Try Supabase first
    if supabase_url and supabase_service_key:
        try:
            headers = {
                "apikey": supabase_service_key,
                "Authorization": f"Bearer {supabase_service_key}",
            }
            url = f"{supabase_url}/rest/v1/test_cases?select=*&order=created_at.desc"
            if project_id:
                url += f"&project_id=eq.{project_id}"

            async with httpx.AsyncClient(verify=False) as client:
                resp = await client.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                tests = resp.json()
        except Exception as e:
            logger.warning(f"Supabase list failed: {e}")

    # Merge with local tests
    local_ids = {t["id"] for t in tests}
    for f in LOCAL_TESTS_DIR.glob("*.json"):
        try:
            data = json_mod.loads(f.read_text(encoding="utf-8"))
            if data.get("id") not in local_ids:
                if project_id and data.get("project_id") != project_id:
                    continue
                tests.append(data)
        except Exception:
            pass

    # Sort by created_at desc
    tests.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return {"tests": tests}


class MaestroYamlRequest(BaseModel):
    yaml_content: str
    project_id: str = "default"
    test_name: str = "flow"

class ConvertRecordingRequest(BaseModel):
    recorded_events: list
    width: int = 1080
    height: int = 2400
    model: str = "claude-sonnet-4-6"

@app.post("/api/maestro/convert-recording")
async def convert_recording_to_maestro(req: ConvertRecordingRequest):
    """Convert recorded interactions to Maestro YAML via Claude."""
    try:
        result = await prompt_parser.convert_recording_to_maestro(
            recorded_events=req.recorded_events,
            width=req.width,
            height=req.height,
            model=req.model,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/maestro/validate-yaml")
async def validate_yaml(req: MaestroYamlRequest):
    """Validate Maestro YAML syntax."""
    valid, message = validate_maestro_yaml(req.yaml_content)
    return {"valid": valid, "message": message}

@app.post("/api/maestro/save-yaml")
async def save_maestro_yaml(req: MaestroYamlRequest):
    """Validate and save a Maestro YAML flow to disk."""
    valid, message = validate_maestro_yaml(req.yaml_content)
    if not valid:
        raise HTTPException(status_code=400, detail=f"YAML invalido: {message}")

    file_path = save_yaml_flow(req.project_id, req.test_name, req.yaml_content)
    return {"status": "saved", "path": file_path}

# ─── Reference Screenshots ────────────────────────────────────────────────────

_VISUAL_REFS_BASE = Path(__file__).parent / "data" / "visual_refs"

@app.post("/api/projects/{project_id}/reference-screenshots")
async def upload_reference_screenshots(
    project_id: str,
    files: List[UploadFile] = File(...)
):
    """Upload reference screenshots for a project, persisted to disk."""
    save_dir = _VISUAL_REFS_BASE / project_id
    save_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for upload in files:
        safe_name = Path(upload.filename or "ref.jpg").name.replace("..", "_")
        dest = save_dir / safe_name
        if dest.exists():
            stem, suf = dest.stem, dest.suffix
            import time as _time
            dest = save_dir / f"{stem}-{int(_time.time() * 1000)}{suf}"
        data = await upload.read()
        dest.write_bytes(data)
        saved.append(dest.name)

    return {"saved": saved}

@app.get("/api/projects/{project_id}/reference-screenshots")
async def list_reference_screenshots(project_id: str):
    """List reference screenshots for a project."""
    save_dir = _VISUAL_REFS_BASE / project_id
    if not save_dir.exists():
        return {"images": []}
    images = []
    for f in sorted(save_dir.iterdir()):
        if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            images.append({
                "filename": f.name,
                "url": f"/api/projects/{project_id}/reference-screenshots/{f.name}",
            })
    return {"images": images}

@app.delete("/api/projects/{project_id}/reference-screenshots/{filename}")
async def delete_reference_screenshot(project_id: str, filename: str):
    """Delete a reference screenshot."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    save_dir = _VISUAL_REFS_BASE / project_id
    file_path = save_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.resolve().relative_to(save_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    file_path.unlink()
    return {"status": "deleted"}

@app.get("/api/projects/{project_id}/reference-screenshots/{filename}")
async def serve_reference_screenshot(project_id: str, filename: str):
    """Serve a reference screenshot file."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    save_dir = _VISUAL_REFS_BASE / project_id
    file_path = save_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_path.resolve().relative_to(save_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    mt = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return Response(
        content=file_path.read_bytes(),
        media_type=mt.get(file_path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=3600"},
    )

# ─── Maestro Studio ──────────────────────────────────────────────────────────

class MaestroStudioRequest(BaseModel):
    udid: Optional[str] = None

@app.post("/api/maestro/studio")
async def start_maestro_studio(req: MaestroStudioRequest):
    """Start Maestro Studio. Restarts ADB to release UiAutomation lock."""
    from routes.engines import get_maestro_binary
    maestro_bin = get_maestro_binary()
    try:
        subprocess.run(["adb", "kill-server"], capture_output=True, timeout=5)
        await asyncio.sleep(1)
        subprocess.run(["adb", "start-server"], capture_output=True, timeout=10)
        await asyncio.sleep(1)
    except Exception as e:
        logger.warning(f"[STUDIO] ADB restart failed: {e}")
    env = os.environ.copy()
    if req.udid:
        env["ANDROID_SERIAL"] = req.udid
    try:
        proc = subprocess.Popen(
            [maestro_bin, "studio"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "started", "pid": proc.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao iniciar Maestro Studio: {e}")

# ─── Element Scanner (Ler Aplicacao) ─────────────────────────────────────────

from android.element_scanner import scanner_instance, load_element_map, _get_foreground_activity, _get_foreground_package

class ScanRequest(BaseModel):
    udid: str
    project_id: str
    project_name: Optional[str] = None  # Human-readable name for file naming
    mode: str = "auto"
    app_package: Optional[str] = None  # Lock scan to specific app

@app.get("/api/devices/{udid}/foreground-app")
async def get_foreground_app(udid: str):
    """Detect the current foreground app package via ADB."""
    try:
        activity = await _get_foreground_activity(udid)
        package = await _get_foreground_package(udid)
        label = package.split('.')[-1] if package else "Unknown"
        return {"package": package, "activity": activity, "label": label}
    except Exception as e:
        return {"package": None, "activity": None, "label": None, "error": str(e)}

@app.post("/api/scanner/start")
async def start_element_scan(req: ScanRequest):
    """Start scanning UI elements while the user navigates the app."""
    if scanner_instance.is_running:
        return {"status": "already_running", **scanner_instance.stats}
    await scanner_instance.start(req.udid, req.project_id, mode=req.mode, app_package=req.app_package, project_name=req.project_name or "")
    return {"status": "started", **scanner_instance.stats}

@app.post("/api/scanner/dump")
async def scanner_dump_now():
    """Trigger an on-demand hierarchy dump (for on_click mode or manual capture)."""
    if not scanner_instance.is_running:
        return {"status": "not_running"}
    stats = await scanner_instance.dump_now()
    return {"status": "captured", **stats}

@app.post("/api/scanner/stop")
async def stop_element_scan():
    """Stop scanning and save the element map."""
    if not scanner_instance.is_running:
        return {"status": "not_running"}
    element_map = await scanner_instance.stop()
    return {"status": "stopped", "element_map": element_map}

@app.get("/api/scanner/status")
async def scanner_status():
    """Get current scanner status and stats."""
    return scanner_instance.stats

@app.get("/api/projects/{project_id}/element-map")
async def get_element_map(project_id: str):
    """Get the saved element map for a project."""
    element_map = load_element_map(project_id)
    if not element_map:
        raise HTTPException(status_code=404, detail="Element map not found. Run 'Ler Aplicacao' first.")
    return element_map

@app.post("/screenshot/{udid}")
async def capture_screenshot(udid: str):
    try:
        d = device_manager_instance.connect(udid)
        url = await screenshot_handler.capture_and_upload(d, "manual", 0, "live")
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- WebSocket ---

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await ws_server.connect(client_id, websocket)
    try:
        while True:
            # We are mostly broadcasting, but we can receive pings or commands here
            data = await websocket.receive_text()
            logger.info(f"Received from {client_id}: {data}")
    except WebSocketDisconnect:
        ws_server.disconnect(client_id)

# --- Log Endpoints ---

@app.get("/api/logs")
async def list_logs(category: Optional[str] = None):
    """List all log files, optionally filtered by category."""
    return {"logs": log_manager.list_logs(category)}

@app.get("/api/logs/read")
async def read_log(path: str, offset: int = 0, limit: int = 1000):
    """Read log file contents with pagination."""
    return log_manager.read_log(path, offset, limit)

@app.get("/api/logs/download")
async def download_log(path: str):
    """Download a log file."""
    from log_manager import LOGS_BASE
    filepath = LOGS_BASE / path
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        filepath.resolve().relative_to(LOGS_BASE.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    media_type = "application/gzip" if filepath.suffix == ".gz" else "text/plain"
    return Response(
        content=filepath.read_bytes(),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filepath.name}"}
    )

@app.get("/api/logs/error-count")
async def error_count():
    """Get today's error count for the sidebar badge."""
    return {"count": log_manager.get_error_count_today()}

class SessionLogEntry(BaseModel):
    level: str = "INFO"
    message: str
    session_id: str = "default"

@app.post("/api/logs/session")
async def receive_session_log(entry: SessionLogEntry):
    """Receive session log entries from the frontend."""
    log_manager.session(entry.message, session_id=entry.session_id, level=entry.level)
    return {"status": "ok"}

class SessionLogBatch(BaseModel):
    entries: List[SessionLogEntry]

@app.post("/api/logs/session/batch")
async def receive_session_log_batch(batch: SessionLogBatch):
    """Receive multiple session log entries from the frontend."""
    for entry in batch.entries:
        log_manager.session(entry.message, session_id=entry.session_id, level=entry.level)
    return {"status": "ok", "count": len(batch.entries)}

# ── Maestro Studio process management ────────────────────────────────────────

import signal as _signal

_maestro_studio_process: Optional[subprocess.Popen] = None
# The Maestro Studio Electron app's Java backend always uses port 5050
MAESTRO_STUDIO_PORT: int = 5050


async def _maestro_studio_ping() -> bool:
    """Return True if Maestro Studio Java backend is responding on port 5050."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"http://localhost:{MAESTRO_STUDIO_PORT}/", timeout=2.0)
            return r.status_code < 500
    except Exception:
        return False


# ── Embedded Maestro Studio server (for Orchestra-based flow execution) ──────
#
# The bundle's "Run Test" path needs Orchestra semantics — holding one Maestro
# session open and running flows through it — otherwise each Run spawns a fresh
# `maestro test` subprocess, does JVM cold start + ADB forwarder allocation,
# and intermittently fails with `TcpForwarder.waitFor` TimeoutException.
#
# We launch `maestro --device UDID studio --no-window` once (per UDID), parse
# the port from its stdout, and proxy runCommand / runFlowFile to
# http://localhost:<port>/api/run-command.

_mss_embedded_process: Optional[subprocess.Popen] = None
_mss_embedded_port: int = 0
_mss_embedded_udid: str = ""
_mss_embedded_lock = asyncio.Lock()

# When a Maestro command is executing, pause ADB-heavy loops (screencap/dump)
# to avoid contention. Single-device ADB can only sustain one heavy operation at
# a time; without this gate, maestro's internal UI-hierarchy reads block waiting
# for our screencap to release, and the command eventually times out.
_adb_command_active = asyncio.Event()
_adb_command_active.clear()


async def _cleanup_maestro_state(udid: str) -> None:
    """Force-stop the Maestro driver APK and clear stale ADB forwards so the
    next `maestro studio` launch gets a clean AndroidDriver.allocateForwarder.

    Without this, stale forwards from a previous Maestro run (which exit via
    Ctrl-C / subprocess kill and leave the forward entries behind) cause
    `dadb.forwarding.TcpForwarder.waitFor` to TimeoutException."""
    commands = [
        ["adb", "-s", udid, "shell", "am", "force-stop", "dev.mobile.maestro"],
        ["adb", "-s", udid, "shell", "am", "force-stop", "dev.mobile.maestro.test"],
        ["adb", "-s", udid, "forward", "--remove-all"],
    ]
    for cmd in commands:
        try:
            p = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(p.wait(), timeout=5)
        except Exception as e:
            logger.debug(f"cleanup cmd {cmd[-2:]} failed: {e}")


async def _probe_maestro_studio_port(port: int) -> bool:
    """Return True if a Maestro Studio server is already serving on this port."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"http://localhost:{port}/")
            return r.status_code < 500
    except Exception:
        return False


async def _adopt_existing_maestro_studio() -> Optional[int]:
    """If a previous daemon run left an orphan `maestro studio` process alive,
    adopt it instead of spawning a new one (which would fail because the device
    driver is held). We validate the instance with a dry-run command first —
    orphan processes whose Maestro session has gone stale return 400 on every
    subsequent command, so we kill them and let the caller spawn fresh."""
    for port in (9999, 10000, 10001, 10002, 10003):
        if not await _probe_maestro_studio_port(port):
            continue
        # Verify it's actually Maestro Studio (not another service)
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"http://localhost:{port}/")
                if "maestro" not in r.text.lower() and "Maestro Studio" not in r.text:
                    continue
        except Exception:
            continue

        # Validate the instance with a dry-run command — a stale session would
        # 400 here with "Command execution failed".
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                v = await client.post(
                    f"http://localhost:{port}/api/run-command",
                    json={"yaml": "pressKey: BACK", "dryRun": True},
                    headers={"Content-Type": "application/json"},
                )
            if v.status_code < 400:
                return port
            logger.warning(f"Adopted candidate on port {port} failed dry-run ({v.status_code}), killing orphan")
        except Exception as e:
            logger.warning(f"Adopt validation error on port {port}: {e}")

        # Instance on this port is unusable — kill the orphan process holding it
        try:
            p = await asyncio.create_subprocess_exec(
                "lsof", "-ti", f":{port}",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            pids, _ = await asyncio.wait_for(p.communicate(), timeout=3)
            for pid in pids.decode().split():
                try:
                    os.kill(int(pid), _signal.SIGTERM)
                except Exception:
                    pass
            await asyncio.sleep(1)
        except Exception as e:
            logger.debug(f"Failed to kill orphan on port {port}: {e}")
    return None


async def _ensure_embedded_maestro_studio(udid: str) -> Optional[int]:
    """Start `maestro studio --no-window` as a subprocess if not already up for
    this UDID. Returns the port, or None if we can't start it."""
    global _mss_embedded_process, _mss_embedded_port, _mss_embedded_udid

    async with _mss_embedded_lock:
        # Already tracked and alive for this UDID?
        if (_mss_embedded_process
                and _mss_embedded_process.poll() is None
                and _mss_embedded_udid == udid
                and _mss_embedded_port):
            return _mss_embedded_port

        # Daemon was restarted? Adopt the orphan subprocess from the previous run
        # instead of killing it and spawning a new one (which would hit
        # TcpForwarder TimeoutException because the device driver is still held).
        if not _mss_embedded_process:
            adopted = await _adopt_existing_maestro_studio()
            if adopted:
                _mss_embedded_port = adopted
                _mss_embedded_udid = udid
                logger.info(f"Adopted existing maestro studio at http://localhost:{adopted}")
                return adopted

        # Different UDID or dead — shut down any stale instance
        if _mss_embedded_process and _mss_embedded_process.poll() is None:
            try:
                _mss_embedded_process.terminate()
                _mss_embedded_process.wait(timeout=3)
            except Exception:
                try: _mss_embedded_process.kill()
                except Exception: pass
        _mss_embedded_process = None
        _mss_embedded_port = 0

        # Clean slate on device before launching — kills stale forwards and driver
        await _cleanup_maestro_state(udid)

        import shutil as _shutil
        maestro_bin = _shutil.which("maestro") or os.path.expanduser("~/.maestro/bin/maestro")
        if not os.path.exists(maestro_bin):
            logger.warning("maestro binary not found; flow execution will fall back to `maestro test` subprocess")
            return None

        try:
            proc = subprocess.Popen(
                [maestro_bin, "--device", udid, "studio", "--no-window"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,  # line-buffered so we can scan stdout live
                env={**os.environ},
            )
        except Exception as e:
            logger.error(f"Failed to start embedded maestro studio: {e}")
            return None

        # Scan stdout lines for `http://localhost:<port>` (Maestro Studio picks a
        # free port at random and prints it on startup). Timeout ~60s to cover
        # the JVM cold start / Maestro driver APK install on first run.
        port_re = _re.compile(r"http://localhost:(\d+)")
        loop = asyncio.get_event_loop()

        async def _read_port() -> Optional[int]:
            def _readline() -> str:
                return proc.stdout.readline() if proc.stdout else ""
            for _ in range(600):  # ~60s worst case
                line = await loop.run_in_executor(None, _readline)
                if not line:
                    if proc.poll() is not None:
                        return None  # process died
                    continue
                logger.info(f"[maestro-studio] {line.rstrip()}")
                m = port_re.search(line)
                if m:
                    return int(m.group(1))
            return None

        try:
            port = await asyncio.wait_for(_read_port(), timeout=90)
        except asyncio.TimeoutError:
            port = None

        if not port:
            logger.error("Embedded maestro studio did not announce a port within 90s")
            try: proc.terminate()
            except Exception: pass
            return None

        # Drain remaining stdout in background so the pipe buffer never blocks
        def _drain():
            try:
                for line in iter(proc.stdout.readline, ""):
                    if line:
                        logger.debug(f"[maestro-studio] {line.rstrip()}")
            except Exception:
                pass
        import threading
        threading.Thread(target=_drain, daemon=True).start()

        # Health-check the endpoint
        for _ in range(30):
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    r = await client.get(f"http://localhost:{port}/")
                    if r.status_code < 500:
                        break
            except Exception:
                await asyncio.sleep(0.5)

        _mss_embedded_process = proc
        _mss_embedded_port = port
        _mss_embedded_udid = udid
        logger.info(f"Embedded maestro studio ready at http://localhost:{port} (udid={udid})")
        return port


def _strip_flow_header(yaml_content: str) -> str:
    """The Maestro Studio OSS `/api/run-command` expects the command list only —
    it rejects the `appId: ... ---` flow header with `appId is not a valid command`.
    The app identity is bound to the Maestro session at launch time
    (`maestro --device UDID studio`), so the header is redundant anyway."""
    s = yaml_content.lstrip()
    if "---" in s:
        head, _, rest = s.partition("---")
        # Only strip when the head is the appId/flow config block
        if "appId" in head or not head.strip():
            return rest.lstrip("\n")
    return s


def _extract_app_id_from_header(full_yaml: str) -> Optional[str]:
    """Pull `appId: com.example` out of the flow header (before `---`)."""
    head = full_yaml.split("---", 1)[0] if "---" in full_yaml else ""
    m = _re.search(r"appId\s*:\s*['\"]?([A-Za-z0-9_.]+)['\"]?", head)
    return m.group(1) if m else None


async def _adb_capture(udid: str, *args: str, timeout: float = 10.0) -> str:
    """Run `adb -s UDID shell ARGS...` and return stdout text."""
    try:
        p = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(p.communicate(), timeout=timeout)
        return out.decode("utf-8", errors="replace")
    except Exception:
        return ""


async def _resolve_launch(udid: str, app_id: str) -> tuple[Optional[int], Optional[str]]:
    """Return (userId, 'pkg/activity') for the given app, probing all users on
    the device. Xiaomi devices commonly sideload into user 10 (work profile)
    rather than user 0, so `monkey -p pkg` fails with 'No activities found'
    unless we pass --user <N>."""
    users_out = await _adb_capture(udid, "pm", "list", "users", timeout=5)
    users = []
    for line in users_out.splitlines():
        m = _re.search(r"UserInfo\{(\d+):[^}]*\}\s+running", line)
        if m:
            users.append(int(m.group(1)))
    if not users:
        users = [0]
    # Probe user 0 first, then any others
    ordered = [0] + [u for u in users if u != 0]
    for uid in ordered:
        out = await _adb_capture(udid, "cmd", "package", "resolve-activity",
                                  "--brief", "--user", str(uid), app_id, timeout=5)
        for line in out.splitlines():
            line = line.strip()
            if "/" in line and " " not in line and line != "No activity found":
                return uid, line
    return None, None


async def _adb_launch_app(udid: str, app_id: str, clear_state: bool = False) -> tuple[bool, str]:
    """Launch an Android app via ADB, bypassing Maestro's broken launchApp.

    Xiaomi-aware: resolves the correct user profile (app may be in work
    profile u10 rather than u0) and uses `am start --user` to target it."""
    uid, component = await _resolve_launch(udid, app_id)
    if uid is None or not component:
        return False, f"No launch activity resolved for {app_id}"

    if clear_state:
        p = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "pm", "clear", "--user", str(uid), app_id,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(p.wait(), timeout=10)
        except Exception:
            pass

    p = await asyncio.create_subprocess_exec(
        "adb", "-s", udid, "shell", "am", "start", "--user", str(uid), "-n", component,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(p.communicate(), timeout=10)
        if p.returncode == 0:
            # Give the activity a moment to foreground before the next command
            await asyncio.sleep(1.5)
            return True, ""
        return False, (stderr.decode(errors="replace")[:200] if stderr else f"am start rc={p.returncode}")
    except Exception as e:
        return False, str(e)


def _split_flow_into_commands(yaml_body: str) -> list[dict]:
    """Parse a Maestro flow YAML (list of commands) and return a list of dicts
    describing each step:
      { kind: "launchApp", appId: "...", clearState: bool }   — handled via ADB
      { kind: "yaml", yaml: "..." }                           — sent to /api/run-command
    Splits launchApp out of the Maestro path because the embedded Orchestra
    reliably fails on it; ADB `monkey` works instead.
    """
    import yaml as _yaml
    try:
        parsed = _yaml.safe_load(yaml_body)
    except Exception as e:
        logger.error(f"flow YAML parse failed: {e}")
        return []
    if not isinstance(parsed, list):
        return [{"kind": "yaml", "yaml": yaml_body.strip()}]

    out: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict) or len(item) != 1:
            continue
        (key, value), = item.items()
        if key == "launchApp":
            app_id = None
            clear_state = False
            if isinstance(value, str):
                app_id = value
            elif isinstance(value, dict):
                app_id = value.get("appId")
                clear_state = bool(value.get("clearState"))
            out.append({"kind": "launchApp", "appId": app_id, "clearState": clear_state})
        else:
            out.append({"kind": "yaml", "yaml": _yaml.safe_dump(item, default_flow_style=False, sort_keys=False).strip()})
    return out


async def _wake_and_unlock_device(udid: str) -> None:
    """Ensure the device screen is on and unlocked before running a flow.
    Without this, any command that reads the UI hierarchy (tapOn, assertVisible,
    etc.) times out after ~17s because uiautomator can't read AOD/lock screen."""
    try:
        # Wake up
        await _adb_shell(udid, "input", "keyevent", "KEYCODE_WAKEUP", timeout=2)
        # Dismiss keyguard / swipe up to unlock (no-op if already unlocked)
        await _adb_shell(udid, "wm", "dismiss-keyguard", timeout=2)
    except Exception as e:
        logger.debug(f"wake/unlock best-effort failed: {e}")


async def _embedded_run_yaml(udid: str, yaml_content: str, dry_run: bool = False) -> tuple[bool, str]:
    """Run a YAML flow through the embedded maestro studio server.
    Returns (success, error_message). error_message is empty on success.

    The Maestro OSS server's `/api/run-command` accepts ONE command per call, so
    we split the flow and submit each command sequentially. The Maestro session
    stays warm across calls, so this is still much faster than spawning a full
    `maestro test` per Run Test click."""
    port = await _ensure_embedded_maestro_studio(udid)
    if not port:
        return False, ("Maestro Studio subprocess failed to start. Check daemon logs for "
                       "the real stack trace (look for 'TimeoutException'). Common fixes: "
                       "close the Maestro Studio desktop app, run `adb kill-server && adb start-server`.")

    # Ensure screen is awake — commands that read UI hierarchy silently
    # time out after 17s when the device is in AOD / locked state.
    if not dry_run:
        await _wake_and_unlock_device(udid)

    default_app_id = _extract_app_id_from_header(yaml_content)
    body = _strip_flow_header(yaml_content)
    steps = _split_flow_into_commands(body)
    if not steps:
        return False, "Flow contained no executable commands"

    # Pause ADB-heavy loops (deviceScreen SSE screencap + uiautomator dump)
    # while maestro issues its own hierarchy/input commands — single-device ADB
    # can't sustain both cleanly and the command times out under contention.
    _adb_command_active.set()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            for idx, step in enumerate(steps):
                if step["kind"] == "launchApp":
                    app_id = step.get("appId") or default_app_id
                    if not app_id:
                        return False, f"Step {idx+1} (launchApp) is missing appId"
                    if dry_run:
                        continue
                    ok, err = await _adb_launch_app(udid, app_id, step.get("clearState", False))
                    if not ok:
                        logger.error(f"ADB launchApp failed on step {idx+1}: {err}")
                        return False, f"Step {idx+1} (launchApp {app_id}) failed: {err}"
                    continue

                cmd_yaml = step["yaml"]
                r = await client.post(
                    f"http://localhost:{port}/api/run-command",
                    json={"yaml": cmd_yaml, "dryRun": dry_run},
                    headers={"Content-Type": "application/json"},
                )
                if r.status_code >= 400:
                    err = r.text or f"HTTP {r.status_code}"
                    logger.error(f"embedded run-command {r.status_code} on step {idx+1}/{len(steps)}: {err[:500]}\n---CMD---\n{cmd_yaml}\n---")
                    return False, f"Step {idx+1} failed: {err[:400]}"
        return True, ""
    except Exception as e:
        import traceback as _tb
        logger.error(f"embedded run-command exception: {type(e).__name__}: {e}\n{_tb.format_exc()}")
        return False, f"{type(e).__name__}: {e}"
    finally:
        _adb_command_active.clear()


@app.post("/api/maestro-studio/start")
async def start_maestro_studio():
    """Launch the Maestro Studio desktop app if not already running.

    The Electron app exposes its Java backend on port 5050 with CORS: *.
    We just open the app and return; the frontend polls /status until ready.
    """
    # Already running?
    if await _maestro_studio_ping():
        return {"running": True, "port": MAESTRO_STUDIO_PORT, "already_running": True}

    # Check if the app is installed
    app_path = "/Applications/Maestro Studio.app"
    if not os.path.isdir(app_path):
        raise HTTPException(
            status_code=503,
            detail="Maestro Studio não está instalado. Baixe em: https://maestro.dev",
        )

    # Launch via macOS open command (non-blocking)
    try:
        subprocess.Popen(
            ["open", "-a", "Maestro Studio"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        logger.info("Maestro Studio app launched via 'open'")
        return {"started": True, "port": MAESTRO_STUDIO_PORT}
    except Exception as e:
        logger.error(f"Failed to open Maestro Studio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/maestro-studio/status")
async def maestro_studio_status():
    """Check whether Maestro Studio Java backend is reachable on port 5050."""
    running = await _maestro_studio_ping()
    return {"running": running, "port": MAESTRO_STUDIO_PORT}


@app.post("/api/maestro-studio/stop")
async def stop_maestro_studio():
    """Quit the Maestro Studio desktop app."""
    try:
        subprocess.run(
            ["osascript", "-e", 'quit app "Maestro Studio"'],
            capture_output=True,
            timeout=5,
        )
        logger.info("Maestro Studio quit via osascript")
    except Exception as e:
        logger.warning(f"Could not quit Maestro Studio: {e}")
    return {"stopped": True}


# ── Maestro Studio HTTP proxy ─────────────────────────────────────────────────
# Proxies all Maestro Studio traffic through the daemon so the Next.js app
# can load the Studio UI without hitting cross-origin restrictions.

from fastapi import Request as FastAPIRequest
from fastapi.responses import StreamingResponse as FastStreamingResponse


@app.api_route(
    "/api/maestro-studio/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
async def proxy_maestro_studio(path: str, request: FastAPIRequest):
    """Transparent reverse-proxy to Maestro Studio."""
    target_url = f"http://localhost:{MAESTRO_STUDIO_PORT}/{path}"
    query = request.url.query
    if query:
        target_url += f"?{query}"

    headers = dict(request.headers)
    # Strip hop-by-hop headers
    for h in ("host", "connection", "transfer-encoding"):
        headers.pop(h, None)

    body = await request.body()

    # SSE pass-through
    is_sse = "text/event-stream" in request.headers.get("accept", "")

    async def _stream_proxy():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                request.method,
                target_url,
                headers=headers,
                content=body,
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    if is_sse:
        return FastStreamingResponse(
            _stream_proxy(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(
                request.method,
                target_url,
                headers=headers,
                content=body,
            )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Maestro Studio not reachable")


# ── Maestro Studio Embedded API (/mss/*) ──────────────────────────────────────
#
# The extracted Maestro Studio frontend (public/maestro-studio/) has been
# patched to call http://localhost:8001/mss instead of http://localhost:5050.
# These endpoints provide a compatible API so the Studio UI works without
# the Maestro Studio desktop app installed.

_mss_screenshots: dict = {}   # {uuid_str: jpeg_bytes}
_mss_last_xml: str = ""        # last uiautomator XML dump


def _mss_get_udid() -> Optional[str]:
    devs = device_manager_instance.list_online_devices()
    return devs[0].udid if devs else None


def _parse_bounds(s: str) -> Optional[dict]:
    m = _re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', s or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _xml_to_mss_elements(xml_str: str) -> list:
    """Parse ADB uiautomator XML into precise Maestro UIElement list.

    Rules for precision:
    1. Only include interactive (clickable/focusable) elements or real leaf nodes.
    2. Post-process: remove any element whose bounds COMPLETELY CONTAIN another
       element's bounds — this eliminates container blobs (RecyclerView sections)
       that cover multiple children, so each list item is highlighted individually.
    """
    raw: list = []
    rid_cnt: dict = {}
    txt_cnt: dict = {}

    def walk(node):
        rid        = node.get("resource-id") or None
        text       = node.get("text") or None
        hint       = node.get("hint") or None
        acc        = node.get("content-desc") or None
        clickable  = node.get("clickable") == "true"
        focusable  = node.get("focusable") == "true"
        enabled    = node.get("enabled", "true") == "true"
        bnds       = _parse_bounds(node.get("bounds", ""))
        has_children = len(list(node)) > 0

        is_interactive = (clickable or focusable) and enabled
        is_leaf        = not has_children
        should_include = (rid or text or acc) and (is_interactive or is_leaf)

        if should_include and bnds and bnds["width"] > 0 and bnds["height"] > 0:
            rid_idx = None
            if rid:
                c = rid_cnt.get(rid, 0)
                if c: rid_idx = c
                rid_cnt[rid] = c + 1

            txt_idx = None
            if text:
                c = txt_cnt.get(text, 0)
                if c: txt_idx = c
                txt_cnt[text] = c + 1

            el: dict = {"id": str(_uuid_lib.uuid4())}
            el["bounds"]                  = bnds
            if rid:                       el["resourceId"]         = rid
            if rid_idx is not None:       el["resourceIdIndex"]    = rid_idx
            if text:                      el["text"]               = text
            if hint:                      el["hintText"]           = hint
            if acc and acc != text:       el["accessibilityText"]  = acc
            if txt_idx is not None:       el["textIndex"]          = txt_idx
            raw.append(el)

        for child in node:
            walk(child)

    try:
        walk(_ET.fromstring(xml_str))
    except Exception as e:
        logger.warning(f"MSS element parse error: {e}")
        return []

    # ── Post-process: remove containers that fully enclose other elements ──────
    # If element A's bounds contain element B's bounds entirely, A is a container
    # and should be excluded so the user can select B individually.
    def contains(outer: dict, inner: dict) -> bool:
        o, i = outer["bounds"], inner["bounds"]
        return (o["x"] <= i["x"] and o["y"] <= i["y"]
                and o["x"] + o["width"]  >= i["x"] + i["width"]
                and o["y"] + o["height"] >= i["y"] + i["height"])

    # Mark elements that contain at least one other element → skip them
    is_container = [False] * len(raw)
    for ai, a in enumerate(raw):
        for bi, b in enumerate(raw):
            if ai != bi and contains(a, b):
                is_container[ai] = True
                break

    return [el for el, skip in zip(raw, is_container) if not skip]


# ── Native directory picker (for Open Workspace) ─────────────────────────────

@app.get("/api/maestro-studio/pick-directory")
async def pick_directory():
    """Open the OS native folder picker and return the selected path.

    macOS: uses AppleScript `choose folder`.
    Returns {"path": "/absolute/path"} or {"path": null} if cancelled.
    """
    import shutil
    try:
        # macOS — AppleScript native folder dialog
        if shutil.which("osascript"):
            result = subprocess.run(
                ["osascript", "-e",
                 'POSIX path of (choose folder with prompt "Selecione o workspace do Maestro")'],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                path = result.stdout.strip().rstrip("/")
                return {"path": path}
            return {"path": None}  # user cancelled

        # Linux fallback — zenity
        if shutil.which("zenity"):
            result = subprocess.run(
                ["zenity", "--file-selection", "--directory",
                 "--title=Selecione o workspace do Maestro"],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                return {"path": result.stdout.strip()}
            return {"path": None}

        raise HTTPException(status_code=501, detail="No native dialog available on this OS")
    except asyncio.TimeoutError:
        return {"path": None, "error": "timeout"}


async def _adb_dump(udid: str) -> str:
    """Capture ADB uiautomator dump and return raw XML string."""
    try:
        p1 = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "uiautomator", "dump", "/sdcard/mss.xml",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(p1.wait(), timeout=10)

        p2 = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "cat", "/sdcard/mss.xml",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(p2.communicate(), timeout=8)
        xml = out.decode("utf-8", errors="replace").strip()
        return xml if xml.startswith("<") else ""
    except Exception as e:
        logger.debug(f"MSS adb dump: {e}")
        return ""


@app.get("/mss/api/device-screen/sse")
async def mss_device_screen_sse():
    """SSE stream: live device screenshot + UI elements for embedded Maestro Studio."""

    async def generate():
        global _mss_last_xml
        elements_cache: list = []
        dump_tick = 0

        while True:
            udid = _mss_get_udid()

            if not udid:
                event = {"platform": "ANDROID", "screenshot": "",
                         "width": 390, "height": 844, "elements": [], "url": None}
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(2)
                continue

            try:
                # ── screenshot ─────────────────────────────────────────────
                jpeg = await capture_screenshot_fast(udid)
                if not jpeg:
                    await asyncio.sleep(1)
                    continue

                sid = str(_uuid_lib.uuid4())
                _mss_screenshots[sid] = jpeg
                if len(_mss_screenshots) > 30:
                    del _mss_screenshots[next(iter(_mss_screenshots))]

                try:
                    img = Image.open(io.BytesIO(jpeg))
                    w, h = img.size
                except Exception:
                    w, h = 390, 844

                # ── elements: refresh every 3 frames (~3 s) ────────────────
                dump_tick += 1
                if dump_tick >= 3:
                    dump_tick = 0
                    xml = await _adb_dump(udid)
                    if xml:
                        _mss_last_xml = xml
                        elements_cache = _xml_to_mss_elements(xml)

                b64 = _base64.b64encode(jpeg).decode("ascii")
                event = {
                    "platform": "ANDROID",
                    "screenshot": b64,
                    "width": w,
                    "height": h,
                    "elements": elements_cache,
                    "url": None,
                }
                yield f"data: {json.dumps(event)}\n\n"

            except Exception as e:
                logger.error(f"MSS SSE frame error: {e}")

            await asyncio.sleep(1)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/mss/screenshot/{sid}")
async def mss_screenshot(sid: str):
    data = _mss_screenshots.get(sid)
    if not data:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return Response(content=data, media_type="image/jpeg")


class _MSSRunCmd(BaseModel):
    yaml: str
    dryRun: Optional[bool] = None


@app.post("/mss/api/run-command")
async def mss_run_command(req: _MSSRunCmd):
    """Execute a Maestro YAML command on the connected device."""
    udid = _mss_get_udid()
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    if req.dryRun:
        return []  # parse-only — nothing to run

    # Resolve foreground appId
    try:
        from android.ui_inspector import UIInspector
        loop = asyncio.get_event_loop()
        pkg = await loop.run_in_executor(None, UIInspector.get_foreground_package, udid)
    except Exception:
        pkg = "com.app.unknown"

    # Wrap bare command list with minimal appId header if needed
    yaml_body = req.yaml.strip()
    if not yaml_body.startswith("appId:"):
        yaml_body = f"appId: {pkg or 'com.app.unknown'}\n---\n{yaml_body}"

    import shutil
    maestro_bin = shutil.which("maestro") or os.path.expanduser("~/.maestro/bin/maestro")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(yaml_body)
        yaml_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            maestro_bin, "--device", udid, "test", yaml_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        if proc.returncode != 0:
            msg = (stdout + stderr).decode("utf-8", errors="replace").strip()
            raise HTTPException(status_code=400, detail=msg or "Command failed")
        return []
    except asyncio.TimeoutError:
        raise HTTPException(status_code=400, detail="Command timed out (30 s)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            os.unlink(yaml_path)
        except Exception:
            pass


@app.get("/mss/api/last-view-hierarchy")
async def mss_view_hierarchy():
    udid = _mss_get_udid()
    xml = ""
    if udid:
        xml = await _adb_dump(udid)
        if xml:
            global _mss_last_xml
            _mss_last_xml = xml
    xml = xml or _mss_last_xml
    if not xml:
        raise HTTPException(status_code=404, detail="No view hierarchy available")
    # Maestro Studio expects a JSON TreeNode; return raw XML wrapped in a JSON field
    return Response(content=json.dumps({"xml": xml}), media_type="application/json")


@app.get("/mss/api/auth")
async def mss_auth():
    return {"authToken": None, "openAiToken": None}


@app.get("/mss/api/auth-token")
async def mss_auth_token():
    raise HTTPException(status_code=404, detail="No auth token")


@app.post("/mss/api/auth/openai-token")
async def mss_save_openai_token(body: dict):
    return Response(status_code=200)


@app.delete("/mss/api/auth/openai-token")
async def mss_delete_openai_token():
    return Response(status_code=200)


@app.get("/mss/api/banner-message")
async def mss_banner():
    return {"message": "QAMind Embedded Maestro Studio", "level": "none"}


class _MSSFormatReq(BaseModel):
    commands: List[str]


@app.post("/mss/api/format-flow")
async def mss_format_flow(req: _MSSFormatReq):
    return {"config": "", "commands": "\n".join(req.commands)}


@app.get("/mss/api/mock-server/data")
async def mss_mock_data():
    return {"projectId": None, "events": []}


@app.get("/mss/")
async def mss_root():
    return Response(
        content="QAMind Maestro Studio Server",
        media_type="text/plain",
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ── File system API for Maestro Studio workspace ─────────────────────────────
# The polyfill calls these endpoints when the app invokes IPC file channels.

class _MSSFileCreate(BaseModel):
    path: str           # absolute path
    content: str = ""

class _MSSFileSave(BaseModel):
    path: str
    content: str

class _MSSFileDelete(BaseModel):
    path: str

class _MSSFileRename(BaseModel):
    oldPath: str
    newPath: str


@app.post("/api/maestro-studio/file/create")
async def mss_file_create(req: _MSSFileCreate):
    try:
        p = Path(req.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        logger.info(f"MSS file created: {req.path}")
        return {"success": True, "path": req.path}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/maestro-studio/file/save")
async def mss_file_save(req: _MSSFileSave):
    try:
        p = Path(req.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/maestro-studio/file/read")
async def mss_file_read(path: str):
    try:
        content = Path(path).read_text(encoding="utf-8")
        return {"success": True, "content": content}
    except Exception as e:
        return {"success": False, "content": "", "error": str(e)}


@app.get("/api/maestro-studio/file/list")
async def mss_file_list(path: str):
    """Recursively list files/folders in workspace directory."""
    try:
        root = Path(path)
        if not root.exists():
            return {"success": True, "files": []}

        def build_tree(p: Path, depth: int = 0) -> dict:
            if depth > 8:
                return None
            if p.is_file():
                return {"path": str(p), "name": p.name, "type": "file"}
            children = []
            try:
                for child in sorted(p.iterdir()):
                    if child.name.startswith(".") or child.name == "node_modules":
                        continue
                    node = build_tree(child, depth + 1)
                    if node:
                        children.append(node)
            except PermissionError:
                pass
            return {"path": str(p), "name": p.name, "type": "directory", "children": children}

        tree = build_tree(root)
        return {"success": True, "tree": tree}
    except Exception as e:
        return {"success": False, "files": [], "error": str(e)}


@app.post("/api/maestro-studio/file/delete")
async def mss_file_delete(req: _MSSFileDelete):
    import shutil as _shutil
    try:
        p = Path(req.path)
        if p.is_dir():
            _shutil.rmtree(p)
        else:
            p.unlink()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/maestro-studio/file/rename")
async def mss_file_rename(req: _MSSFileRename):
    try:
        Path(req.oldPath).rename(req.newPath)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── NEW Maestro Studio Desktop API (/mss/api/devices/*) ──────────────────────
# The new Electron Maestro Studio uses a completely different API structure.
# Key flow: GET /api/devices/events (SSE → device list) →
#           GET /api/devices/deviceScreen/sse?instanceId=X (screen SSE)

def _mss_build_device_list() -> list:
    """Build Maestro Studio device list from connected ADB devices."""
    devices = device_manager_instance.list_online_devices()
    result = []
    for dev in devices:
        udid = dev.udid or dev.serial
        # Distinguish emulators (emulator-5554) from physical USB devices
        is_emulator = udid.startswith("emulator-")
        result.append({
            "instanceId": udid,
            "modelId": udid,
            "state": "connected",
            "platform": "ANDROID",
            "description": f"Android {'Emulator' if is_emulator else 'Device'} ({udid})",
            "error": None,
        })
    return result


# In-memory store for pending flow executions
_mss_flows: dict = {}   # flowId → {yaml, workspacePath, filePath, env, udid, status}


@app.get("/mss/api/devices/events")
async def mss_devices_events():
    """SSE stream: device list updates. Once connected sends current devices every 3s."""

    async def generate():
        while True:
            devices = _mss_build_device_list()
            yield f"data: {json.dumps(devices)}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/mss/api/devices/deviceScreen/sse")
async def mss_device_screen_new(instanceId: str = ""):
    """SSE stream: live screenshot + elements for a specific device instanceId.

    Frame loop runs at ~6-7 FPS (150ms). The uiautomator XML dump is expensive
    (500-1500ms) and runs in a sibling task so it never stalls the frame loop.
    Width/height in each event are the NATIVE device dimensions — required for
    bounds percentages (which come from uiautomator in native coords) to line
    up with the preview, even though the JPEG payload is sent at half resolution.
    """
    udid = instanceId or _mss_get_udid()

    async def generate():
        global _mss_last_xml
        elements_ref = {"cache": [], "native_w": 0, "native_h": 0}

        async def dump_loop():
            """Pulls uiautomator XML periodically in the background."""
            global _mss_last_xml
            while True:
                # Yield ADB to Maestro during command execution to avoid contention
                while _adb_command_active.is_set():
                    await asyncio.sleep(0.2)
                active = udid or _mss_get_udid()
                if active:
                    try:
                        xml = await _adb_dump(active)
                        if xml:
                            _mss_last_xml = xml
                            elements_ref["cache"] = _xml_to_mss_elements(xml)
                    except Exception as e:
                        logger.debug(f"MSS dump_loop error: {e}")
                await asyncio.sleep(1.5)

        dump_task = asyncio.create_task(dump_loop())

        try:
            while True:
                # Pause screencap while a Maestro command is running — single-device
                # ADB can't sustain concurrent heavy operations cleanly.
                while _adb_command_active.is_set():
                    await asyncio.sleep(0.2)

                active_udid = udid or _mss_get_udid()
                if not active_udid:
                    await asyncio.sleep(1)
                    continue

                try:
                    jpeg, native_w, native_h = await capture_screenshot_with_native_size(active_udid)
                    if not jpeg:
                        await asyncio.sleep(0.3)
                        continue

                    sid = str(_uuid_lib.uuid4())
                    _mss_screenshots[sid] = jpeg
                    if len(_mss_screenshots) > 30:
                        del _mss_screenshots[next(iter(_mss_screenshots))]

                    # Use the native (pre-resize) screenshot dimensions. uiautomator bounds
                    # are in this same coord system on the devices we've tested; sending the
                    # reduced JPEG dimensions (which the bundle would otherwise extract from
                    # `img.size`) caused highlights to render 2x too big.
                    if native_w and native_h:
                        elements_ref["native_w"] = native_w
                        elements_ref["native_h"] = native_h
                    w = elements_ref["native_w"] or 390
                    h = elements_ref["native_h"] or 844

                    # Screenshot as raw base64 (app uses `data:image/png;base64,${screenshot}`)
                    b64 = _base64.b64encode(jpeg).decode("ascii")

                    event = {
                        "platform": "ANDROID",
                        "screenshot": b64,
                        "width": w,
                        "height": h,
                        "elements": elements_ref["cache"],
                        "url": None,
                    }
                    yield f"data: {json.dumps(event)}\n\n"

                except Exception as e:
                    logger.error(f"MSS deviceScreen SSE error: {e}")

                await asyncio.sleep(0.15)
        finally:
            dump_task.cancel()
            try:
                await dump_task
            except (asyncio.CancelledError, Exception):
                pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _adb_shell(udid: str, *args: str, timeout: float = 3.0) -> int:
    """Run `adb -s UDID shell ARGS...` and return the exit code (or -1 on error)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", *args,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout)
        return proc.returncode or 0
    except Exception:
        return -1


def _find_element_bounds_by_id(xml_str: str, resource_id: str) -> Optional[dict]:
    try:
        root = _ET.fromstring(xml_str)
    except Exception:
        return None

    def walk(node):
        rid = node.get("resource-id") or ""
        # Match exact or suffix ("bt_welcome_login" should match "pkg:id/bt_welcome_login")
        if rid == resource_id or rid.endswith("/" + resource_id) or rid.endswith(":" + resource_id):
            b = _parse_bounds(node.get("bounds", ""))
            if b and b["width"] > 0 and b["height"] > 0:
                return b
        for child in node:
            r = walk(child)
            if r:
                return r
        return None
    return walk(root)


def _find_element_bounds_by_text(xml_str: str, text: str) -> Optional[dict]:
    try:
        root = _ET.fromstring(xml_str)
    except Exception:
        return None

    def walk(node):
        t = node.get("text") or ""
        cd = node.get("content-desc") or ""
        if t == text or cd == text:
            b = _parse_bounds(node.get("bounds", ""))
            if b and b["width"] > 0 and b["height"] > 0:
                return b
        for child in node:
            r = walk(child)
            if r:
                return r
        return None
    return walk(root)


async def _get_fresh_xml(udid: str, max_age_ok: bool = True) -> str:
    """Return cached XML (updated every ~1.5s by the SSE dump task) or do a fresh dump."""
    global _mss_last_xml
    if max_age_ok and _mss_last_xml:
        return _mss_last_xml
    xml = await _adb_dump(udid)
    if xml:
        _mss_last_xml = xml
    return xml or ""


async def _fast_run_maestro_command(udid: str, yaml_content: str) -> Optional[dict]:
    """Fast path: parse common Maestro commands and execute directly via ADB.

    Returns {"success": bool, "error"?: str} if the command matched a fast path,
    or None if the caller should fall back to the maestro CLI.
    """
    body = yaml_content.strip()
    # Drop appId header (first line or appId: ... block separated by ---)
    if "---" in body:
        parts = body.split("---", 1)
        body = parts[1].strip()

    # tapOn with resource id:   - tapOn:\n    id: "xxx"
    m = _re.match(r'-\s*tapOn:\s*\n\s+id:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        rid = m.group(1)
        xml = await _get_fresh_xml(udid)
        bounds = _find_element_bounds_by_id(xml, rid) if xml else None
        if not bounds:
            # Retry once with a forced fresh dump — UI may have changed since last cache
            xml = await _get_fresh_xml(udid, max_age_ok=False)
            bounds = _find_element_bounds_by_id(xml, rid) if xml else None
        if bounds:
            cx = bounds["x"] + bounds["width"] // 2
            cy = bounds["y"] + bounds["height"] // 2
            rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
            return {"success": rc == 0} if rc == 0 else {"success": False, "error": "tap failed"}
        return {"success": False, "error": f"Element id '{rid}' not found"}

    # tapOn with text or content-desc
    m = _re.match(r'-\s*tapOn:\s*\n\s+text:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        txt = m.group(1)
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_text(xml, txt) if xml else None
        if bounds:
            cx = bounds["x"] + bounds["width"] // 2
            cy = bounds["y"] + bounds["height"] // 2
            rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
            return {"success": rc == 0} if rc == 0 else {"success": False, "error": "tap failed"}
        return {"success": False, "error": f"Element text '{txt}' not found"}

    # tapOn with point percentages:  point: "50%, 50%"
    m = _re.match(r'-\s*tapOn:\s*\n\s+point:\s*["\'](\d+)%\s*,\s*(\d+)%["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        px, py = int(m.group(1)), int(m.group(2))
        try:
            proc = await asyncio.create_subprocess_exec(
                "adb", "-s", udid, "shell", "wm", "size",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
            wm = _re.search(r'(\d+)x(\d+)', out.decode(errors="ignore"))
            if wm:
                w, h = int(wm.group(1)), int(wm.group(2))
                cx, cy = w * px // 100, h * py // 100
                rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
                return {"success": rc == 0}
        except Exception:
            pass
        return None

    # assertVisible with id / text — just check XML, no side effect
    m = _re.match(r'-\s*assertVisible:\s*\n\s+id:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_id(xml, m.group(1)) if xml else None
        return {"success": bool(bounds), "error": None if bounds else f"Element id '{m.group(1)}' not visible"}

    m = _re.match(r'-\s*assertVisible:\s*\n\s+text:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_text(xml, m.group(1)) if xml else None
        return {"success": bool(bounds), "error": None if bounds else f"Element text '{m.group(1)}' not visible"}

    # back / pressKey back
    if _re.match(r'-\s*(back|pressKey:\s*back)\s*$', body, _re.MULTILINE):
        rc = await _adb_shell(udid, "input", "keyevent", "KEYCODE_BACK")
        return {"success": rc == 0}

    # inputText: "..."  — types into currently focused field
    m = _re.match(r'-\s*inputText:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        text = m.group(1).replace(" ", "%s").replace("'", r"\'")
        rc = await _adb_shell(udid, "input", "text", text, timeout=5)
        return {"success": rc == 0}

    return None  # fall back to maestro CLI


@app.post("/mss/api/devices/runCommand")
async def mss_run_command_new(body: dict):
    """Execute a Maestro command on the connected device.

    Fast path: simple commands (tapOn id/text/point, assertVisible, back, inputText)
    run directly via ADB + cached uiautomator XML (sub-second latency).
    Fallback: spawn the `maestro` CLI for commands the fast path doesn't handle.
    """
    instance_id = body.get("instanceId", "") or _mss_get_udid()
    udid = instance_id or _mss_get_udid()
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    yaml_content = (
        body.get("yaml") or
        body.get("command") or
        body.get("flow") or ""
    ).strip()

    if not yaml_content:
        raise HTTPException(status_code=400, detail="No command provided")

    # ── Fast path ────────────────────────────────────────────────────────────
    try:
        fast = await _fast_run_maestro_command(udid, yaml_content)
        if fast is not None:
            return fast
    except Exception as e:
        logger.warning(f"fast_run_maestro_command error, falling back to CLI: {e}")

    # ── Fallback: embedded Maestro Studio server (warm Orchestra session) ───
    try:
        from android.ui_inspector import UIInspector
        loop = asyncio.get_event_loop()
        pkg = await loop.run_in_executor(None, UIInspector.get_foreground_package, udid)
    except Exception:
        pkg = "com.app.unknown"

    if not yaml_content.startswith("appId:"):
        yaml_content = f"appId: {pkg or 'com.app.unknown'}\n---\n{yaml_content}"

    ok, err = await _embedded_run_yaml(udid, yaml_content)
    return {"success": ok} if ok else {"success": False, "error": err}


@app.post("/mss/api/devices/connected/disconnect")
async def mss_disconnect():
    return {"success": True}


@app.post("/mss/api/devices/runFlowFile")
async def mss_run_flow_file(body: dict):
    """Validate (dryRun=true) or execute a Maestro YAML flow file.

    The client opens the flowStatus SSE BEFORE calling this endpoint, using its
    own client-generated flowId. We must honour that flowId (not mint a new one)
    or the SSE subscription will never match the stored flow.
    """
    # Honour the client-generated flowId so the open SSE connection can pick it up
    flow_id = body.get("flowId") or str(_uuid_lib.uuid4())
    udid = body.get("instanceId") or _mss_get_udid()
    yaml_content = body.get("yaml", "")
    workspace_path = body.get("workspacePath", "")
    file_path = body.get("filePath", "")
    dry_run = body.get("dryRun", False)
    env = body.get("env") or {}

    if not yaml_content:
        raise HTTPException(status_code=400, detail="No YAML content provided")

    if dry_run:
        # Just validate and return flowId — SSE connection will run it
        _mss_flows[flow_id] = {
            "yaml": yaml_content,
            "workspacePath": workspace_path,
            "filePath": file_path,
            "env": env,
            "udid": udid,
            "status": "PENDING",
        }
        return {"success": True, "flowId": flow_id, "filepath": file_path}

    # Non-dry-run: execute immediately via the embedded Maestro Studio server.
    # The appId is already bound to the Maestro session at launch time (via
    # `maestro --device UDID studio`), so we don't prepend a header here —
    # doing so was triggering a hanging ADB lookup for the foreground package.
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    ok, err = await _embedded_run_yaml(udid, yaml_content.strip())
    return {
        "success": ok,
        "flowId": flow_id,
        "filepath": file_path,
        "error": None if ok else err,
    }


@app.get("/mss/api/devices/flowStatus/sse")
async def mss_flow_status_sse(flowId: str = "", filepath: str = ""):
    """SSE stream: execute a stored Maestro flow and stream status events.

    Events match Maestro Studio's expected format:
    {"flowId": "...", "flowStatus": "RUNNING"|"COMPLETED"|"FAILED", "commands": []}
    """
    def _flow_event(status: str, **extra) -> str:
        """Build an SSE data frame with ALL the arrays the bundle spreads over.

        `gEe(i)` does `[...i.onFlowStartCommandsStatuses, ...i.commandStatuses, ...i.onFlowCompleteCommandsStatuses]`
        so each event MUST carry those keys as iterables or the bundle throws
        `TypeError: ... is not iterable` into its top-level error boundary
        and shows "Something went wrong".
        """
        payload = {
            "flowId": flowId,
            "flowStatus": status,
            "filepath": filepath,
            "commands": [],
            "onFlowStartCommandsStatuses": [],
            "commandStatuses": [],
            "onFlowCompleteCommandsStatuses": [],
            **extra,
        }
        return f"data: {json.dumps(payload)}\n\n"

    async def generate():
        # Send initial RUNNING event so the bundle's SSE onopen resolves and
        # it proceeds to POST the runFlowFile body.
        yield _flow_event("RUNNING")

        # The client opens this SSE BEFORE sending the POST that stores the flow.
        # Poll for up to 10s waiting for the POST to register it.
        flow = None
        for _ in range(100):  # 100 * 0.1s = 10s
            flow = _mss_flows.get(flowId)
            if flow:
                break
            await asyncio.sleep(0.1)

        if not flow:
            yield _flow_event("FAILED", error="Flow not found")
            return

        udid = flow.get("udid") or _mss_get_udid()
        if not udid:
            yield _flow_event("FAILED", error="No device connected")
            return

        yaml_content = flow.get("yaml", "")

        # Execute via the persistent embedded Maestro Studio server so we reuse a
        # warm Orchestra session (no per-test JVM cold start, no repeated ADB
        # forwarder allocation that was causing TcpForwarder TimeoutException).
        # The appId is bound to the session at launch — don't probe foreground
        # package here (it hangs under ADB contention).
        yield _flow_event("RUNNING", output="Starting flow via embedded Maestro Studio...")
        try:
            ok, err = await _embedded_run_yaml(udid, yaml_content.strip())
            final_status = "COMPLETED" if ok else "FAILED"
            _mss_flows[flowId]["status"] = final_status
            extra = {}
            if not ok and err:
                extra["error"] = err
            yield _flow_event(final_status, **extra)
        except Exception as e:
            yield _flow_event("FAILED", error=str(e))

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/mss/api/devices/stopFlow")
async def mss_stop_flow(body: dict):
    return {"success": True}


@app.post("/mss/api/devices/pauseFlow")
async def mss_pause_flow(body: dict):
    return {"success": True}


@app.post("/mss/api/devices/resumeFlow")
async def mss_resume_flow(body: dict):
    return {"success": True}


async def _adb_list_packages(udid: str) -> list[str]:
    """Return sorted list of package IDs installed on the device (user + 3rd-party)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "pm", "list", "packages", "-3",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        lines = out.decode(errors="ignore").splitlines()
        pkgs = [ln[len("package:"):].strip() for ln in lines if ln.startswith("package:")]
        return sorted(set(pkgs))
    except Exception as e:
        logger.debug(f"pm list packages failed: {e}")
        return []


@app.get("/mss/api/apps/recent")
async def mss_apps_recent():
    """Return the foreground app first so the new-file dialog defaults App ID to it."""
    udid = _mss_get_udid()
    if not udid:
        return []
    try:
        pkg = await _get_foreground_package(udid)
        if not pkg:
            return []
        return [{"id": f"foreground-{pkg}", "appId": pkg}]
    except Exception as e:
        logger.debug(f"mss_apps_recent error: {e}")
        return []


@app.get("/mss/api/apps/installed")
async def mss_apps_installed():
    """Return packages installed on the connected device for the App ID combobox."""
    udid = _mss_get_udid()
    if not udid:
        return {"packages": []}
    packages = await _adb_list_packages(udid)
    return {"packages": packages}


@app.get("/mss/api/environments")
async def mss_environments():
    return []


@app.get("/mss/api/sentry/user-context")
async def mss_sentry_context_get():
    return {}

@app.post("/mss/api/sentry/user-context")
async def mss_sentry_context_post(body: dict = None):
    return {}


@app.post("/mss/api/metrics/workspace")
async def mss_workspace_metrics(body: dict):
    """Return workspace metrics for the given path."""
    return {"flowCount": 0, "workspacePath": body.get("workspacePath", "")}


@app.get("/mss/api/cloud/progress")
async def mss_cloud_progress():
    """SSE stream for cloud upload progress — stub."""
    async def generate():
        while True:
            yield f"data: {json.dumps({'progress': 0})}\n\n"
            await asyncio.sleep(5)
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


if __name__ == "__main__":
    import uvicorn
    daemon_port = int(os.environ.get("DAEMON_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=daemon_port)
