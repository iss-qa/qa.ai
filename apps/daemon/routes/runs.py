import asyncio
import logging
import os
import re as _re
import subprocess
import traceback
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import state
from android.device_manager import device_manager_instance
from android.executor import StepExecutor
from android.screenshot import screenshot_handler
from engines.maestro_runner import run_with_maestro, save_yaml_flow
from log_manager import log_manager
from models.step import TestStep
from ws.server import ws_server

router = APIRouter()
logger = logging.getLogger("runs")

from dotenv import load_dotenv
load_dotenv()

anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_KEY", "")
supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY", "") or supabase_key

from ai.prompt_parser import PromptParser
from ai.vision_analyzer import VisionAnalyzer
from ai.auto_corrector import AutoCorrector
from ai.orchestrator import RunOrchestrator, TestCase
from web_driver.executor import WebDriverExecutor

prompt_parser = PromptParser(anthropic_api_key)
vision_analyzer = VisionAnalyzer(anthropic_api_key)
auto_corrector = AutoCorrector()

_PREMISES_PATH = Path(__file__).parent.parent.parent.parent / "premises.yaml"
_premises_cache: dict = {}

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


def _extract_element_name(text: str) -> str:
    """
    Extract the REAL UI element name from a user description.
    Aggressively removes action verbs, filler words, and context.
    The result should be the EXACT text visible on screen.
    """
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


# Um package id Android: segmentos separados por ponto, começando por letra
# (ex.: br.com.foxbit.foxbitandroid). Usado para detectar quando um "hint" já é
# o próprio pacote — caso típico de launchApp GRAVADO, que armazena o pacote real.
_PACKAGE_ID_RE = _re.compile(r'^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$')


def _looks_like_package_id(value: str) -> bool:
    return bool(value) and bool(_PACKAGE_ID_RE.match(value.strip()))


def _resolve_app_id_from_hint(app_hint: str, udid: str = "") -> str:
    """
    Deriva o appId a partir do alvo de um launchApp.

    O launchApp GRAVADO já guarda o pacote real (ex.: br.com.foxbit.foxbitandroid);
    nesse caso usamos direto. Só quando o hint é um NOME amigável é que tentamos
    resolver para o pacote via cache/ADB. Retorna "com.app.unknown" só em último caso.
    """
    app_hint = (app_hint or "").strip()
    if not app_hint:
        return "com.app.unknown"

    # 1. Já é um package id (caso do teste gravado) → usa direto.
    if _looks_like_package_id(app_hint):
        return app_hint

    # 2. Nome amigável → tenta resolver para o pacote.
    resolved = _resolve_app_package(app_hint, udid)
    if _looks_like_package_id(resolved):
        return resolved

    # 3. Fallback: tenta cada palavra "significativa" do nome.
    for w in app_hint.split():
        if len(w) > 3:
            r = _resolve_app_package(w, udid)
            if _looks_like_package_id(r) and r != w:
                return r

    return "com.app.unknown"


def _resolve_app_package(app_name: str, udid: str = "") -> str:
    """
    Resolve an app name to its Android package ID.
    1. Check known cache
    2. Search installed packages on device via ADB
    3. Return best match or the name as-is
    """
    name_lower = app_name.lower().strip()

    # 0. Se já é um package id, ele resolve para si mesmo.
    if _looks_like_package_id(app_name):
        return app_name.strip()

    # 1. Check cache
    for key, pkg in state.APP_PACKAGE_CACHE.items():
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
                if name_lower.replace(' ', '') in pkg_lower.replace('.', '').replace('_', ''):
                    state.APP_PACKAGE_CACHE[name_lower] = pkg
                    logger.info(f"[APP_RESOLVE] Found '{app_name}' -> {pkg}")
                    return pkg

            # Fuzzy: check each word of app name
            words = name_lower.split()
            for pkg in packages:
                pkg_lower = pkg.lower()
                if all(w in pkg_lower for w in words if len(w) > 2):
                    state.APP_PACKAGE_CACHE[name_lower] = pkg
                    logger.info(f"[APP_RESOLVE] Fuzzy matched '{app_name}' -> {pkg}")
                    return pkg
        except Exception as e:
            logger.warning(f"[APP_RESOLVE] ADB search failed: {e}")

    return app_name


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
            return mapping.get("hint") or mapping.get("text") or elem

    # Check hardcoded generic-to-placeholder map
    if elem_lower in _GENERIC_TO_PLACEHOLDER:
        return _GENERIC_TO_PLACEHOLDER[elem_lower]

    return elem


def _action_to_maestro_command(action: str, target: str, value: str) -> str:
    """
    Convert a step action/target/value into a Maestro YAML command.
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


@router.post("/api/tests/parse-prompt")
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


@router.post("/api/tests/parse-prompt-stream")
async def parse_prompt_stream(req: ParseRequest):
    import uuid as _uuid
    from fastapi.responses import StreamingResponse
    from android.element_scanner import load_element_map, element_map_to_prompt_context

    build_id = f"build_{_uuid.uuid4().hex[:12]}"

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


@router.post("/api/runs")
async def start_run(request: RunAIRequest):
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

                # First pass: derive appId from the launchApp step. O alvo gravado
                # já costuma ser o pacote real (ex.: br.com.foxbit.foxbitandroid);
                # _resolve_app_id_from_hint usa direto e só resolve nomes amigáveis.
                for s in request.steps:
                    raw = s if isinstance(s, dict) else dict(s)
                    action = raw.get("action", "").lower()
                    if action == "launchapp":
                        app_hint = raw.get("target", "") or raw.get("value", "")
                        if app_hint:
                            app_id = _resolve_app_id_from_hint(app_hint, request.device_udid)
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

            _task = asyncio.create_task(run_with_maestro(
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
            state.background_tasks.add(_task)
            _task.add_done_callback(state.background_tasks.discard)
            return {"status": "started", "run_id": request.run_id, "engine": "maestro"}

        # --- UIAutomator2 engine ---
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

        state.active_runs[request.run_id] = orchestrator

        # Convert raw dicts to TestStep objects for UIAutomator2
        parsed_steps = []
        for s in request.steps:
            raw = s if isinstance(s, dict) else s.model_dump() if hasattr(s, 'model_dump') else dict(s)
            try:
                parsed_steps.append(TestStep(**raw))
            except Exception as step_err:
                logger.warning(f"Skipping invalid step: {step_err}")

        test_case = TestCase(steps=parsed_steps)

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

        _task = asyncio.create_task(_run_and_update_status())
        state.background_tasks.add(_task)
        _task.add_done_callback(state.background_tasks.discard)

        return {"status": "started", "run_id": request.run_id}

    except Exception as e:
        traceback.print_exc()
        logger.error(f"[EXECUTOR] Exception in start_run: {e}")
        log_manager.error(f"start_run failed: {e}", context="EXECUTOR", run_id=request.run_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runs/vision")
async def start_vision_run(
    run_id: str = Form(...),
    steps: str = Form(...),
    device_udid: str = Form(...),
    platform: str = Form("android"),
    image_step_mapping: Optional[str] = Form(None),
    reference_images: List[UploadFile] = File(...)
):
    """Start a test run with vision-first flow using reference images."""
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

        orchestrator._reference_images = image_bytes_list
        orchestrator._image_step_mapping = mapping

        state.active_runs[run_id] = orchestrator

        test_case = TestCase(steps=parsed_steps)
        _task = asyncio.create_task(orchestrator.run(test_case, run_id, device_udid, platform=platform))
        state.background_tasks.add(_task)
        _task.add_done_callback(state.background_tasks.discard)

        return {"status": "started", "run_id": run_id}

    except Exception as e:
        traceback.print_exc()
        logger.error(f"[VISION] Exception in start_vision_run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AmbiguityResolution(BaseModel):
    step_num: int
    x: int
    y: int


@router.post("/api/runs/{run_id}/resolve-ambiguity")
async def resolve_ambiguity(run_id: str, resolution: AmbiguityResolution):
    """Resolve an ambiguous element during vision-first execution."""
    if run_id not in state.active_runs:
        raise HTTPException(status_code=404, detail="Run not found")
    orchestrator = state.active_runs[run_id]
    await orchestrator.resolve_ambiguity(resolution.step_num, resolution.x, resolution.y)
    return {"status": "resolved"}


@router.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    if run_id in state.active_runs:
        await state.active_runs[run_id].cancel()
        return {"status": "cancelling"}
    return {"status": "not_found"}


@router.get("/api/devices/{udid}/resolve-app")
async def resolve_app(udid: str, name: str):
    """Resolve an app name to its package ID on the device."""
    pkg = _resolve_app_id_from_hint(name, udid)
    # "resolved" = conseguimos um package id válido (inclui o caso em que o
    # próprio nome já era um pacote, como no teste gravado).
    return {"app_name": name, "package_id": pkg, "resolved": _looks_like_package_id(pkg)}


# ============================================================
# Batch (suite) execution
# ============================================================

class BatchExecuteRequest(BaseModel):
    project_id: str
    test_ids: List[str]           # ordem = ordem de execução
    device_udid: str
    name: Optional[str] = None    # rótulo do lote (ex.: "basic/ (12 testes)")


@router.post("/api/batches/execute")
async def execute_batch(req: BatchExecuteRequest):
    """Cria um lote e executa os testes em sequência (background).

    Retorna o batch_run_id imediatamente; o front acompanha o progresso por
    polling em test_batch_runs / test_runs (batch_run_id).
    """
    if not req.test_ids:
        raise HTTPException(status_code=400, detail="Nenhum teste selecionado para o lote")
    if not req.device_udid:
        raise HTTPException(status_code=400, detail="device_udid é obrigatório")

    sb_url = supabase_url.rstrip("/")
    sb_key = supabase_service_key
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase não configurado no daemon")

    headers = {
        "apikey": sb_key, "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json", "Prefer": "return=representation",
    }
    row = {
        "project_id": req.project_id,
        "name": req.name or f"Lote de {len(req.test_ids)} teste(s)",
        "status": "pending",
        "triggered_by": "manual",
        "device_udid": req.device_udid,
        "total_tests": len(req.test_ids),
    }
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(f"{sb_url}/rest/v1/test_batch_runs", headers=headers, json=row, timeout=15)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Falha ao criar lote: {resp.text[:200]}")
        batch_run_id = resp.json()[0]["id"]

    from services.maestro.batch import run_batch
    _task = asyncio.create_task(run_batch(req.project_id, req.test_ids, req.device_udid, batch_run_id))
    state.background_tasks.add(_task)
    _task.add_done_callback(state.background_tasks.discard)

    return {"status": "started", "batch_run_id": batch_run_id, "total": len(req.test_ids)}


@router.get("/api/batches")
async def list_batches(project_id: str, limit: int = 50):
    """Histórico de execuções em lote de um projeto (manuais + agendadas).

    Lido via service key (sem RLS) para funcionar igual em PRD/localhost. Cada
    item linka para o relatório completo (`/api/batches/{id}/report`).
    """
    sb_url = supabase_url.rstrip("/")
    sb_key = supabase_service_key
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase não configurado no daemon")
    headers = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{sb_url}/rest/v1/test_batch_runs",
            headers=headers,
            params={
                "project_id": f"eq.{project_id}",
                "select": ("id,name,status,triggered_by,schedule_id,total_tests,"
                           "passed_tests,failed_tests,started_at,ended_at,duration_ms"),
                "order": "started_at.desc",
                "limit": str(limit),
            },
            timeout=15,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Falha ao listar lotes: {resp.text[:200]}")
    return resp.json()


@router.get("/api/batches/{batch_run_id}")
async def get_batch(batch_run_id: str):
    """Status do lote + execuções por teste (lido via service key → sem RLS).

    O front faz polling daqui em vez do Supabase direto, evitando bloqueio de
    RLS nas tabelas novas e funcionando igual em PRD/localhost.
    """
    sb_url = supabase_url.rstrip("/")
    sb_key = supabase_service_key
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase não configurado no daemon")
    headers = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
    async with httpx.AsyncClient(verify=False) as client:
        b_resp = await client.get(
            f"{sb_url}/rest/v1/test_batch_runs",
            headers=headers,
            params={"id": f"eq.{batch_run_id}",
                    "select": "id,status,total_tests,passed_tests,failed_tests,duration_ms"},
            timeout=15,
        )
        r_resp = await client.get(
            f"{sb_url}/rest/v1/test_runs",
            headers=headers,
            params={"batch_run_id": f"eq.{batch_run_id}",
                    "select": "id,test_case_id,status,duration_ms,error_message,test_cases(name)",
                    "order": "started_at.asc"},
            timeout=15,
        )
    batch = (b_resp.json() or [None])[0] if b_resp.status_code == 200 else None
    runs = r_resp.json() if r_resp.status_code == 200 else []
    return {"batch": batch, "runs": runs}


@router.get("/api/batches/{batch_run_id}/report")
async def get_batch_report(batch_run_id: str):
    """Dados COMPLETOS do lote para o relatório PDF: metadados + cada teste com
    YAML executado, status, duração, erro e evidências (bug_reports). Lido via
    service key (sem RLS). Endpoint separado do polling leve (não infla o poll).
    """
    sb_url = supabase_url.rstrip("/")
    sb_key = supabase_service_key
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase não configurado no daemon")
    headers = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}
    async with httpx.AsyncClient(verify=False) as client:
        b_resp = await client.get(
            f"{sb_url}/rest/v1/test_batch_runs",
            headers=headers, params={"id": f"eq.{batch_run_id}", "select": "*"}, timeout=15,
        )
        r_resp = await client.get(
            f"{sb_url}/rest/v1/test_runs",
            headers=headers,
            params={"batch_run_id": f"eq.{batch_run_id}",
                    "select": "id,test_case_id,status,duration_ms,started_at,ended_at,error_message,"
                              "steps_total,steps_passed,steps_failed,device_udid,"
                              "test_cases(name,raw_yaml,app_id,folder_path)",
                    "order": "started_at.asc"},
            timeout=20,
        )
        runs = r_resp.json() if r_resp.status_code == 200 else []
        run_ids = [r["id"] for r in runs]
        evidence_by_run: dict = {}
        shots_by_run: dict = {}
        if run_ids:
            ids_csv = ",".join(run_ids)
            e_resp = await client.get(
                f"{sb_url}/rest/v1/bug_reports",
                headers=headers,
                params={"test_run_id": f"in.({ids_csv})",
                        "select": "test_run_id,title,severity,screenshot_url,pdf_url,jira_url",
                        "order": "created_at.desc"},
                timeout=15,
            )
            if e_resp.status_code == 200:
                for ev in e_resp.json():
                    evidence_by_run.setdefault(ev["test_run_id"], []).append(ev)
            # Screenshots por passo (run_steps.run_id = test_run.id no lote).
            s_resp = await client.get(
                f"{sb_url}/rest/v1/run_steps",
                headers=headers,
                params={"run_id": f"in.({ids_csv})",
                        "select": "run_id,step_order,screenshot_url,status",
                        "order": "step_order.asc"},
                timeout=15,
            )
            if s_resp.status_code == 200:
                for st in s_resp.json():
                    if st.get("screenshot_url"):
                        shots_by_run.setdefault(st["run_id"], []).append(st)

    batch = (b_resp.json() or [None])[0] if b_resp.status_code == 200 else None

    def _tc(r):
        tc = r.get("test_cases")
        if isinstance(tc, list):
            return tc[0] if tc else {}
        return tc or {}

    tests = [{
        "test_run_id": r["id"],
        "test_case_id": r.get("test_case_id"),
        "name": _tc(r).get("name") or "teste",
        "app_id": _tc(r).get("app_id"),
        "folder_path": _tc(r).get("folder_path"),
        "raw_yaml": _tc(r).get("raw_yaml"),
        "status": r.get("status"),
        "duration_ms": r.get("duration_ms"),
        "started_at": r.get("started_at"),
        "ended_at": r.get("ended_at"),
        "error_message": r.get("error_message"),
        "steps_total": r.get("steps_total"),
        "steps_passed": r.get("steps_passed"),
        "steps_failed": r.get("steps_failed"),
        "evidence": evidence_by_run.get(r["id"], []),
        "screenshots": shots_by_run.get(r["id"], []),
    } for r in runs]

    return {"batch": batch, "tests": tests}
