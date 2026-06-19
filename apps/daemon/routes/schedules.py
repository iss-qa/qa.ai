"""CRUD de agendamentos de lote. As mutações passam pelo daemon para que o
cálculo do próximo disparo (next_run_at) fique centralizado em um só lugar
(services/scheduler.py). A listagem também é exposta aqui por conveniência.
"""

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.scheduler import compute_next_run

router = APIRouter()
logger = logging.getLogger("schedules")

_SB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
_SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")


def _headers(prefer: str = "") -> dict:
    h = {"apikey": _SB_KEY, "Authorization": f"Bearer {_SB_KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return h


def _require_sb():
    if not _SB_URL or not _SB_KEY:
        raise HTTPException(status_code=500, detail="Supabase não configurado no daemon")


class ScheduleCreate(BaseModel):
    project_id: str
    name: str
    test_ids: List[str]
    device_udid: str
    cron: str                      # ex.: "0 8 * * 1-5"
    timezone: str = "America/Sao_Paulo"


@router.post("/api/schedules")
async def create_schedule(req: ScheduleCreate):
    _require_sb()
    if not req.test_ids:
        raise HTTPException(status_code=400, detail="Selecione ao menos um teste")
    next_run = compute_next_run(req.cron, req.timezone, datetime.now(timezone.utc))
    if not next_run:
        raise HTTPException(status_code=400, detail="Expressão de agendamento inválida")
    row = {
        "project_id": req.project_id,
        "name": req.name,
        "test_ids": req.test_ids,
        "device_udid": req.device_udid,
        "cron": req.cron,
        "timezone": req.timezone,
        "is_active": True,
        "next_run_at": next_run.isoformat(),
    }
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(f"{_SB_URL}/rest/v1/test_schedules",
                                 headers=_headers("return=representation"), json=row, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Falha ao criar agendamento: {resp.text[:200]}")
    return resp.json()[0]


@router.get("/api/schedules")
async def list_schedules(project_id: str):
    _require_sb()
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{_SB_URL}/rest/v1/test_schedules",
            headers=_headers(),
            params={"project_id": f"eq.{project_id}", "select": "*", "order": "created_at.desc"},
            timeout=15,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Falha ao listar: {resp.text[:200]}")
    return resp.json()


class SchedulePatch(BaseModel):
    is_active: Optional[bool] = None


@router.patch("/api/schedules/{schedule_id}")
async def patch_schedule(schedule_id: str, req: SchedulePatch):
    _require_sb()
    body: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    async with httpx.AsyncClient(verify=False) as client:
        if req.is_active is not None:
            body["is_active"] = req.is_active
            # Ao reativar, recalcula o próximo disparo a partir de agora.
            if req.is_active:
                cur = await client.get(
                    f"{_SB_URL}/rest/v1/test_schedules",
                    headers=_headers(),
                    params={"id": f"eq.{schedule_id}", "select": "cron,timezone"},
                    timeout=15,
                )
                if cur.status_code == 200 and cur.json():
                    s = cur.json()[0]
                    nxt = compute_next_run(s.get("cron", ""), s.get("timezone", "America/Sao_Paulo"),
                                           datetime.now(timezone.utc))
                    body["next_run_at"] = nxt.isoformat() if nxt else None
        resp = await client.patch(
            f"{_SB_URL}/rest/v1/test_schedules",
            headers=_headers("return=representation"),
            params={"id": f"eq.{schedule_id}"}, json=body, timeout=15,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Falha ao atualizar: {resp.text[:200]}")
    return resp.json()[0] if resp.text else {"status": "ok"}


@router.delete("/api/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    _require_sb()
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.delete(
            f"{_SB_URL}/rest/v1/test_schedules",
            headers=_headers("return=minimal"),
            params={"id": f"eq.{schedule_id}"}, timeout=15,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Falha ao excluir: {resp.text[:200]}")
    return {"status": "deleted"}
