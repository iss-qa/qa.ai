import json
import logging
import os
import uuid as _uuid_lib
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

import state
from services.maestro.elements import _mss_get_udid, _adb_dump
from services.maestro.runner import _embedded_run_yaml, _run_maestro_test_file
from services.maestro.elements import _fast_run_maestro_command

router = APIRouter()
logger = logging.getLogger("mss.commands")


class _MSSRunCmd(BaseModel):
    yaml: str
    dryRun: Optional[bool] = None


@router.post("/mss/api/run-command")
async def mss_run_command(req: _MSSRunCmd):
    """Execute a Maestro YAML command on the connected device via the embedded studio session.

    Uses _embedded_run_yaml (warm session) instead of spawning a new `maestro test` subprocess
    so there's no JVM cold-start penalty (~5-10s) per command. _adb_command_active is set during
    execution so the screenshot SSE pauses cleanly — without this gate both screencap and Maestro's
    own ADB commands fight for the single-device ADB channel and intermittently timeout.
    """
    udid = _mss_get_udid()
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    if req.dryRun:
        return []  # parse-only — nothing to run

    yaml_body = req.yaml.strip()

    ok, err = await _embedded_run_yaml(udid, yaml_body)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Command failed")
    return []


@router.get("/mss/api/last-view-hierarchy")
async def mss_view_hierarchy():
    udid = _mss_get_udid()
    xml = ""
    if udid:
        xml = await _adb_dump(udid)
        if xml:
            state.mss_last_xml = xml
    xml = xml or state.mss_last_xml
    if not xml:
        raise HTTPException(status_code=404, detail="No view hierarchy available")
    # Maestro Studio expects a JSON TreeNode; return raw XML wrapped in a JSON field
    return Response(content=json.dumps({"xml": xml}), media_type="application/json")


@router.post("/mss/api/devices/runCommand")
async def mss_run_command_new(body: dict):
    """Execute a Maestro command on the connected device.

    Fast path: simple commands (tapOn id/text/point, assertVisible, back, inputText)
    run directly via ADB + cached uiautomator XML (sub-second latency).
    Fallback: spawn the `maestro` CLI for commands the fast path doesn't handle.
    """
    import asyncio
    instance_id = body.get("instanceId", "") or _mss_get_udid()
    udid = instance_id or _mss_get_udid()
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    yaml_content = (
        body.get("yaml") or
        body.get("command") or
        body.get("flow") or ""
    ).strip()

    if not yaml_content:
        raise HTTPException(status_code=400, detail="No command provided")

    # ── Fast path ────────────────────────────────────────────────────────────
    try:
        fast = await _fast_run_maestro_command(udid, yaml_content)
        if fast is not None:
            return fast
    except Exception as e:
        logger.warning(f"fast_run_maestro_command error, falling back to CLI: {e}")

    # ── Fallback: embedded Maestro Studio server (warm Orchestra session) ───
    try:
        from android.ui_inspector import UIInspector
        loop = asyncio.get_event_loop()
        pkg = await loop.run_in_executor(None, UIInspector.get_foreground_package, udid)
    except Exception:
        pkg = "com.app.unknown"

    if not yaml_content.startswith("appId:"):
        yaml_content = f"appId: {pkg or 'com.app.unknown'}\n---\n{yaml_content}"

    ok, err = await _embedded_run_yaml(udid, yaml_content)
    return {"success": ok} if ok else {"success": False, "error": err}


@router.post("/mss/api/devices/runFlowFile")
async def mss_run_flow_file(body: dict):
    """Validate (dryRun=true) or execute a Maestro YAML flow file.

    The client opens the flowStatus SSE BEFORE calling this endpoint, using its
    own client-generated flowId. We must honour that flowId (not mint a new one)
    or the SSE subscription will never match the stored flow.

    When `yaml` is empty but `filePath` is provided and the file exists on disk,
    the YAML content is read from the file. This handles the Maestro Studio case
    where the frontend sends only the path (not the full content).
    """
    flow_id = body.get("flowId") or str(_uuid_lib.uuid4())
    udid = body.get("instanceId") or _mss_get_udid()
    yaml_content = (body.get("yaml") or "").strip()
    workspace_path = body.get("workspacePath", "")
    file_path = body.get("filePath", "")
    dry_run = body.get("dryRun", False)
    env = body.get("env") or {}

    # The Maestro Studio frontend strips the workspace prefix from filePath before
    # sending — e.g. full path "/workspace/tests/login.yaml" becomes "tests/login.yaml".
    # Resolve it back to absolute so os.path.exists() and maestro test work correctly.
    if file_path and workspace_path and not os.path.isabs(file_path):
        file_path = os.path.join(workspace_path, file_path)

    # If yaml is empty but filePath exists on disk, read it directly.
    if not yaml_content and file_path and os.path.exists(file_path):
        try:
            with open(file_path, encoding="utf-8") as f:
                yaml_content = f.read().strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read flow file: {e}")

    if not yaml_content and not file_path:
        raise HTTPException(status_code=400, detail="No YAML content or filePath provided")

    if dry_run:
        # Store and let the open flowStatus SSE connection execute it.
        state.mss_flows[flow_id] = {
            "yaml": yaml_content,
            "workspacePath": workspace_path,
            "filePath": file_path,
            "env": env,
            "udid": udid,
            "status": "PENDING",
        }
        return {"success": True, "flowId": flow_id, "filepath": file_path}

    # Non-dry-run: execute immediately.
    # Prefer direct file execution when the workspace file exists — relative
    # runFlow / runScript paths only resolve correctly this way (Maestro uses
    # the file's parent dir as cwd). Fall back to embedded-studio for inline YAML.
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    if file_path and os.path.exists(file_path):
        ok, err = await _run_maestro_test_file(udid, file_path, env)
    else:
        ok, err = await _embedded_run_yaml(udid, yaml_content)
    return {
        "success": ok,
        "flowId": flow_id,
        "filepath": file_path,
        "error": None if ok else err,
    }
