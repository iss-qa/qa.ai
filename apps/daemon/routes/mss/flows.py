import asyncio
import json
import logging
import os
import time

import yaml as _yaml
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

import state
from services.maestro.elements import _mss_get_udid
from services.maestro.runner import _embedded_run_yaml, _run_maestro_test_file

router = APIRouter()
logger = logging.getLogger("mss.flows")


def _extract_command_start_lines(yaml_text: str) -> list:
    """Return a list of `startLine` ints per top-level command in the flow,
    in declaration order. 1-based line numbers.

    Maestro flows have an optional `appId:` config header separated by `---`;
    the commands list lives after `---`. We compose the YAML stream and walk
    the SequenceNode children to extract `node.start_mark.line`.
    """
    try:
        docs = list(_yaml.compose_all(yaml_text))
    except _yaml.YAMLError:
        return []
    commands_node = next(
        (d for d in reversed(docs) if isinstance(d, _yaml.SequenceNode)),
        None,
    )
    if commands_node is None:
        return []
    return [child.start_mark.line + 1 for child in commands_node.value]


def _build_original_commands(
    command_statuses: list,
    start_lines: list,
    flow_done: bool,
) -> list:
    """Build the `originalCommands` array the bundle reads parallel to
    `commandStatuses` to paint editor-gutter decorations.

    Default bundle behaviour is to paint EVERY step's status — accumulating
    green checks for the whole flow history. We want a SINGLE moving
    indicator that follows the currently-running step, and a red mark when
    a step fails. So we expose `startLine` only for the step the user should
    see right now; other entries are `{}` (bundle's `qn(undefined)` check
    skips paint).

    - mid-flight: only the last RUNNING step gets a startLine
    - on FAILED: the failed step keeps its startLine (red mark stays)
    - on COMPLETED: the last step gets its startLine (final green tick)
    """
    n = len(command_statuses)
    out: list = [{} for _ in range(n)]
    if not n or not start_lines:
        return out

    target_idx = -1
    # Priority: a FAILED step (red) always wins over RUNNING.
    for i, cs in enumerate(command_statuses):
        if cs.get("status") == "FAILED":
            target_idx = i
            break
    if target_idx == -1:
        # Last RUNNING step — the one currently executing.
        for i in range(n - 1, -1, -1):
            if command_statuses[i].get("status") == "RUNNING":
                target_idx = i
                break
    if target_idx == -1 and flow_done:
        # Flow ended cleanly — anchor the final state on the last step.
        target_idx = n - 1

    if 0 <= target_idx < n and target_idx < len(start_lines):
        out[target_idx] = {"startLine": start_lines[target_idx]}
    return out


@router.get("/mss/api/devices/flowStatus/sse")
async def mss_flow_status_sse(flowId: str = "", filepath: str = ""):
    """SSE stream: execute a stored Maestro flow and stream status events.

    Events match Maestro Studio's expected format:
    {"flowId": "...", "flowStatus": "RUNNING"|"COMPLETED"|"FAILED", "commands": []}
    """
    def _flow_event(status: str, **extra) -> str:
        """Build an SSE data frame with ALL the arrays the bundle spreads over.

        `gEe(i)` does `[...i.onFlowStartCommandsStatuses, ...i.commandStatuses, ...i.onFlowCompleteCommandsStatuses]`
        so each event MUST carry those keys as iterables or the bundle throws
        `TypeError: ... is not iterable` into its top-level error boundary
        and shows "Something went wrong".

        `originalCommands` is indexed parallel to `commandStatuses` for the
        editor's per-line highlight code; if absent, `Ei.originalCommands[ct]`
        throws. Empty array is safe (optional chaining yields undefined).
        """
        payload = {
            "flowId": flowId,
            "flowStatus": status,
            "filepath": filepath,
            "flowName": "",
            "commands": [],
            "originalCommands": [],
            "onFlowStartCommandsStatuses": [],
            "commandStatuses": [],
            "onFlowCompleteCommandsStatuses": [],
            **extra,
        }
        cs = payload.get("commandStatuses") or []
        sample_keys = sorted(cs[0].keys()) if cs else []
        logger.info(
            f"SSE flow={flowId[:8]} status={status} cs={len(cs)} keys={sample_keys}"
        )
        return f"data: {json.dumps(payload)}\n\n"

    async def generate():
        # Send initial RUNNING event so the bundle's SSE onopen resolves and
        # it proceeds to POST the runFlowFile body.
        yield _flow_event("RUNNING")

        # The client opens this SSE BEFORE sending the POST that stores the flow.
        # Poll for up to 10s waiting for the POST to register it.
        flow = None
        for _ in range(100):  # 100 * 0.1s = 10s
            flow = state.mss_flows.get(flowId)
            if flow:
                break
            await asyncio.sleep(0.1)

        if not flow:
            yield _flow_event("FAILED", error="Flow not found")
            return

        udid = flow.get("udid") or _mss_get_udid()
        if not udid:
            yield _flow_event("FAILED", error="No device connected")
            return

        # Idempotency gate: the bundle retries the SSE up to 5 times on errors.
        # Each reconnect re-enters this handler with the same flowId — without a
        # status gate, the flow's commands run N times, typing `inputText` text
        # N times into the field. Only one run per flowId.
        current_status = flow.get("status", "PENDING")
        if current_status == "RUNNING":
            # Another SSE is already executing this flow — just stream its
            # final status when it lands, no re-run.
            for _ in range(600):  # up to 60s of polling
                s = state.mss_flows.get(flowId, {}).get("status", "PENDING")
                if s in ("COMPLETED", "FAILED"):
                    extra = {}
                    err = state.mss_flows.get(flowId, {}).get("error")
                    if s == "FAILED" and err:
                        extra["error"] = err
                    yield _flow_event(s, **extra)
                    return
                await asyncio.sleep(0.1)
            yield _flow_event("FAILED", error="Execution timeout while awaiting peer SSE")
            return
        if current_status in ("COMPLETED", "FAILED"):
            extra = {}
            err = flow.get("error")
            if current_status == "FAILED" and err:
                extra["error"] = err
            yield _flow_event(current_status, **extra)
            return

        # Mark RUNNING so concurrent SSE reconnects don't re-execute
        state.mss_flows[flowId]["status"] = "RUNNING"
        yaml_content = flow.get("yaml", "")
        flow_file_path = flow.get("filePath", "")
        flow_env = flow.get("env") or {}

        # Parse YAML to extract per-command line numbers — used by both the
        # bundle's gutter painter (via `originalCommands[i].startLine`) and
        # our injected helper script for auto-scroll + tab status dots.
        source_yaml = yaml_content
        if (not source_yaml) and flow_file_path and os.path.exists(flow_file_path):
            try:
                with open(flow_file_path, encoding="utf-8") as f:
                    source_yaml = f.read()
            except Exception:
                source_yaml = ""
        start_lines = _extract_command_start_lines(source_yaml)

        yield _flow_event(
            "RUNNING",
            output="Aguarde, iniciando teste...",
            originalCommands=[],
            qamindStartLines=start_lines,
        )

        # ── Real-time step streaming ──────────────────────────────────────────
        # We run the test in a background task and read step updates from a
        # queue. Each step update triggers a new SSE event with the full
        # commandStatuses array so the Maestro Studio bundle can render the
        # live progress list in the bottom panel.
        step_queue: asyncio.Queue = asyncio.Queue()
        command_statuses: list = []
        step_index = 0
        flow_name = ""

        if flow_file_path and os.path.exists(flow_file_path):
            test_task = asyncio.create_task(
                _run_maestro_test_file(udid, flow_file_path, flow_env, step_queue)
            )
        else:
            # Inline YAML — no step streaming for embedded runner
            test_task = asyncio.create_task(
                _embedded_run_yaml(udid, yaml_content.strip())
            )
            # Put sentinel immediately so the loop below exits after the task
            async def _no_stream_sentinel():
                result = await test_task
                await step_queue.put(None)
                return result
            test_task = asyncio.create_task(_no_stream_sentinel())

        try:
            while True:
                try:
                    item = await asyncio.wait_for(step_queue.get(), timeout=3.0)
                except asyncio.TimeoutError:
                    # Send a heartbeat to keep the SSE connection alive and show
                    # the current state while the test is still running.
                    if not test_task.done():
                        yield _flow_event("RUNNING", commandStatuses=command_statuses)
                    continue

                if item is None:
                    # Sentinel — test subprocess finished, stop reading.
                    break

                item_type = item.get("type")

                if item_type == "flow_name":
                    flow_name = item.get("text", "")
                    continue

                if item_type == "info":
                    # Non-step lines (device info, section headers) — skip or use
                    # as a generic status message without adding a fake step.
                    continue

                if item_type == "step":
                    desc = item.get("description", "")
                    status = item.get("status", "RUNNING")
                    ts = item.get("timestamp", int(time.time() * 1000))

                    # Find an existing entry for this description (e.g. RUNNING → COMPLETED)
                    existing = next(
                        (cs for cs in command_statuses if cs.get("description") == desc),
                        None,
                    )
                    if existing:
                        existing["status"] = status
                        if status in ("COMPLETED", "FAILED", "WARNED", "SKIPPED"):
                            existing["endTimestamp"] = ts
                    else:
                        # subCommands/subOnStart/subOnComplete are REQUIRED by
                        # the bundle's ZKt(i): `i.subCommands.length>0 || ...`.
                        # Missing → TypeError → "Something went wrong" boundary.
                        command_statuses.append({
                            "id": f"cmd-{step_index}",
                            "index": step_index,
                            "description": desc,
                            "status": status,
                            "timestamp": ts,
                            "command": desc,
                            "subCommands": [],
                            "subOnStartCommands": [],
                            "subOnCompleteCommands": [],
                        })
                        step_index += 1

                    yield _flow_event(
                        "RUNNING",
                        commandStatuses=command_statuses,
                        originalCommands=_build_original_commands(
                            command_statuses, start_lines, flow_done=False
                        ),
                        qamindStartLines=start_lines,
                    )

            # Await the task result. The runner now puts the sentinel AFTER
            # its cleanup, so by the time we read None the task is essentially
            # done — but keep a generous timeout as a backstop in case any
            # cleanup step (force-stop, forward remove, etc.) is slow on a
            # given device.
            try:
                ok, err = await asyncio.wait_for(test_task, timeout=15)
            except asyncio.TimeoutError:
                ok, err = False, "Result timeout (task did not finalize in 15s after sentinel)"
            except Exception as e:
                ok, err = False, str(e)

            # Mark any leftover RUNNING steps as FAILED if the overall run failed
            if not ok:
                for cs in command_statuses:
                    if cs.get("status") == "RUNNING":
                        cs["status"] = "FAILED"

            final_status = "COMPLETED" if ok else "FAILED"
            state.mss_flows[flowId]["status"] = final_status
            state.mss_flows[flowId]["error"] = err if not ok else None

            if not ok:
                logger.error(f"[SSE flow={flowId[:8]}] FAILED: {err[:500] if err else 'no error message'}")
            else:
                logger.info(f"[SSE flow={flowId[:8]}] COMPLETED ({len(command_statuses)} steps)")

            extra: dict = {
                "commandStatuses": command_statuses,
                "originalCommands": _build_original_commands(
                    command_statuses, start_lines, flow_done=True
                ),
                "qamindStartLines": start_lines,
            }
            if not ok and err:
                extra["error"] = err
            yield _flow_event(final_status, **extra)

        except Exception as e:
            state.mss_flows[flowId]["status"] = "FAILED"
            state.mss_flows[flowId]["error"] = str(e)
            yield _flow_event(
                "FAILED",
                error=str(e),
                commandStatuses=command_statuses,
                originalCommands=_build_original_commands(
                    command_statuses, start_lines, flow_done=True
                ),
                qamindStartLines=start_lines,
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/mss/api/devices/stopFlow")
async def mss_stop_flow(body: dict):
    return {"success": True}


@router.post("/mss/api/devices/pauseFlow")
async def mss_pause_flow(body: dict):
    return {"success": True}


@router.post("/mss/api/devices/resumeFlow")
async def mss_resume_flow(body: dict):
    return {"success": True}


@router.post("/mss/api/devices/connected/disconnect")
async def mss_disconnect():
    return {"success": True}
