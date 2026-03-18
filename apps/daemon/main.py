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

prompt_parser = PromptParser(anthropic_api_key)
vision_analyzer = VisionAnalyzer(anthropic_api_key)
auto_corrector = AutoCorrector()

class ParseRequest(BaseModel):
    prompt: str
    platform: str = "android"
    project_id: str = "default_project"
    device_udid: Optional[str] = None
    model: str = "claude-sonnet-4-6"

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
    ui_context = ""
    if req.device_udid:
        try:
            d = device_manager_instance.get_device(req.device_udid)
            if d:
                ui_context = d.dump_hierarchy()
                logger.info(f"UI Context retrieved for {req.device_udid}, length: {len(ui_context)}")
        except Exception as e:
            logger.warning(f"Failed to get UI context for {req.device_udid}: {e}")
            
    return StreamingResponse(
        prompt_parser.parse_stream(req.prompt, req.platform, ui_context=ui_context, model=req.model),
        media_type="text/event-stream"
    )

class RunAIRequest(BaseModel):
    test_case_id: str
    device_udid: Optional[str] = None
    run_id: str
    steps: List[TestStep]
    platform: str = "android"

# Dictionary to keep track of active run orchestrators for cancellation
active_runs = {}

@app.post("/api/runs")
async def start_run(request: RunAIRequest):
    import traceback
    logger.info(f"[EXECUTOR] Recebida a requisição POST /api/runs: run_id={request.run_id}, udid={request.device_udid}, steps={len(request.steps)}")
    try:
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
        
        test_case = TestCase(steps=request.steps)
        # Execute asynchronously so endpoint returns immediately
        asyncio.create_task(orchestrator.run(test_case, request.run_id, request.device_udid, platform=request.platform))
        
        return {"status": "started", "run_id": request.run_id}
        
    except Exception as e:
        traceback.print_exc()
        logger.error(f"[EXECUTOR] Exception in start_run: {e}")
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

@app.post("/api/tests/save")
async def save_test(req: SaveTestRequest):
    """Save a recorded test to Supabase, bypassing frontend RLS restrictions."""
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    import json as json_mod
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    body: dict = {
        "name": req.name,
        "description": req.description,
        "steps": req.steps,
        "tags": req.tags,
        "is_active": True,
        "version": 1,
    }
    if req.project_id:
        body["project_id"] = req.project_id

    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            f"{supabase_url}/rest/v1/test_cases",
            headers=headers,
            json=body,
            timeout=10,
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        return {"status": "saved", "test": data[0] if isinstance(data, list) and data else data}
    else:
        error_body = resp.text
        logger.error(f"Supabase insert failed: {resp.status_code} - {error_body}")
        raise HTTPException(status_code=resp.status_code, detail=f"Supabase error: {error_body}")

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
