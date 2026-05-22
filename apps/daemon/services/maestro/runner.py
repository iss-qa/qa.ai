import asyncio
import logging
import os
import re as _re
from typing import Optional

import httpx

import state
from services.maestro.studio import _ensure_embedded_maestro_studio

logger = logging.getLogger("maestro.runner")


async def _adb_shell(udid: str, *args: str, timeout: float = 3.0) -> int:
    """Run `adb -s UDID shell ARGS...` and return the exit code (or -1 on error)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", *args,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout)
        return proc.returncode or 0
    except Exception:
        return -1


def _strip_flow_header(yaml_content: str) -> str:
    """The Maestro Studio OSS `/api/run-command` expects the command list only —
    it rejects the `appId: ... ---` flow header with `appId is not a valid command`.
    The app identity is bound to the Maestro session at launch time
    (`maestro --device UDID studio`), so the header is redundant anyway."""
    s = yaml_content.lstrip()
    if "---" in s:
        head, _, rest = s.partition("---")
        # Only strip when the head is the appId/flow config block
        if "appId" in head or not head.strip():
            return rest.lstrip("\n")
    return s


def _extract_app_id_from_header(full_yaml: str) -> Optional[str]:
    """Pull `appId: com.example` out of the flow header (before `---`)."""
    head = full_yaml.split("---", 1)[0] if "---" in full_yaml else ""
    m = _re.search(r"appId\s*:\s*['\"]?([A-Za-z0-9_.]+)['\"]?", head)
    return m.group(1) if m else None


async def _adb_capture(udid: str, *args: str, timeout: float = 10.0) -> str:
    """Run `adb -s UDID shell ARGS...` and return stdout text."""
    try:
        p = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(p.communicate(), timeout=timeout)
        return out.decode("utf-8", errors="replace")
    except Exception:
        return ""


async def _resolve_launch(udid: str, app_id: str) -> tuple:
    """Return (userId, 'pkg/activity') for the given app, probing all users on
    the device. Xiaomi devices commonly sideload into user 10 (work profile)
    rather than user 0, so `monkey -p pkg` fails with 'No activities found'
    unless we pass --user <N>."""
    users_out = await _adb_capture(udid, "pm", "list", "users", timeout=5)
    users = []
    for line in users_out.splitlines():
        m = _re.search(r"UserInfo\{(\d+):[^}]*\}\s+running", line)
        if m:
            users.append(int(m.group(1)))
    if not users:
        users = [0]
    # Probe user 0 first, then any others
    ordered = [0] + [u for u in users if u != 0]
    for uid in ordered:
        out = await _adb_capture(udid, "cmd", "package", "resolve-activity",
                                  "--brief", "--user", str(uid), app_id, timeout=5)
        for line in out.splitlines():
            line = line.strip()
            if "/" in line and " " not in line and line != "No activity found":
                return uid, line
    return None, None


async def _adb_launch_app(udid: str, app_id: str, clear_state: bool = False) -> tuple:
    """Launch an Android app via ADB, bypassing Maestro's broken launchApp.

    Xiaomi-aware: resolves the correct user profile (app may be in work
    profile u10 rather than u0) and uses `am start --user` to target it."""
    uid, component = await _resolve_launch(udid, app_id)
    if uid is None or not component:
        return False, f"No launch activity resolved for {app_id}"

    if clear_state:
        p = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "pm", "clear", "--user", str(uid), app_id,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(p.wait(), timeout=10)
        except Exception:
            pass

    p = await asyncio.create_subprocess_exec(
        "adb", "-s", udid, "shell", "am", "start", "--user", str(uid), "-n", component,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(p.communicate(), timeout=10)
        if p.returncode == 0:
            # Give the activity a moment to foreground before the next command
            await asyncio.sleep(1.5)
            return True, ""
        return False, (stderr.decode(errors="replace")[:200] if stderr else f"am start rc={p.returncode}")
    except Exception as e:
        return False, str(e)


def _split_flow_into_commands(yaml_body: str) -> list:
    """Parse a Maestro flow YAML (list of commands) and return a list of dicts
    describing each step:
      { kind: "launchApp", appId: "...", clearState: bool }   — handled via ADB
      { kind: "yaml", yaml: "..." }                           — sent to /api/run-command
    Splits launchApp out of the Maestro path because the embedded Orchestra
    reliably fails on it; ADB `monkey` works instead.
    """
    import yaml as _yaml
    try:
        parsed = _yaml.safe_load(yaml_body)
    except Exception as e:
        logger.error(f"flow YAML parse failed: {e}")
        return []
    if not isinstance(parsed, list):
        return [{"kind": "yaml", "yaml": yaml_body.strip()}]

    out: list = []
    for item in parsed:
        if not isinstance(item, dict) or len(item) != 1:
            continue
        (key, value), = item.items()
        if key == "launchApp":
            app_id = None
            clear_state = False
            if isinstance(value, str):
                app_id = value
            elif isinstance(value, dict):
                app_id = value.get("appId")
                clear_state = bool(value.get("clearState"))
            out.append({"kind": "launchApp", "appId": app_id, "clearState": clear_state})
        else:
            out.append({"kind": "yaml", "yaml": _yaml.safe_dump(item, default_flow_style=False, sort_keys=False).strip()})
    return out


async def _ensure_maestro_apks(udid: str) -> None:
    """Ensure Maestro driver APKs are installed and the test APK has its
    instrumentation runner properly registered.

    Root cause: on MIUI and some other ROMs, installing the test APK with
    plain `adb install` (no flags) registers the package but NOT the
    instrumentation entry, causing `am instrument` to fail with
    'INSTRUMENTATION_FAILED: Unable to find instrumentation info'.
    Re-installing with `adb install -t` fixes this.

    This is safe to call on every run; if the APKs are already correctly
    installed, `pm list instrumentation | grep maestro` returns immediately.
    """
    import shutil as _shutil

    # Fast check: instrumentation already registered AND test APK installed with -t?
    # Checking via `pm list instrumentation` is the authoritative indicator.
    p = await asyncio.create_subprocess_exec(
        "adb", "-s", udid, "shell", "pm", "list", "instrumentation",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    out, _ = await asyncio.wait_for(p.communicate(), timeout=5)
    if b"dev.mobile.maestro.test/androidx.test.runner.AndroidJUnitRunner" in out:
        return  # already properly installed — skip reinstall

    logger.info(f"Maestro APKs not properly registered on {udid} — reinstalling")

    # Locate the APKs bundled with maestro-client
    maestro_bin = _shutil.which("maestro") or os.path.expanduser("~/.maestro/bin/maestro")
    maestro_dir = os.path.dirname(os.path.abspath(maestro_bin)) if maestro_bin else ""
    # Try common locations
    candidates = [
        os.path.join(maestro_dir, "..", "..", "lib"),      # ~/.maestro/bin/../lib
        os.path.expanduser("~/.maestro/lib"),
    ]
    apk_dir = next((d for d in candidates if os.path.isdir(d)), None)

    # Find APK files via jar extraction from maestro-client.jar
    maestro_app_apk: Optional[str] = None
    maestro_server_apk: Optional[str] = None
    if apk_dir:
        client_jar = os.path.join(apk_dir, "maestro-client.jar")
        if os.path.exists(client_jar):
            import zipfile, tempfile
            tmp = tempfile.mkdtemp(prefix="maestro_apks_")
            try:
                with zipfile.ZipFile(client_jar) as z:
                    for name in z.namelist():
                        if name.endswith("maestro-app.apk"):
                            z.extract(name, tmp)
                            maestro_app_apk = os.path.join(tmp, name)
                        elif name.endswith("maestro-server.apk"):
                            z.extract(name, tmp)
                            maestro_server_apk = os.path.join(tmp, name)
            except Exception as e:
                logger.warning(f"Could not extract maestro APKs from jar: {e}")

    if not maestro_app_apk or not maestro_server_apk:
        logger.warning("Could not locate maestro APKs — skipping forced reinstall")
        return

    # Clean uninstall first — MIUI may leave corrupted APK data that causes the
    # instrumentation driver to start but not bind its gRPC port.  A fresh
    # install (not just reinstall) ensures a clean slate.
    for pkg in ("dev.mobile.maestro.test", "dev.mobile.maestro"):
        try:
            p = await asyncio.create_subprocess_exec(
                "adb", "-s", udid, "uninstall", pkg,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(p.wait(), timeout=10)
        except Exception:
            pass

    for cmd in [
        ["adb", "-s", udid, "install", maestro_app_apk],
        ["adb", "-s", udid, "install", "-t", maestro_server_apk],
    ]:
        try:
            p = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(p.communicate(), timeout=60)
            result = (out + err).decode(errors="replace").strip()
            if "Success" in result:
                logger.info(f"Installed {os.path.basename(cmd[-1])}")
            else:
                logger.warning(f"APK install may have failed: {result[:200]}")
        except Exception as e:
            logger.warning(f"APK install error: {e}")


async def _wake_and_unlock_device(udid: str) -> None:
    """Ensure the device screen is on and unlocked before running a flow.
    Without this, any command that reads the UI hierarchy (tapOn, assertVisible,
    etc.) times out after ~17s because uiautomator can't read AOD/lock screen."""
    try:
        # Wake up
        await _adb_shell(udid, "input", "keyevent", "KEYCODE_WAKEUP", timeout=2)
        # Dismiss keyguard / swipe up to unlock (no-op if already unlocked)
        await _adb_shell(udid, "wm", "dismiss-keyguard", timeout=2)
    except Exception as e:
        logger.debug(f"wake/unlock best-effort failed: {e}")


def _parse_maestro_line(line: str) -> Optional[dict]:
    """Parse a single line of `maestro test` stdout into a step dict.

    Maestro's PlainTextResultView emits:
      "Running on <device>"      → device info
      " > Flow <name>"           → flow name
      "<desc>..."                → step RUNNING  (no trailing newline yet)
      "<desc>... COMPLETED"      → step COMPLETED
      "<desc>... FAILED"         → step FAILED
      "<desc>... WARNED"         → step WARNED

    Returns None for empty / unrecognised lines.
    """
    import time as _time
    line = line.strip()
    if not line:
        return None

    ts = int(_time.time() * 1000)

    # Device / flow header lines
    if line.startswith("Running on "):
        return {"type": "info", "text": line}
    if line.startswith("> Flow ") or line.startswith(" > Flow "):
        return {"type": "flow_name", "text": line.lstrip(" >").strip()}
    if line.startswith("  > "):
        return {"type": "info", "text": line}

    # Step completion lines
    for suffix, status in (
        ("... COMPLETED", "COMPLETED"),
        ("... FAILED",    "FAILED"),
        ("... WARNED",    "WARNED"),
        ("... SKIPPED",   "SKIPPED"),
    ):
        if suffix in line:
            desc = line[:line.rindex(suffix)].strip()
            return {"type": "step", "description": desc, "status": status, "timestamp": ts}

    # Step start line (ends with "...")
    if line.endswith("..."):
        return {"type": "step", "description": line[:-3].strip(), "status": "RUNNING", "timestamp": ts}

    return {"type": "info", "text": line}


async def _run_maestro_test_file(
    udid: str,
    file_path: str,
    env: Optional[dict] = None,
    step_queue: "Optional[asyncio.Queue]" = None,
) -> tuple:
    """Run a Maestro YAML flow file via `maestro test <file_path>`.

    Resolves relative paths (runFlow, runScript) via cwd=dirname(file_path).
    Uses state.test_run_lock so only one `maestro test` runs at a time.

    If step_queue is given, parsed step dicts are put there as they arrive;
    None is put as a sentinel when the run finishes.
    """
    import shutil as _shutil
    maestro_bin = _shutil.which("maestro") or os.path.expanduser("~/.maestro/bin/maestro")
    if not os.path.exists(maestro_bin):
        return False, "maestro binary not found"

    await _ensure_maestro_apks(udid)
    await _wake_and_unlock_device(udid)

    cmd = [maestro_bin, "--device", udid, "test", file_path]
    run_env = {**os.environ}
    if env:
        for k, v in env.items():
            if isinstance(v, str):
                run_env[k] = v

    async with state.test_run_lock:
        _stop_embedded_studio()
        return await _do_run_maestro_test(udid, cmd, run_env, file_path, step_queue)


def _stop_embedded_studio() -> None:
    """Terminate the embedded maestro studio subprocess if running."""
    if state.mss_embedded_process and state.mss_embedded_process.poll() is None:
        try:
            state.mss_embedded_process.terminate()
            state.mss_embedded_process.wait(timeout=3)
        except Exception:
            try:
                state.mss_embedded_process.kill()
            except Exception:
                pass
    state.mss_embedded_process = None
    state.mss_embedded_port = 0


async def _do_run_maestro_test(
    udid: str,
    cmd: list,
    run_env: dict,
    file_path: str,
    step_queue: "Optional[asyncio.Queue]" = None,
) -> tuple:
    """Internal: execute maestro test subprocess under the test_run_lock.

    Reads stdout line by line and puts parsed step dicts into step_queue so
    the flowStatus SSE can relay them to the browser in real time.
    """
    state.adb_command_active.set()
    stderr_chunks: list = []
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.path.dirname(file_path),
            env=run_env,
        )

        async def _drain_stdout():
            """Read stdout line by line; emit parsed steps to queue."""
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                text = raw.decode("utf-8", errors="replace").rstrip()
                if step_queue is not None and text:
                    parsed = _parse_maestro_line(text)
                    if parsed:
                        await step_queue.put(parsed)

        async def _drain_stderr():
            data = await proc.stderr.read()
            stderr_chunks.append(data)

        await asyncio.wait_for(
            asyncio.gather(_drain_stdout(), _drain_stderr(), proc.wait()),
            timeout=600,
        )

        if proc.returncode == 0:
            return True, ""
        msg = b"".join(stderr_chunks).decode("utf-8", errors="replace").strip()
        return False, msg or "Test failed"

    except asyncio.TimeoutError:
        if proc:
            try: proc.kill()
            except Exception: pass
        return False, "Test timed out (600s)"
    except Exception as e:
        return False, str(e)
    finally:
        state.adb_command_active.clear()
        if step_queue is not None:
            await step_queue.put(None)  # sentinel: run finished
        # Clean up ADB forwards left by `maestro test`
        try:
            p = await asyncio.create_subprocess_exec(
                "adb", "-s", udid, "forward", "--remove-all",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(p.wait(), timeout=5)
        except Exception:
            pass


async def _embedded_run_yaml(udid: str, yaml_content: str, dry_run: bool = False) -> tuple:
    """Run a YAML flow through the embedded maestro studio server.
    Returns (success, error_message). error_message is empty on success.

    The Maestro OSS server's `/api/run-command` accepts ONE command per call, so
    we split the flow and submit each command sequentially. The Maestro session
    stays warm across calls, so this is still much faster than spawning a full
    `maestro test` per Run Test click."""
    port = await _ensure_embedded_maestro_studio(udid)
    if not port:
        return False, ("Maestro Studio subprocess failed to start. Check daemon logs for "
                       "the real stack trace (look for 'TimeoutException'). Common fixes: "
                       "close the Maestro Studio desktop app, run `adb kill-server && adb start-server`.")

    # Ensure screen is awake — commands that read UI hierarchy silently
    # time out after 17s when the device is in AOD / locked state.
    if not dry_run:
        await _wake_and_unlock_device(udid)

    default_app_id = _extract_app_id_from_header(yaml_content)
    body = _strip_flow_header(yaml_content)
    steps = _split_flow_into_commands(body)
    if not steps:
        return False, "Flow contained no executable commands"

    # Pause ADB-heavy loops (deviceScreen SSE screencap + uiautomator dump)
    # while maestro issues its own hierarchy/input commands — single-device ADB
    # can't sustain both cleanly and the command times out under contention.
    state.adb_command_active.set()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            for idx, step in enumerate(steps):
                if step["kind"] == "launchApp":
                    app_id = step.get("appId") or default_app_id
                    if not app_id:
                        return False, f"Step {idx+1} (launchApp) is missing appId"
                    if dry_run:
                        continue
                    ok, err = await _adb_launch_app(udid, app_id, step.get("clearState", False))
                    if not ok:
                        logger.error(f"ADB launchApp failed on step {idx+1}: {err}")
                        return False, f"Step {idx+1} (launchApp {app_id}) failed: {err}"
                    continue

                cmd_yaml = step["yaml"]
                r = await client.post(
                    f"http://localhost:{port}/api/run-command",
                    json={"yaml": cmd_yaml, "dryRun": dry_run},
                    headers={"Content-Type": "application/json"},
                )
                if r.status_code >= 400:
                    err = r.text or f"HTTP {r.status_code}"
                    logger.error(f"embedded run-command {r.status_code} on step {idx+1}/{len(steps)}: {err[:500]}\n---CMD---\n{cmd_yaml}\n---")
                    return False, f"Step {idx+1} failed: {err[:400]}"
        return True, ""
    except Exception as e:
        import traceback as _tb
        logger.error(f"embedded run-command exception: {type(e).__name__}: {e}\n{_tb.format_exc()}")
        return False, f"{type(e).__name__}: {e}"
    finally:
        state.adb_command_active.clear()
