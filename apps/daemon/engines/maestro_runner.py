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
from engines.maestro_smart_retry import SELECTOR_PRIORITY

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

        # 2. Kill any lingering uiautomator and atx-agent processes on device
        for pattern in ['uiautomator', 'atx-agent']:
            proc = await asyncio.create_subprocess_exec(
                'adb', '-s', udid, 'shell', 'pkill', '-f', pattern,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()

        # 3. Remove u2-related adb port forwards, but KEEP scrcpy forwards
        #    (--remove-all would kill scrcpy mirroring causing a black screen)
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'forward', '--list',
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        for fwd_line in stdout.decode('utf-8', errors='replace').strip().split('\n'):
            fwd_line = fwd_line.strip()
            if not fwd_line:
                continue
            # Each line: "<serial> tcp:<local_port> <remote>"
            # Keep scrcpy forwards (localabstract:scrcpy_*)
            if 'scrcpy' in fwd_line:
                continue
            parts = fwd_line.split()
            if len(parts) >= 2:
                local_spec = parts[1]  # e.g. "tcp:9008"
                rm_proc = await asyncio.create_subprocess_exec(
                    'adb', '-s', udid, 'forward', '--remove', local_spec,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                )
                await rm_proc.wait()

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

    # Set ANDROID_SERIAL so Maestro/dadb targets the correct device
    env = {**os.environ, 'ANDROID_SERIAL': udid}

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
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


async def _try_selectors_on_device(
    failed_line: str,
    yaml_path: str,
    udid: str,
    run_id: str,
    ws_broadcaster: WebSocketServer,
    anthropic_client=None,
    max_tries: int = 6,
) -> Optional[str]:
    """
    Testa alternativas de seletor para o passo que falhou diretamente no estado
    atual do device, sem re-executar o flow inteiro (sem re-lançar o app).

    Gera um YAML mínimo de 1 passo para cada alternativa e testa na ordem:
    semantics_id > resource_id > text_exact > placeholder > content_desc > coordinates.

    Retorna o path do YAML corrigido se encontrar um seletor que funciona, ou None.
    """
    import subprocess as _sp
    from pathlib import Path as P
    from engines.maestro_smart_retry import (
        dump_ui_hierarchy, extract_all_selectors_from_xml,
        find_alternative_selectors, capture_screenshot_base64,
        _ask_vision_for_selector, _replace_failed_command_in_yaml,
    )

    # Extrai o seletor que falhou da linha de log do Maestro
    failed_selector = ""
    m = re.search(r'"([^"]+)"', failed_line)
    if m:
        failed_selector = m.group(1)
    if not failed_selector:
        logger.info(f"[SMART_RETRY] Não foi possível extrair seletor de: {failed_line}")
        return None

    # Descobre o appId no YAML original
    yaml_content = P(yaml_path).read_text(encoding='utf-8')
    app_id_m = re.search(r'^appId:\s*(\S+)', yaml_content, re.MULTILINE)
    app_id = app_id_m.group(1) if app_id_m else "com.app.unknown"

    logger.info(f"[SMART_RETRY] Buscando alternativas para seletor '{failed_selector}' no device atual")

    # 1. Dump UI hierarchy e extrai alternativas
    xml_content = dump_ui_hierarchy(udid)
    elements = extract_all_selectors_from_xml(xml_content)
    logger.info(f"[SMART_RETRY] {len(elements)} elementos UI encontrados")

    try:
        size_res = _sp.run(
            ['adb', '-s', udid, 'shell', 'wm', 'size'],
            capture_output=True, text=True, timeout=5,
        )
        size_m = re.search(r'(\d+)x(\d+)', size_res.stdout)
        screen_w = int(size_m.group(1)) if size_m else 1080
        screen_h = int(size_m.group(2)) if size_m else 2400
    except Exception:
        screen_w, screen_h = 1080, 2400

    alternatives = find_alternative_selectors(failed_selector, elements, screen_w, screen_h)

    # 2. Fallback: Claude Vision se não achou nada na hierarquia
    if not alternatives and anthropic_client:
        screenshot_b64 = capture_screenshot_base64(udid)
        if screenshot_b64:
            vision_alt = await _ask_vision_for_selector(
                anthropic_client, screenshot_b64, failed_selector, xml_content
            )
            if vision_alt:
                alternatives = [vision_alt]

    if not alternatives:
        logger.info(f"[SMART_RETRY] Nenhuma alternativa encontrada para '{failed_selector}'")
        return None

    maestro_bin = get_maestro_binary()
    env = {**os.environ, 'ANDROID_SERIAL': udid}
    failed_upper = failed_line.upper()

    probe_paths = []

    for i, alt in enumerate(alternatives[:max_tries]):
        sel_val_m = re.search(r'"([^"]+)"', alt.get("maestro_command", ""))
        sel_str = sel_val_m.group(1) if sel_val_m else alt.get("selector", "")
        strategy = alt.get("strategy", "?")

        await ws_broadcaster.broadcast(RunEvent(
            type=EventType.STEP_STARTED,
            run_id=run_id,
            data={
                "type": "maestro_log",
                "line": f"[IA] Tentativa {i+1}/{min(len(alternatives), max_tries)}: {strategy} → \"{sel_str}\"",
                "engine": "maestro",
            },
        ))
        log_manager.execution(
            f"[SMART_RETRY] Tentativa {i+1}: strategy={strategy}, selector='{sel_str}'",
            run_id=run_id,
        )

        # Monta YAML mínimo — apenas o comando que falhou com o novo seletor
        if 'ASSERT' in failed_upper or 'VISIBLE' in failed_upper:
            if strategy in ("semantics_id", "resource_id"):
                minimal_cmd = (
                    f'- extendedWaitUntil:\n'
                    f'    visible:\n'
                    f'      id: "{sel_str}"\n'
                    f'    timeout: 10000'
                )
            else:
                minimal_cmd = (
                    f'- extendedWaitUntil:\n'
                    f'    visible:\n'
                    f'      text: "{sel_str}"\n'
                    f'    timeout: 10000'
                )
        else:
            minimal_cmd = alt.get("maestro_command", f'- tapOn: "{sel_str}"')

        minimal_yaml = f"appId: {app_id}\n---\n{minimal_cmd}\n"
        probe_path = yaml_path.replace('.yaml', f'_probe{i+1}.yaml')
        probe_paths.append(probe_path)
        P(probe_path).write_text(minimal_yaml, encoding='utf-8')

        proc = await asyncio.create_subprocess_exec(
            maestro_bin, 'test', probe_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        async for _ in proc.stdout:
            pass  # drena output sem processar
        probe_code = await proc.wait()

        if probe_code == 0:
            # Seletor alternativo funciona — gera YAML corrigido
            log_manager.execution(
                f"[SMART_RETRY] Seletor encontrado: {strategy} = '{sel_str}'",
                run_id=run_id,
            )
            await ws_broadcaster.broadcast(RunEvent(
                type=EventType.STEP_STARTED,
                run_id=run_id,
                data={
                    "type": "maestro_log",
                    "line": f"[IA] Seletor alternativo encontrado: {strategy} = \"{sel_str}\"",
                    "engine": "maestro",
                },
            ))
            corrected = _replace_failed_command_in_yaml(
                yaml_path, failed_selector, alt["maestro_command"], failed_line
            )
            # Limpa probes
            for pp in probe_paths:
                try:
                    P(pp).unlink(missing_ok=True)
                except Exception:
                    pass
            if corrected:
                corrected_path = yaml_path.replace('.yaml', '_corrected.yaml')
                P(corrected_path).write_text(corrected, encoding='utf-8')
                return corrected_path
            return None

    # Limpa probes ao sair sem sucesso
    for pp in probe_paths:
        try:
            P(pp).unlink(missing_ok=True)
        except Exception:
            pass

    return None


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

    try:
        # Executa o flow UMA única vez
        code, step_count, last_failed_line = await _execute_maestro_yaml(
            yaml_path, udid, run_id, env_vars, ws_broadcaster
        )

        corrected_path = None

        if code != 0 and last_failed_line:
            # Verifica se é erro de elemento (retentável) ou erro de infra (parar já)
            is_element_error = any(
                kw in last_failed_line.upper()
                for kw in ['NOT FOUND', 'NOT VISIBLE', 'NO VISIBLE', 'ASSERTION']
            )

            if is_element_error:
                # Tenta alternativas de seletor NO ESTADO ATUAL do device
                # SEM re-executar o flow inteiro (sem re-lançar o app)
                await ws_broadcaster.broadcast(RunEvent(
                    type=EventType.STEP_STARTED,
                    run_id=run_id,
                    data={
                        "type": "maestro_log",
                        "line": f"[IA] Passo falhou — buscando seletores alternativos (até {max_retries} tentativas)...",
                        "engine": "maestro",
                    },
                ))

                corrected_path = await _try_selectors_on_device(
                    failed_line=last_failed_line,
                    yaml_path=yaml_path,
                    udid=udid,
                    run_id=run_id,
                    ws_broadcaster=ws_broadcaster,
                    anthropic_client=anthropic_client,
                    max_tries=max_retries,
                )

                if corrected_path:
                    log_manager.execution(
                        f"[SMART_RETRY] Seletor corrigido disponível: {corrected_path}. "
                        f"Re-execute o teste para confirmar.",
                        run_id=run_id,
                    )
                else:
                    log_manager.execution(
                        f"[SMART_RETRY] Nenhum seletor alternativo encontrado. Teste falhou definitivamente.",
                        run_id=run_id,
                    )

        # Status final — para imediatamente após tentativas de seletor
        status = "passed" if code == 0 else "failed"
        log_manager.execution(
            f"[MAESTRO] Exit code: {code} | Status: {status}",
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
                "corrected_yaml": corrected_path,
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
