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
    """Execute a Maestro YAML command on the connected device.

    Strategy:
    1. Fast path via _fast_run_maestro_command (ADB tap from cached XML, <200ms).
       Covers `tapOn: "..."`, `tapOn: id/text/point`, `assertVisible`, `back`, `inputText`.
    2. Fallback to the warm embedded session if the fast path doesn't match the YAML.
       The embedded subprocess sometimes fails to start (TimeoutException on
       dadb.forwarding.TcpForwarder.waitFor) — keeping the fast path FIRST avoids
       that penalty for the simple commands the Maestro Studio "Insert & Run"
       button generates.
    """
    udid = _mss_get_udid()
    if not udid:
        raise HTTPException(status_code=400, detail="No device connected")

    if req.dryRun:
        return []  # parse-only — nothing to run

    yaml_body = req.yaml.strip()

    try:
        fast = await _fast_run_maestro_command(udid, yaml_body)
        if fast is not None:
            if fast.get("success"):
                return []
            raise HTTPException(status_code=400, detail=fast.get("error") or "Command failed")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"fast path errored, falling back to embedded: {e}")

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
    """Register a Maestro flow for execution via the flowStatus SSE.

    The Maestro Studio bundle sends TWO POSTs per Run Test click — once with
    `dryRun: true` (validation) and once with `dryRun: false` (trigger). If we
    execute the test synchronously in the non-dryRun branch, the SSE pipeline
    also runs it (after picking up the stored flow), resulting in the test
    running twice back-to-back under `state.test_run_lock`.

    Single source of truth: always store; the open flowStatus SSE is the sole
    executor. Both POSTs become idempotent registers. When the second POST
    arrives for an in-flight flow, we return success without re-storing so the
    SSE's RUNNING/COMPLETED/FAILED status is preserved.
    """
    flow_id = body.get("flowId") or str(_uuid_lib.uuid4())
    udid = body.get("instanceId") or _mss_get_udid()
    yaml_content = (body.get("yaml") or "").strip()
    workspace_path = body.get("workspacePath", "")
    file_path = body.get("filePath", "")
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

    # Idempotent register: if this flow is already in flight or done, leave it
    # alone. Otherwise (re)store as PENDING and let the SSE pick it up.
    existing = state.mss_flows.get(flow_id)
    if existing and existing.get("status") in ("PENDING", "RUNNING", "COMPLETED", "FAILED"):
        logger.info(f"runFlowFile: idempotent skip for {flow_id[:8]} (status={existing.get('status')})")
    else:
        state.mss_flows[flow_id] = {
            "yaml": yaml_content,
            "workspacePath": workspace_path,
            "filePath": file_path,
            "env": env,
            "udid": udid,
            "status": "PENDING",
        }
    return {"success": True, "flowId": flow_id, "filepath": file_path}
