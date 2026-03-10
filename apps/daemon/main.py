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

from android.device_manager import device_manager_instance
from android.executor import StepExecutor
from android.screenshot import screenshot_handler, capture_screenshot_fast
from android.recorder import InteractionRecorder
from ws.server import ws_server
from ws.stream_manager import screen_stream_manager
from models.step import TestStep, StepResult
from web_driver.executor import WebDriverExecutor
from routes.device_input import router as device_input_router

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

@app.post("/api/tests/parse-prompt")
async def parse_prompt(req: ParseRequest):
    try:
        result = await prompt_parser.parse(req.prompt, req.platform)
        return {
            "steps": [s.model_dump() for s in result.steps],
            "test_name": result.test_name,
            "estimated_duration_s": result.estimated_duration_s
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tests/parse-prompt-stream")
async def parse_prompt_stream(req: ParseRequest):
    return StreamingResponse(
        prompt_parser.parse_stream(req.prompt, req.platform),
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
        
        # We start it asynchronously so the endpoint returns immediately 
        # But for MVP, it's easier to just await it and return the summary
        test_case = TestCase(steps=request.steps)
        summary = await orchestrator.run(test_case, request.run_id, request.device_udid, platform=request.platform)
        
        del active_runs[request.run_id]
        return summary.model_dump()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    if run_id in active_runs:
        await active_runs[run_id].cancel()
        return {"status": "cancelling"}
    return {"status": "not_found"}

@app.post("/recordings/start")
async def start_recording(udid: str):
    try:
        d = device_manager_instance.connect(udid)
        # Note: InteractionRecorder is currently a prototype holding state.
        # In a real daemon with concurrent recordings, we'd map udids to instances.
        recorder = InteractionRecorder(ws_server, screenshot_handler)
        await recorder.start_recording(udid, d)
        return {"status": "recording_started", "udid": udid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
