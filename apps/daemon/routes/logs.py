import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from log_manager import log_manager, LOGS_BASE

router = APIRouter()
logger = logging.getLogger("logs")


@router.get("/api/logs")
async def list_logs(category: Optional[str] = None):
    """List all log files, optionally filtered by category."""
    return {"logs": log_manager.list_logs(category)}


@router.get("/api/logs/read")
async def read_log(path: str, offset: int = 0, limit: int = 1000):
    """Read log file contents with pagination."""
    return log_manager.read_log(path, offset, limit)


@router.get("/api/logs/download")
async def download_log(path: str):
    """Download a log file."""
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


@router.get("/api/logs/error-count")
async def error_count():
    """Get today's error count for the sidebar badge."""
    return {"count": log_manager.get_error_count_today()}


class SessionLogEntry(BaseModel):
    level: str = "INFO"
    message: str
    session_id: str = "default"


@router.post("/api/logs/session")
async def receive_session_log(entry: SessionLogEntry):
    """Receive session log entries from the frontend."""
    log_manager.session(entry.message, session_id=entry.session_id, level=entry.level)
    return {"status": "ok"}


class SessionLogBatch(BaseModel):
    entries: List[SessionLogEntry]


@router.post("/api/logs/session/batch")
async def receive_session_log_batch(batch: SessionLogBatch):
    """Receive multiple session log entries from the frontend."""
    for entry in batch.entries:
        log_manager.session(entry.message, session_id=entry.session_id, level=entry.level)
    return {"status": "ok", "count": len(batch.entries)}
