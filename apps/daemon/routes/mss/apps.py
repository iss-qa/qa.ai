import asyncio
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from android.element_scanner import _get_foreground_package
from services.maestro.elements import _mss_get_udid

router = APIRouter()
logger = logging.getLogger("mss.apps")


async def _adb_list_packages(udid: str) -> list:
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


@router.get("/mss/api/apps/recent")
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


@router.get("/mss/api/apps/installed")
async def mss_apps_installed():
    """Return packages installed on the connected device for the App ID combobox."""
    udid = _mss_get_udid()
    if not udid:
        return {"packages": []}
    packages = await _adb_list_packages(udid)
    return {"packages": packages}


@router.get("/mss/api/environments")
async def mss_environments():
    return []


@router.get("/mss/api/sentry/user-context")
async def mss_sentry_context_get():
    return {}


@router.post("/mss/api/sentry/user-context")
async def mss_sentry_context_post(body: dict = None):
    return {}


@router.post("/mss/api/metrics/workspace")
async def mss_workspace_metrics(body: dict):
    """Return workspace metrics for the given path."""
    return {"flowCount": 0, "workspacePath": body.get("workspacePath", "")}


@router.get("/mss/api/cloud/progress")
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
