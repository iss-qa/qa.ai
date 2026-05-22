import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from android.device_manager import device_manager_instance
from android.element_scanner import (
    scanner_instance,
    load_element_map,
    _get_foreground_activity,
    _get_foreground_package,
)
from android.screenshot import screenshot_handler

router = APIRouter()
logger = logging.getLogger("scanner")


class ScanRequest(BaseModel):
    udid: str
    project_id: str
    project_name: Optional[str] = None  # Human-readable name for file naming
    mode: str = "auto"
    app_package: Optional[str] = None  # Lock scan to specific app


@router.get("/api/devices/{udid}/foreground-app")
async def get_foreground_app(udid: str):
    """Detect the current foreground app package via ADB."""
    try:
        activity = await _get_foreground_activity(udid)
        package = await _get_foreground_package(udid)
        label = package.split('.')[-1] if package else "Unknown"
        return {"package": package, "activity": activity, "label": label}
    except Exception as e:
        return {"package": None, "activity": None, "label": None, "error": str(e)}


@router.post("/api/scanner/start")
async def start_element_scan(req: ScanRequest):
    """Start scanning UI elements while the user navigates the app."""
    if scanner_instance.is_running:
        return {"status": "already_running", **scanner_instance.stats}
    await scanner_instance.start(req.udid, req.project_id, mode=req.mode, app_package=req.app_package, project_name=req.project_name or "")
    return {"status": "started", **scanner_instance.stats}


@router.post("/api/scanner/dump")
async def scanner_dump_now():
    """Trigger an on-demand hierarchy dump (for on_click mode or manual capture)."""
    if not scanner_instance.is_running:
        return {"status": "not_running"}
    stats = await scanner_instance.dump_now()
    return {"status": "captured", **stats}


@router.post("/api/scanner/stop")
async def stop_element_scan():
    """Stop scanning and save the element map."""
    if not scanner_instance.is_running:
        return {"status": "not_running"}
    element_map = await scanner_instance.stop()
    return {"status": "stopped", "element_map": element_map}


@router.get("/api/scanner/status")
async def scanner_status():
    """Get current scanner status and stats."""
    return scanner_instance.stats


@router.post("/screenshot/{udid}")
async def capture_screenshot(udid: str):
    try:
        d = device_manager_instance.connect(udid)
        url = await screenshot_handler.capture_and_upload(d, "manual", 0, "live")
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
