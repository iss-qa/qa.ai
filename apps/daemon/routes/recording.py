import asyncio
import json as _json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from android.recorder import InteractionRecorder, active_recorders
from ws.server import ws_server

router = APIRouter()
logger = logging.getLogger("recording")


class RecordingStartRequest(BaseModel):
    udid: str
    project_id: Optional[str] = None
    # When provided, the daemon launches the app on the device before the
    # getevent loop starts. Matches the YAML's `launchApp:` step so the
    # first captured taps are on the app's actual first screen.
    app_id: Optional[str] = None
    clear_state: bool = False


@router.post("/recordings/start")
async def start_recording(req: RecordingStartRequest):
    """Start recording via ADB getevent. Returns recording_id for SSE subscription."""
    try:
        recorder = InteractionRecorder(ws_server)
        recording_id = await recorder.start_recording(
            req.udid,
            project_id=req.project_id,
            app_id=req.app_id,
            clear_state=req.clear_state,
        )
        active_recorders[req.udid] = recorder
        return {"status": "recording_started", "udid": req.udid, "recording_id": recording_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RecordingStopRequest(BaseModel):
    udid: str


@router.post("/recordings/stop")
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


@router.post("/recordings/enrich-and-record")
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


@router.post("/recordings/confirm-input")
async def confirm_input(req: ConfirmInputRequest):
    """Resolve a pending inputText step with the actual typed text."""
    recorder = active_recorders.get(req.udid)
    if not recorder:
        raise HTTPException(status_code=404, detail="No active recording for this device")
    updated = await recorder.confirm_input(req.step_index, req.text)
    return {"status": "ok", "step": updated}


@router.get("/recordings/events")
async def recording_events(udid: str):
    """SSE stream — sends recording steps as they are captured in real time."""
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
