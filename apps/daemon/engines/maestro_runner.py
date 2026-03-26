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


async def _verify_adb_connection(udid: str) -> bool:
    """Verify ADB can communicate with the device. Returns True if healthy."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'shell', 'echo', 'ok',
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        return proc.returncode == 0 and 'ok' in stdout.decode('utf-8', errors='replace')
    except Exception:
        return False


async def _restart_adb_and_reconnect(udid: str):
    """Restart ADB server and wait for device to come back online."""
    logger.info(f"[MAESTRO] Restarting ADB server to recover connection for {udid}")
    kill_proc = await asyncio.create_subprocess_exec(
        'adb', 'kill-server',
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await kill_proc.wait()
    await asyncio.sleep(2)

    start_proc = await asyncio.create_subprocess_exec(
        'adb', 'start-server',
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await start_proc.wait()
    await asyncio.sleep(2)

    # Wait for device to be reachable (up to 15s)
    for _ in range(5):
        if await _verify_adb_connection(udid):
            logger.info(f"[MAESTRO] Device {udid} reconnected after ADB restart")
            return
        await asyncio.sleep(3)
    logger.warning(f"[MAESTRO] Device {udid} not reachable after ADB restart")


async def _ensure_device_ready(udid: str):
    """
    Full pre-flight check before Maestro execution:
    1. Verify ADB connection (restart if needed)
    2. Stop UIAutomator2 and competing services
    3. Kill leftover Maestro agents
    4. Clean up stale port forwards
    5. Set up fresh port forward for dadb (tcp:7001)
    """
    # ── Step 0: Verify ADB is alive ──────────────────────────────────
    if not await _verify_adb_connection(udid):
        await _restart_adb_and_reconnect(udid)

    # ── Step 1: Force stop u2 apps ───────────────────────────────────
    for pkg in ['com.github.uiautomator', 'com.github.uiautomator.test',
                 'io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test']:
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'shell', 'am', 'force-stop', pkg,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    # ── Step 2: Kill lingering uiautomator and atx-agent processes ───
    for pattern in ['uiautomator', 'atx-agent']:
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'shell', 'pkill', '-f', pattern,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    # ── Step 3: Kill Maestro agent from previous session ─────────────
    for maestro_pkg in ['dev.mobile.maestro', 'maestro.mobile.dev']:
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', udid, 'shell', 'am', 'force-stop', maestro_pkg,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    # ── Step 4: Clean up non-scrcpy port forwards ────────────────────
    proc = await asyncio.create_subprocess_exec(
        'adb', '-s', udid, 'forward', '--list',
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    for fwd_line in stdout.decode('utf-8', errors='replace').strip().split('\n'):
        fwd_line = fwd_line.strip()
        if not fwd_line or 'scrcpy' in fwd_line:
            continue
        parts = fwd_line.split()
        if len(parts) >= 2:
            local_spec = parts[1]
            rm_proc = await asyncio.create_subprocess_exec(
                'adb', '-s', udid, 'forward', '--remove', local_spec,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await rm_proc.wait()

    # ── Step 5: Disconnect device_manager u2 connection ──────────────
    try:
        from android.device_manager import device_manager_instance
        if udid in device_manager_instance.connections:
            del device_manager_instance.connections[udid]
            logger.info(f"[MAESTRO] Disconnected u2 from device_manager for {udid}")
    except Exception:
        pass

    # ── Step 6: Set up fresh port forward for dadb (tcp:7001) ────────
    ensure_port_forward(udid, port=7001)

    logger.info(f"[MAESTRO] Device {udid} ready for Maestro execution")
    await asyncio.sleep(3)  # Give Android time to release UiAutomation


def _is_driver_timeout(output: str) -> bool:
    """Check if Maestro failed due to Android driver startup timeout."""
    return 'MaestroDriverStartupException' in output or 'did not start up in time' in output


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

    all_output_lines = []

    async for raw_line in process.stdout:
        line = raw_line.decode('utf-8', errors='replace').strip()
        if not line:
            continue

        all_output_lines.append(line)

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

    # If process failed and we didn't capture a specific failed line,
    # check all output for driver timeout errors
    if code != 0 and not last_failed_line:
        full_output = '\n'.join(all_output_lines)
        if _is_driver_timeout(full_output):
            last_failed_line = full_output

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
        find_selector_in_element_map, extract_keywords_from_selector,
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
    log_manager.execution(
        f"[SMART_RETRY] Passo falhou | Seletor original: '{failed_selector}' | App: {app_id}",
        run_id=run_id,
    )

    # ── Step -1: Element Map consultation (PRIORIDADE MÁXIMA) ────────
    # Consulta o mapa de elementos escaneado do projeto ANTES de qualquer
    # tentativa no device — esses IDs e hints já foram confirmados no app real.
    try:
        from pathlib import Path as _PMap
        yaml_parts = _PMap(yaml_path).parts
        _project_id_from_path = ""
        for _i, _part in enumerate(yaml_parts):
            if _part == "flows" and _i + 1 < len(yaml_parts):
                _candidate = yaml_parts[_i + 1]
                if _candidate != "runs":
                    _project_id_from_path = _candidate
                break

        if _project_id_from_path:
            from android.element_scanner import load_element_map
            _emap = load_element_map(_project_id_from_path)
            if _emap:
                _em_total = _emap.get("stats", {}).get("elements_found", "?")
                _em_alts = find_selector_in_element_map(failed_selector, _emap)
                log_manager.execution(
                    f"[SMART_RETRY] ══ FASE -1: Element Map ({_em_total} elementos escaneados) ══",
                    run_id=run_id,
                )
                log_manager.execution(
                    f"[SMART_RETRY] Palavras-chave extraídas: {extract_keywords_from_selector(failed_selector)}",
                    run_id=run_id,
                )
                if _em_alts:
                    log_manager.execution(
                        f"[SMART_RETRY] {len(_em_alts)} candidatos encontrados no element_map:",
                        run_id=run_id,
                    )
                    for _ea in _em_alts[:5]:
                        log_manager.execution(
                            f"[SMART_RETRY]   [{_ea['strategy']}] '{_ea['selector']}' (tela: {_ea.get('screen','?')}, confiança: {_ea['confidence']})",
                            run_id=run_id,
                        )
                    await ws_broadcaster.broadcast(RunEvent(
                        type=EventType.STEP_STARTED, run_id=run_id,
                        data={"type": "maestro_log",
                              "line": f"[SMART_RETRY] Element Map: {len(_em_alts)} candidatos para '{failed_selector}'",
                              "engine": "maestro"},
                    ))
                    # Test each element_map candidate
                    _maestro_bin_em = get_maestro_binary()
                    _env_em = {**os.environ, 'ANDROID_SERIAL': udid}
                    for _ea in _em_alts[:max_tries]:
                        _ea_sel = _ea["selector"]
                        _ea_strat = _ea["strategy"]
                        _ea_screen = _ea.get("screen", "?")
                        _failed_upper = failed_line.upper()
                        if 'ASSERT' in _failed_upper or 'VISIBLE' in _failed_upper:
                            if 'id' in _ea_strat:
                                _probe_cmd = f'- extendedWaitUntil:\n    visible:\n      id: "{_ea_sel}"\n    timeout: 5000'
                            else:
                                _probe_cmd = f'- extendedWaitUntil:\n    visible: "{_ea_sel}"\n    timeout: 5000'
                        else:
                            _probe_cmd = _ea.get("maestro_command", f'- tapOn: "{_ea_sel}"')

                        _probe_yaml = f"appId: {app_id}\n---\n{_probe_cmd}\n"
                        _probe_path = yaml_path.replace('.yaml', '_emprobe.yaml')
                        P(_probe_path).write_text(_probe_yaml, encoding='utf-8')

                        _proc = await asyncio.create_subprocess_exec(
                            _maestro_bin_em, 'test', _probe_path,
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                            env=_env_em,
                        )
                        async for _ in _proc.stdout:
                            pass
                        _pcode = await _proc.wait()
                        P(_probe_path).unlink(missing_ok=True)

                        log_manager.execution(
                            f"[SMART_RETRY] Element Map probe: {_ea_strat}='{_ea_sel}' (tela: {_ea_screen}) → {'✓ PASSOU' if _pcode == 0 else '✗ falhou'}",
                            run_id=run_id,
                        )
                        await ws_broadcaster.broadcast(RunEvent(
                            type=EventType.STEP_STARTED, run_id=run_id,
                            data={"type": "maestro_log",
                                  "line": f"[ELEMENT_MAP] {_ea_strat} → '{_ea_sel}': {'✓' if _pcode == 0 else '✗'}",
                                  "engine": "maestro"},
                        ))

                        if _pcode == 0:
                            _corrected = _replace_failed_command_in_yaml(
                                yaml_path, failed_selector, _ea["maestro_command"], failed_line
                            )
                            if _corrected:
                                _corrected_path = yaml_path.replace('.yaml', '_corrected.yaml')
                                P(_corrected_path).write_text(_corrected, encoding='utf-8')
                                log_manager.execution(
                                    f"[SMART_RETRY] ✓ Element Map resolveu! {_ea_strat}='{_ea_sel}' → YAML corrigido",
                                    run_id=run_id,
                                )
                                return _corrected_path
                else:
                    log_manager.execution(
                        f"[SMART_RETRY] Element Map: nenhum candidato encontrado para '{failed_selector}'",
                        run_id=run_id,
                    )
            else:
                log_manager.execution(
                    f"[SMART_RETRY] Element Map: projeto '{_project_id_from_path}' não tem mapa (execute 'Ler Aplicação')",
                    run_id=run_id,
                )
        else:
            log_manager.execution(
                f"[SMART_RETRY] Element Map: não foi possível extrair project_id de '{yaml_path}'",
                run_id=run_id,
            )
    except Exception as _em_err:
        log_manager.execution(
            f"[SMART_RETRY] Element Map: erro na consulta: {_em_err}",
            run_id=run_id, level="WARN",
        )

    # ── Step 0: Quick hint/placeholder expansion ─────────────────────
    log_manager.execution(
        f"[SMART_RETRY] ══ FASE 0: expansões rápidas de placeholder ══",
        run_id=run_id,
    )
    # If the failed selector is a generic word like "email" or "senha",
    # try common placeholder variants BEFORE doing a full hierarchy dump.
    # Also extract keywords from compound phrases ("email pelo resource-id" → "email")
    _HINT_EXPANSIONS = {
        "email": ["Digite seu e-mail", "Digite seu email", "E-mail", "Email"],
        "e-mail": ["Digite seu e-mail", "E-mail"],
        "senha": ["Digite sua senha", "Senha", "Password"],
        "password": ["Digite sua senha", "Senha"],
        "busca": ["Buscar", "Pesquisar", "Busque seu produto"],
        "pesquisa": ["Pesquisar", "Buscar"],
        "nome": ["Digite seu nome", "Nome completo", "Nome"],
        "telefone": ["Digite seu telefone", "Telefone", "Celular"],
        "cpf": ["Digite seu CPF", "CPF"],
        "entrar": ["Entrar", "Login", "Acessar"],
        "login": ["Entrar", "Login", "Acessar"],
    }
    sel_lower = failed_selector.lower().strip()
    hint_variants = _HINT_EXPANSIONS.get(sel_lower, [])

    # If no direct match, try individual keywords from compound selector
    # e.g. "email pelo resource-id" → keyword "email" → expansions for "email"
    if not hint_variants:
        _kws = extract_keywords_from_selector(failed_selector)
        log_manager.execution(
            f"[SMART_RETRY] Seletor composto detectado → palavras-chave: {_kws}",
            run_id=run_id,
        )
        for _kw in _kws:
            if _kw in _HINT_EXPANSIONS:
                hint_variants = _HINT_EXPANSIONS[_kw]
                log_manager.execution(
                    f"[SMART_RETRY] Expansão por keyword '{_kw}': {hint_variants}",
                    run_id=run_id,
                )
                break
    if hint_variants:
        maestro_bin_hint = get_maestro_binary()
        env_hint = {**os.environ, 'ANDROID_SERIAL': udid}
        for variant in hint_variants:
            if variant.lower() == sel_lower:
                continue  # skip if same as original
            logger.info(f"[SMART_RETRY] Quick hint try: '{failed_selector}' -> '{variant}'")
            await ws_broadcaster.broadcast(RunEvent(
                type=EventType.STEP_STARTED, run_id=run_id,
                data={"type": "maestro_log", "line": f"[IA] Tentativa rapida: \"{variant}\"", "engine": "maestro"},
            ))
            # Build minimal YAML probe
            failed_upper = failed_line.upper()
            if 'ASSERT' in failed_upper or 'VISIBLE' in failed_upper:
                probe_cmd = f'- extendedWaitUntil:\n    visible: "{variant}"\n    timeout: 5000'
            else:
                probe_cmd = f'- tapOn: "{variant}"'
            probe_yaml = f"appId: {app_id}\n---\n{probe_cmd}\n"
            probe_path = yaml_path.replace('.yaml', '_hint_probe.yaml')
            P(probe_path).write_text(probe_yaml, encoding='utf-8')
            proc = await asyncio.create_subprocess_exec(
                maestro_bin_hint, 'test', probe_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env_hint,
            )
            async for _ in proc.stdout:
                pass
            hint_code = await proc.wait()
            P(probe_path).unlink(missing_ok=True)

            if hint_code == 0:
                logger.info(f"[SMART_RETRY] Hint expansion worked: '{failed_selector}' -> '{variant}'")
                corrected = _replace_failed_command_in_yaml(
                    yaml_path, failed_selector,
                    f'- tapOn: "{variant}"' if 'ASSERT' not in failed_upper else f'- extendedWaitUntil:\n    visible: "{variant}"\n    timeout: 8000',
                    failed_line,
                )
                if corrected:
                    corrected_path = yaml_path.replace('.yaml', '_corrected.yaml')
                    P(corrected_path).write_text(corrected, encoding='utf-8')
                    return corrected_path

    # ── Step 1: Full UI hierarchy dump ───────────────────────────────
    log_manager.execution(
        f"[SMART_RETRY] ══ FASE 1: dump hierarquia UI ao vivo do device ══",
        run_id=run_id,
    )
    xml_content = dump_ui_hierarchy(udid)
    elements = extract_all_selectors_from_xml(xml_content)
    logger.info(f"[SMART_RETRY] {len(elements)} elementos UI encontrados")
    log_manager.execution(
        f"[SMART_RETRY] {len(elements)} elementos encontrados na hierarquia UI atual",
        run_id=run_id,
    )

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
    if not alternatives:
        log_manager.execution(
            f"[SMART_RETRY] Hierarquia UI: nenhum elemento correspondente a '{failed_selector}'",
            run_id=run_id,
        )
    if not alternatives and anthropic_client:
        log_manager.execution(
            f"[SMART_RETRY] ══ FASE 2: Claude Vision (screenshot do device) ══",
            run_id=run_id,
        )
        screenshot_b64 = capture_screenshot_base64(udid)
        if screenshot_b64:
            vision_alt = await _ask_vision_for_selector(
                anthropic_client, screenshot_b64, failed_selector, xml_content
            )
            if vision_alt:
                alternatives = [vision_alt]
                log_manager.execution(
                    f"[SMART_RETRY] Vision sugeriu: {vision_alt.get('strategy')}='{vision_alt.get('selector')}'",
                    run_id=run_id,
                )

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


async def _execute_with_driver_retry(
    yaml_path: str,
    udid: str,
    run_id: str,
    env_vars: dict[str, str],
    ws_broadcaster: WebSocketServer,
    max_driver_retries: int = 3,
) -> tuple[int, int, str]:
    """
    Execute Maestro YAML with automatic retry on driver timeout.
    On each timeout: restart ADB, re-prepare device, try again.
    """
    for attempt in range(1, max_driver_retries + 1):
        code, step_count, last_failed_line = await _execute_maestro_yaml(
            yaml_path, udid, run_id, env_vars, ws_broadcaster
        )

        # Check if it was a driver timeout (not a test failure)
        if code != 0 and _is_driver_timeout(last_failed_line):
            if attempt < max_driver_retries:
                log_manager.execution(
                    f"[MAESTRO] Driver timeout (attempt {attempt}/{max_driver_retries}). "
                    f"Restarting ADB and retrying...",
                    run_id=run_id,
                )
                await ws_broadcaster.broadcast(RunEvent(
                    type=EventType.STEP_STARTED,
                    run_id=run_id,
                    data={
                        "type": "maestro_log",
                        "line": f"[INFRA] Timeout na conexao com emulador (tentativa {attempt}/{max_driver_retries}). Reiniciando ADB...",
                        "engine": "maestro",
                    },
                ))
                await _restart_adb_and_reconnect(udid)
                await _ensure_device_ready(udid)
                continue
            else:
                log_manager.execution(
                    f"[MAESTRO] Driver timeout persists after {max_driver_retries} attempts.",
                    run_id=run_id,
                )

        return code, step_count, last_failed_line

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
    test_case_id: str = "",
):
    """
    Execute a Maestro YAML flow with AI-powered smart retry.

    Flow:
    1. Prepare device (verify ADB, stop u2, clean ports, set up forwarding)
    2. Run Maestro YAML (with automatic retry on driver timeout)
    3. If a step fails with "element not found":
       a. Dump UI hierarchy from device
       b. Search alternative selectors (semantics id > resource-id > text > ...)
       c. Optionally use Claude Vision for screenshot analysis
       d. Generate corrected YAML and re-execute
    4. Update test case status in Supabase
    """
    await _ensure_device_ready(udid)

    masked_vars = {k: '***' for k in env_vars}
    log_manager.execution(
        f"═══════════════════════════════════════",
        run_id=run_id,
    )
    log_manager.execution(
        f"[MAESTRO] Execução iniciada | Device: {udid} | Total passos: {total_steps} | Max retries: {max_retries}",
        run_id=run_id,
    )
    log_manager.execution(
        f"[MAESTRO] YAML: {yaml_path} | Env vars: {list(masked_vars.keys()) or 'nenhum'}",
        run_id=run_id,
    )

    # Log YAML content for full transparency
    try:
        yaml_content = Path(yaml_path).read_text(encoding='utf-8')
        log_manager.execution(f"[MAESTRO] Conteúdo do YAML a executar:", run_id=run_id)
        for i, line in enumerate(yaml_content.splitlines(), 1):
            log_manager.execution(f"  {i:>3} | {line}", run_id=run_id)
    except Exception as _e:
        log_manager.execution(f"[MAESTRO] Não foi possível ler YAML: {_e}", run_id=run_id, level="WARN")

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
        # Execute with automatic retry on driver timeout
        code, step_count, last_failed_line = await _execute_with_driver_retry(
            yaml_path, udid, run_id, env_vars, ws_broadcaster,
            max_driver_retries=3,
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
                "test_case_id": test_case_id,
            },
        ))

        # Update test case status in Supabase
        if test_case_id:
            await _update_test_case_status(test_case_id, status)

    except Exception as e:
        logger.error(f"Maestro execution error for run {run_id}: {e}")
        log_manager.execution(f"[MAESTRO] Exception: {e}", run_id=run_id)
        await ws_broadcaster.broadcast(RunEvent(
            type=EventType.RUN_FAILED,
            run_id=run_id,
            data={"status": "failed", "engine": "maestro", "error": str(e), "test_case_id": test_case_id},
        ))
        if test_case_id:
            await _update_test_case_status(test_case_id, "failed")


async def _update_test_case_status(test_case_id: str, status: str):
    """Update test case status and last_run_at in Supabase after execution."""
    try:
        import httpx
        from datetime import datetime, timezone

        supabase_url = os.environ.get("SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")
        if not supabase_url or not supabase_key:
            return

        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        body = {
            "status": status,
            "last_run_at": datetime.now(timezone.utc).isoformat(),
        }
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.patch(
                f"{supabase_url}/rest/v1/test_cases?id=eq.{test_case_id}",
                headers=headers,
                json=body,
                timeout=10,
            )
        if resp.status_code in (200, 204):
            logger.info(f"[MAESTRO] Test case {test_case_id} status updated to '{status}'")
        else:
            logger.warning(f"[MAESTRO] Failed to update test case status ({resp.status_code}): {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[MAESTRO] Failed to update test case status: {e}")


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
