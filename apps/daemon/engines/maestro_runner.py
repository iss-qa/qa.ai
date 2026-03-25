"""
Maestro execution engine.

Runs Maestro YAML flows on a connected device via the CLI,
streaming output to the frontend via WebSocket.

When a step fails, the AI Smart Retry system kicks in:
1. Dumps the UI hierarchy from the device
2. Searches for alternative selectors (semantics id > resource-id > text > placeholder > coordinates)
3. Optionally uses Claude Vision to analyze the screenshot
4. Generates a corrected YAML and re-executes
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Optional

from ws.server import WebSocketServer
from ws.events import EventType
from models.run_event import RunEvent
from log_manager import log_manager
from routes.engines import ensure_port_forward, get_maestro_binary
from engines.maestro_smart_retry import (
    smart_retry_failed_step,
    dump_ui_hierarchy,
    extract_all_selectors_from_xml,
    find_alternative_selectors,
    SELECTOR_PRIORITY,
)

logger = logging.getLogger("maestro_runner")

# Directory for generated YAML flows
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
FLOWS_DIR = PROJECT_ROOT / "flows"


def parse_maestro_line(line: str, run_id: str) -> Optional[RunEvent]:
    """
    Parse Maestro CLI output into WebSocket events.
    Checks BOTH emoji and text keywords as fallback
    because emoji rendering depends on terminal locale.
    """
    line_upper = line.upper()

    is_success = '\u2705' in line or 'COMPLETED' in line_upper or 'PASSED' in line_upper
    is_failure = '\u274c' in line or 'FAILED' in line_upper or 'NOT FOUND' in line_upper
    is_running = line.strip().startswith('- ') or 'RUNNING' in line_upper or '\u25b6' in line

    if is_success:
        return RunEvent(
            type=EventType.STEP_COMPLETED,
            run_id=run_id,
            data={"message": line, "engine": "maestro"},
        )
    elif is_failure:
        # Check for element not found for debug hint
        data = {"message": line, "engine": "maestro"}
        if 'NOT FOUND' in line_upper or 'NO VISIBLE ELEMENTS' in line_upper:
            data["debug_hint"] = (
                "Dica: Abra o Maestro Studio para inspecionar os elementos na tela. "
                "Execute: maestro studio"
            )
        return RunEvent(
            type=EventType.STEP_FAILED,
            run_id=run_id,
            data=data,
        )
    elif is_running:
        return RunEvent(
            type=EventType.STEP_STARTED,
            run_id=run_id,
            data={"message": line, "engine": "maestro"},
        )

    return None


async def _stop_uiautomator2(udid: str):
    """
    Aggressively stop UIAutomator2 to free UiAutomation for Maestro.
    Android only allows ONE UiAutomation connection at a time.
    We must kill ALL u2 processes and remove port forwards.
    """
    try:
        # 1. Force stop u2 apps
        for pkg in ['com.github.uiautomator', 'com.github.uiautomator.test',
                     'io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test']:
            proc = await asyncio.create_subprocess_exec(
                'adb', '-s', udid, 'shell', 'am', 'force-stop', pkg,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()

        # 2. Kill any lingering uiautomator processes on device
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'shell', 'pkill', '-f', 'uiautomator',
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

        # 3. Remove ALL adb port forwards (Maestro will set up its own)
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'forward', '--remove-all',
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

        # 4. Disconnect device_manager u2 connection
        try:
            from android.device_manager import device_manager_instance
            if udid in device_manager_instance.connections:
                del device_manager_instance.connections[udid]
                logger.info(f"[MAESTRO] Disconnected u2 from device_manager for {udid}")
        except Exception:
            pass

        logger.info(f"[MAESTRO] UIAutomator2 fully stopped on {udid}")
        await asyncio.sleep(2)  # Give Android time to release UiAutomation
    except Exception as e:
        logger.warning(f"[MAESTRO] Failed to stop u2: {e}")


async def _execute_maestro_yaml(
    yaml_path: str,
    udid: str,
    run_id: str,
    env_vars: dict[str, str],
    ws_broadcaster: WebSocketServer,
) -> tuple[int, int, str]:
    """
    Run a single Maestro execution. Returns (exit_code, step_count, last_failed_line).
    """
    maestro_bin = get_maestro_binary()
    cmd = [maestro_bin, 'test']
    for key, value in env_vars.items():
        cmd += ['--env', f'{key}={value}']
    cmd.append(yaml_path)

    step_count = 0
    last_failed_line = ""

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    async for raw_line in process.stdout:
        line = raw_line.decode('utf-8', errors='replace').strip()
        if not line:
            continue

        # Broadcast raw log
        await ws_broadcaster.broadcast(RunEvent(
            type=EventType.STEP_STARTED,
            run_id=run_id,
            data={"type": "maestro_log", "line": line, "engine": "maestro"},
        ))
        log_manager.execution(f"[MAESTRO] {line}", run_id=run_id)

        # Parse step status
        event = parse_maestro_line(line, run_id)
        if event:
            if event.type == EventType.STEP_COMPLETED:
                step_count += 1
                event.data["step_num"] = step_count
            elif event.type == EventType.STEP_FAILED:
                step_count += 1
                event.data["step_num"] = step_count
                last_failed_line = line
            await ws_broadcaster.broadcast(event)

    code = await process.wait()
    return code, step_count, last_failed_line


async def run_with_maestro(
    yaml_path: str,
    udid: str,
    run_id: str,
    env_vars: dict[str, str],
    ws_broadcaster: WebSocketServer,
    total_steps: int = 0,
    max_retries: int = 3,
    anthropic_client=None,
):
    """
    Execute a Maestro YAML flow with AI-powered smart retry.

    Flow:
    1. Stop UIAutomator2 (conflicts with Maestro)
    2. Run Maestro YAML
    3. If a step fails with "element not found":
       a. Dump UI hierarchy from device
       b. Search alternative selectors (semantics id > resource-id > text > ...)
       c. Optionally use Claude Vision for screenshot analysis
       d. Generate corrected YAML and re-execute
    4. Repeat up to max_retries times
    """
    await _stop_uiautomator2(udid)

    masked_vars = {k: '***' for k in env_vars}
    log_manager.execution(
        f"Engine: MAESTRO | YAML: {yaml_path} | Env vars: {masked_vars} | Max retries: {max_retries}",
        run_id=run_id,
    )

    await ws_broadcaster.broadcast(RunEvent(
        type=EventType.RUN_STARTED,
        run_id=run_id,
        data={
            "engine": "maestro",
            "total_steps": total_steps,
            "yaml_path": yaml_path,
            "device_udid": udid,
        },
    ))

    current_yaml = yaml_path
    attempt = 0

    try:
        while attempt <= max_retries:
            attempt += 1

            if attempt > 1:
                # Broadcast retry notification
                await ws_broadcaster.broadcast(RunEvent(
                    type=EventType.STEP_RETRYING,
                    run_id=run_id,
                    data={
                        "engine": "maestro",
                        "attempt": attempt,
                        "message": f"[SMART RETRY] Tentativa {attempt}/{max_retries + 1} — IA corrigindo seletor...",
                        "yaml_path": current_yaml,
                    },
                ))
                log_manager.execution(
                    f"[SMART_RETRY] Attempt {attempt}/{max_retries + 1} with YAML: {current_yaml}",
                    run_id=run_id,
                )
                # Stop u2 again in case it restarted
                await _stop_uiautomator2(udid)

            code, step_count, last_failed_line = await _execute_maestro_yaml(
                current_yaml, udid, run_id, env_vars, ws_broadcaster
            )

            if code == 0:
                # All steps passed
                if attempt > 1:
                    log_manager.execution(
                        f"[SMART_RETRY] SUCCESS on attempt {attempt}! AI auto-corrected the selector.",
                        run_id=run_id,
                    )
                    await ws_broadcaster.broadcast(RunEvent(
                        type=EventType.STEP_COMPLETED,
                        run_id=run_id,
                        data={
                            "engine": "maestro",
                            "message": f"Smart Retry: SUCESSO na tentativa {attempt}! IA corrigiu o seletor automaticamente.",
                            "step_num": step_count,
                        },
                    ))
                break

            # Step failed — check if it's a retryable "element not found" error
            is_element_error = any(
                kw in last_failed_line.upper()
                for kw in ['NOT FOUND', 'NOT VISIBLE', 'NO VISIBLE', 'ASSERTION']
            )

            if not is_element_error or attempt > max_retries:
                # Not retryable or out of retries
                break

            # --- SMART RETRY: AI analyzes the screen and suggests alternatives ---
            log_manager.execution(
                f"[SMART_RETRY] Step failed: {last_failed_line}. Analyzing screen...",
                run_id=run_id,
            )

            await ws_broadcaster.broadcast(RunEvent(
                type=EventType.STEP_STARTED,
                run_id=run_id,
                data={
                    "type": "maestro_log",
                    "line": f"[IA] Analisando tela... Buscando seletor alternativo (tentativa {attempt}/{max_retries})",
                    "engine": "maestro",
                },
            ))

            corrected_path = await smart_retry_failed_step(
                failed_line=last_failed_line,
                yaml_path=current_yaml,
                udid=udid,
                run_id=run_id,
                anthropic_client=anthropic_client,
            )

            if corrected_path:
                current_yaml = corrected_path
                log_manager.execution(
                    f"[SMART_RETRY] Corrected YAML: {corrected_path}",
                    run_id=run_id,
                )
            else:
                log_manager.execution(
                    f"[SMART_RETRY] No alternative selector found. Giving up.",
                    run_id=run_id,
                )
                break

        # Final status
        status = "passed" if code == 0 else "failed"
        log_manager.execution(
            f"[MAESTRO] Exit code: {code} | Status: {status} | Attempts: {attempt}",
            run_id=run_id,
        )

        final_type = EventType.RUN_COMPLETED if code == 0 else EventType.RUN_FAILED
        await ws_broadcaster.broadcast(RunEvent(
            type=final_type,
            run_id=run_id,
            data={
                "status": status,
                "engine": "maestro",
                "exit_code": code,
                "total_steps": step_count,
                "retry_attempts": attempt,
            },
        ))

    except Exception as e:
        logger.error(f"Maestro execution error for run {run_id}: {e}")
        log_manager.execution(f"[MAESTRO] Exception: {e}", run_id=run_id)
        await ws_broadcaster.broadcast(RunEvent(
            type=EventType.RUN_FAILED,
            run_id=run_id,
            data={"status": "failed", "engine": "maestro", "error": str(e)},
        ))


def save_yaml_flow(project_id: str, test_name: str, yaml_content: str) -> str:
    """Save a Maestro YAML flow to disk and return the file path."""
    flow_dir = FLOWS_DIR / project_id
    flow_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize test name for filename
    safe_name = re.sub(r'[^\w\-]', '_', test_name).strip('_')
    if not safe_name:
        safe_name = "flow"

    file_path = flow_dir / f"{safe_name}.yaml"
    file_path.write_text(yaml_content, encoding='utf-8')
    logger.info(f"YAML saved: {file_path}")
    return str(file_path)
