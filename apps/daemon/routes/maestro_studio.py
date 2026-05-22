import asyncio
import logging
import os
import subprocess
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request as FastAPIRequest, Response
from fastapi.responses import StreamingResponse as FastStreamingResponse
from pydantic import BaseModel

from routes.engines import get_maestro_binary
from services.maestro.studio import (
    MAESTRO_STUDIO_PORT,
    _maestro_studio_ping,
)

router = APIRouter()
logger = logging.getLogger("maestro_studio")


class MaestroStudioRequest(BaseModel):
    udid: Optional[str] = None


@router.post("/api/maestro/studio")
async def start_maestro_studio_legacy(req: MaestroStudioRequest):
    """Start Maestro Studio. Restarts ADB to release UiAutomation lock."""
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


@router.post("/api/maestro-studio/start")
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


@router.get("/api/maestro-studio/status")
async def maestro_studio_status():
    """Check whether Maestro Studio Java backend is reachable on port 5050."""
    running = await _maestro_studio_ping()
    return {"running": running, "port": MAESTRO_STUDIO_PORT}


@router.post("/api/maestro-studio/stop")
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


@router.api_route(
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
