import asyncio
import logging
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
from android.screenshot import screenshot_handler, capture_screenshot_fast
from android.recorder import InteractionRecorder, active_recorders
from ws.server import ws_server
from ws.stream_manager import screen_stream_manager
from models.step import TestStep, StepResult
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
    allow_origins=["*"],  # In production, restrict this
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
    # Ensure device is connected
    d = device_manager_instance.get_device(udid)
    if not d:
        try:
            device_manager_instance.connect(udid)
        except Exception as e:
            logger.error(f"Cannot connect to {udid} for streaming: {e}")
            await websocket.close(code=1008)
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

@app.post("/recordings/start")
async def start_recording(req: RecordingStartRequest):
    try:
        d = device_manager_instance.connect(req.udid)
        recorder = InteractionRecorder(ws_server, screenshot_handler)
        await recorder.start_recording(req.udid, d)
        active_recorders[req.udid] = recorder
        return {"status": "recording_started", "udid": req.udid}
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

class EnrichStepRequest(BaseModel):
    udid: str
    x: int
    y: int
    action: str = "tap"

@app.post("/recordings/enrich-step")
async def enrich_step(req: EnrichStepRequest):
    """Inspect UI hierarchy at coordinates and return element info + screenshot."""
    recorder = active_recorders.get(req.udid)
    if not recorder:
        # Create a temporary recorder for enrichment even without active recording
        try:
            d = device_manager_instance.connect(req.udid)
            recorder = InteractionRecorder(ws_server, screenshot_handler)
            recorder.d = d
            recorder.udid = req.udid
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    try:
        result = await recorder.enrich_step(req.x, req.y, req.action)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

from android.element_scanner import scanner_instance, load_element_map

class ScanRequest(BaseModel):
    udid: str
    project_id: str

@app.post("/api/scanner/start")
async def start_element_scan(req: ScanRequest):
    """Start scanning UI elements while the user navigates the app."""
    if scanner_instance.is_running:
        return {"status": "already_running", **scanner_instance.stats}
    await scanner_instance.start(req.udid, req.project_id)
    return {"status": "started", **scanner_instance.stats}

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

if __name__ == "__main__":
    import uvicorn
    daemon_port = int(os.environ.get("DAEMON_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=daemon_port)
