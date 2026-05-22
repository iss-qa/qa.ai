import logging
import os
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from engines.maestro_runner import save_yaml_flow
from engines.maestro_validator import validate_maestro_yaml
from log_manager import log_manager

router = APIRouter()
logger = logging.getLogger("tests")

LOCAL_TESTS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "test_cases"
LOCAL_TESTS_DIR.mkdir(parents=True, exist_ok=True)

from dotenv import load_dotenv
load_dotenv()

supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_KEY", "")
supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY", "") or supabase_key


class SaveTestRequest(BaseModel):
    name: str
    description: str = ""
    steps: list = []
    project_id: Optional[str] = None
    tags: list = ["recorded"]


@router.post("/api/tests/save")
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


@router.delete("/api/tests/{test_id}")
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


@router.get("/api/tests")
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


@router.post("/api/maestro/convert-recording")
async def convert_recording_to_maestro(req: ConvertRecordingRequest):
    """Convert recorded interactions to Maestro YAML via Claude."""
    from ai.prompt_parser import PromptParser
    from dotenv import load_dotenv
    load_dotenv()
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    prompt_parser = PromptParser(anthropic_api_key)
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


@router.post("/api/maestro/validate-yaml")
async def validate_yaml(req: MaestroYamlRequest):
    """Validate Maestro YAML syntax."""
    valid, message = validate_maestro_yaml(req.yaml_content)
    return {"valid": valid, "message": message}


@router.post("/api/maestro/save-yaml")
async def save_maestro_yaml(req: MaestroYamlRequest):
    """Validate and save a Maestro YAML flow to disk."""
    valid, message = validate_maestro_yaml(req.yaml_content)
    if not valid:
        raise HTTPException(status_code=400, detail=f"YAML invalido: {message}")

    file_path = save_yaml_flow(req.project_id, req.test_name, req.yaml_content)
    return {"status": "saved", "path": file_path}
