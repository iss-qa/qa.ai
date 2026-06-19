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
    # Persistidos no insert (service role) — antes eram droppados pelo modelo e
    # só o backfill do front os gravava, o que falhava/condicionava o folder_path.
    folder_path: Optional[str] = None
    workspace_path: Optional[str] = None
    app_id: Optional[str] = None
    raw_yaml: Optional[str] = None


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
            # Campos opcionais — só entram quando enviados (evita erro de coluna
            # inexistente em bancos sem a migration correspondente).
            if req.folder_path is not None:
                supabase_body["folder_path"] = req.folder_path or None
            if req.workspace_path is not None:
                supabase_body["workspace_path"] = req.workspace_path
            if req.app_id is not None:
                supabase_body["app_id"] = req.app_id
            if req.raw_yaml is not None:
                supabase_body["raw_yaml"] = req.raw_yaml

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


class SaveWorkspaceRequest(BaseModel):
    project_id: str
    # Caminho RELATIVO do flow a executar dentro do workspace, ex.:
    # "tests/home/inicio.yaml". Vazio = grava na raiz do projeto.
    entry_path: str = ""
    # Conteúdo atual do flow (edições não salvas do editor sobrescrevem a cópia
    # baixada do Storage). Opcional: se vazio, usa o que veio do Storage.
    yaml_content: str = ""


@router.post("/api/maestro/save-workspace")
async def save_maestro_workspace(req: SaveWorkspaceRequest):
    """Materializa a árvore COMPLETA do projeto no disco e devolve o caminho
    do flow de entrada (no seu local aninhado), pronto para o Maestro resolver
    runFlow/runScript relativos.

    1. Baixa todos os arquivos de `workspaces/<project_id>/` → `flows/<project_id>/`.
    2. Sobrescreve o flow de entrada com o conteúdo atual (se enviado).
    3. Retorna o caminho absoluto aninhado do flow de entrada.
    """
    from engines.maestro_runner import FLOWS_DIR
    from services.maestro.workspace import find_missing_dependencies, materialize_workspace

    if req.yaml_content:
        valid, message = validate_maestro_yaml(req.yaml_content)
        if not valid:
            raise HTTPException(status_code=400, detail=f"YAML invalido: {message}")

    # 1. Materializa o workspace inteiro (best-effort).
    materialized = await materialize_workspace(req.project_id)

    base_dir = (Path(FLOWS_DIR) / req.project_id).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    # Resolve o caminho de entrada com confinamento a flows/<project_id>/.
    rel = (req.entry_path or "").strip().lstrip("/")
    if not rel:
        rel = "flow.yaml"
    entry_abs = (base_dir / rel).resolve()
    if not str(entry_abs).startswith(str(base_dir)):
        raise HTTPException(status_code=400, detail="entry_path inválido")

    # 2. Sobrescreve o flow de entrada com o conteúdo atual do editor.
    if req.yaml_content:
        entry_abs.parent.mkdir(parents=True, exist_ok=True)
        entry_abs.write_text(req.yaml_content, encoding="utf-8")
    elif not entry_abs.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Flow de entrada não encontrado após materializar ({rel}). "
                   "Reimporte o projeto para espelhar os arquivos no Storage.",
        )

    # 3. PRÉ-CONDIÇÃO (rápida, sem JVM): valida que todas as dependências
    #    relativas (runScript/runFlow) existem ANTES de subir o Maestro.
    #    Falha em <1s em vez de esperar a JVM cold-start e só então errar.
    missing = find_missing_dependencies(entry_abs, base_dir)
    if missing:
        listed = "\n".join(f"  • {m}" for m in missing[:20])
        more = f"\n  … e mais {len(missing) - 20}" if len(missing) > 20 else ""
        raise HTTPException(
            status_code=422,
            detail=(
                "Dependências do teste não encontradas no workspace "
                f"({len(missing)}):\n{listed}{more}\n\n"
                "Reimporte o projeto (ZIP) para trazer os scripts (.js) e sub-flows "
                "referenciados — a importação precisa incluir esses arquivos."
            ),
        )

    logger.info(f"[WORKSPACE] save-workspace: {materialized} arquivos, entrada={entry_abs}")
    return {"status": "saved", "path": str(entry_abs), "materialized": materialized}


class RevealTestRequest(BaseModel):
    project_id: str
    test_name: str


@router.post("/api/tests/reveal")
async def reveal_test_file(req: RevealTestRequest):
    """Abre o YAML do teste no navegador de arquivos do SO (Finder/Explorer).

    O daemon roda na máquina do usuário, então pode revelar o arquivo
    localmente — coisa que o browser não consegue. O caminho é derivado com a
    MESMA sanitização do save_yaml_flow, nunca de um path vindo do cliente.
    """
    import re as _re
    import subprocess
    import sys

    from engines.maestro_runner import FLOWS_DIR

    safe_name = _re.sub(r"[^\w\-]", "_", req.test_name).strip("_") or "flow"
    file_path = (FLOWS_DIR / req.project_id / f"{safe_name}.yaml").resolve()

    # Confinamento: o path final precisa estar dentro de FLOWS_DIR.
    if not str(file_path).startswith(str(Path(FLOWS_DIR).resolve())):
        raise HTTPException(status_code=400, detail="Caminho inválido")
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Arquivo do teste não encontrado — salve o teste primeiro (botão Salvar).",
        )

    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(file_path)])
        elif sys.platform.startswith("win"):
            subprocess.Popen(["explorer", f"/select,{file_path}"])
        else:
            subprocess.Popen(["xdg-open", str(file_path.parent)])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao abrir o Finder: {e}")

    return {"status": "revealed", "path": str(file_path)}
