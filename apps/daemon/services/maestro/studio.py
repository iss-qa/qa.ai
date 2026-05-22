import asyncio
import json
import logging
import os
import re as _re
import signal as _signal
import subprocess
from typing import Optional

import httpx

import state

logger = logging.getLogger("maestro.studio")

# The Maestro Studio Electron app's Java backend always uses port 5050
MAESTRO_STUDIO_PORT: int = 5050


async def _maestro_studio_ping() -> bool:
    """Return True if Maestro Studio Java backend is responding on port 5050."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"http://localhost:{MAESTRO_STUDIO_PORT}/", timeout=2.0)
            return r.status_code < 500
    except Exception:
        return False


async def _cleanup_maestro_state(udid: str) -> None:
    """Force-stop the Maestro driver APK and clear stale ADB forwards so the
    next `maestro studio` launch gets a clean AndroidDriver.allocateForwarder.

    Without this, stale forwards from a previous Maestro run (which exit via
    Ctrl-C / subprocess kill and leave the forward entries behind) cause
    `dadb.forwarding.TcpForwarder.waitFor` to TimeoutException."""
    commands = [
        ["adb", "-s", udid, "shell", "am", "force-stop", "dev.mobile.maestro"],
        ["adb", "-s", udid, "shell", "am", "force-stop", "dev.mobile.maestro.test"],
        ["adb", "-s", udid, "forward", "--remove-all"],
    ]
    for cmd in commands:
        try:
            p = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(p.wait(), timeout=5)
        except Exception as e:
            logger.debug(f"cleanup cmd {cmd[-2:]} failed: {e}")


async def _maestro_elements_consumer(port: int) -> None:
    """Background task: keep an SSE connection open to Maestro Studio's
    /api/device-screen/sse and drain its events, caching each event's
    `elements` list for our own deviceScreen stream to use.

    Maestro's driver APK walks the system a11y tree across ALL visible windows,
    so BottomSheet / DialogFragment inputs like `inp_login_email` don't get
    shadowed by the Activity underneath (e.g. `inp_welcome_search`)."""
    url = f"http://localhost:{port}/api/device-screen/sse"
    backoff = 1.0
    while True:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code >= 400:
                        raise RuntimeError(f"maestro SSE {resp.status_code}")
                    backoff = 1.0
                    buf = ""
                    async for chunk in resp.aiter_text():
                        buf += chunk
                        while "\n\n" in buf:
                            raw, _, rest = buf.partition("\n\n")
                            buf = rest
                            for line in raw.splitlines():
                                if not line.startswith("data: "):
                                    continue
                                try:
                                    data = json.loads(line[6:])
                                except Exception:
                                    continue
                                elems = data.get("elements")
                                if isinstance(elems, list):
                                    state.mss_maestro_elements = elems
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.debug(f"maestro elements consumer reconnect ({e})")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 10.0)


async def _probe_maestro_studio_port(port: int) -> bool:
    """Return True if a Maestro Studio server is already serving on this port."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"http://localhost:{port}/")
            return r.status_code < 500
    except Exception:
        return False


async def _adopt_existing_maestro_studio() -> Optional[int]:
    """If a previous daemon run left an orphan `maestro studio` process alive,
    adopt it instead of spawning a new one (which would fail because the device
    driver is held). We validate the instance with a dry-run command first —
    orphan processes whose Maestro session has gone stale return 400 on every
    subsequent command, so we kill them and let the caller spawn fresh."""
    for port in (9999, 10000, 10001, 10002, 10003):
        if not await _probe_maestro_studio_port(port):
            continue
        # Verify it's actually Maestro Studio (not another service)
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"http://localhost:{port}/")
                if "maestro" not in r.text.lower() and "Maestro Studio" not in r.text:
                    continue
        except Exception:
            continue

        # Validate the instance with a dry-run command — a stale session would
        # 400 here with "Command execution failed".
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                v = await client.post(
                    f"http://localhost:{port}/api/run-command",
                    json={"yaml": "pressKey: BACK", "dryRun": True},
                    headers={"Content-Type": "application/json"},
                )
            if v.status_code < 400:
                return port
            logger.warning(f"Adopted candidate on port {port} failed dry-run ({v.status_code}), killing orphan")
        except Exception as e:
            logger.warning(f"Adopt validation error on port {port}: {e}")

        # Instance on this port is unusable — kill the orphan process holding it
        try:
            p = await asyncio.create_subprocess_exec(
                "lsof", "-ti", f":{port}",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            pids, _ = await asyncio.wait_for(p.communicate(), timeout=3)
            for pid in pids.decode().split():
                try:
                    os.kill(int(pid), _signal.SIGTERM)
                except Exception:
                    pass
            await asyncio.sleep(1)
        except Exception as e:
            logger.debug(f"Failed to kill orphan on port {port}: {e}")
    return None


async def _ensure_embedded_maestro_studio(udid: str) -> Optional[int]:
    """Start `maestro studio --no-window` as a subprocess if not already up for
    this UDID. Returns the port, or None if we can't start it."""
    async with state.mss_embedded_lock:
        # Already tracked and alive for this UDID?
        if (state.mss_embedded_process
                and state.mss_embedded_process.poll() is None
                and state.mss_embedded_udid == udid
                and state.mss_embedded_port):
            return state.mss_embedded_port

        # Daemon was restarted? Adopt the orphan subprocess from the previous run
        # instead of killing it and spawning a new one (which would hit
        # TcpForwarder TimeoutException because the device driver is still held).
        if not state.mss_embedded_process:
            adopted = await _adopt_existing_maestro_studio()
            if adopted:
                state.mss_embedded_port = adopted
                state.mss_embedded_udid = udid
                _start_maestro_elements_consumer(adopted)
                logger.info(f"Adopted existing maestro studio at http://localhost:{adopted}")
                return adopted

        # Different UDID or dead — shut down any stale instance
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

        # Clean slate on device before launching — kills stale forwards and driver
        await _cleanup_maestro_state(udid)

        import shutil as _shutil
        maestro_bin = _shutil.which("maestro") or os.path.expanduser("~/.maestro/bin/maestro")
        if not os.path.exists(maestro_bin):
            logger.warning("maestro binary not found; flow execution will fall back to `maestro test` subprocess")
            return None

        try:
            proc = subprocess.Popen(
                [maestro_bin, "--device", udid, "studio", "--no-window"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,  # line-buffered so we can scan stdout live
                env={**os.environ},
            )
        except Exception as e:
            logger.error(f"Failed to start embedded maestro studio: {e}")
            return None

        # Scan stdout lines for `http://localhost:<port>` (Maestro Studio picks a
        # free port at random and prints it on startup). Timeout ~60s to cover
        # the JVM cold start / Maestro driver APK install on first run.
        port_re = _re.compile(r"http://localhost:(\d+)")
        loop = asyncio.get_event_loop()

        async def _read_port() -> Optional[int]:
            def _readline() -> str:
                return proc.stdout.readline() if proc.stdout else ""
            for _ in range(600):  # ~60s worst case
                line = await loop.run_in_executor(None, _readline)
                if not line:
                    if proc.poll() is not None:
                        return None  # process died
                    continue
                logger.info(f"[maestro-studio] {line.rstrip()}")
                m = port_re.search(line)
                if m:
                    return int(m.group(1))
            return None

        try:
            port = await asyncio.wait_for(_read_port(), timeout=90)
        except asyncio.TimeoutError:
            port = None

        if not port:
            logger.error("Embedded maestro studio did not announce a port within 90s")
            try:
                proc.terminate()
            except Exception:
                pass
            return None

        # Drain remaining stdout in background so the pipe buffer never blocks
        def _drain():
            try:
                for line in iter(proc.stdout.readline, ""):
                    if line:
                        logger.debug(f"[maestro-studio] {line.rstrip()}")
            except Exception:
                pass
        import threading
        threading.Thread(target=_drain, daemon=True).start()

        # Health-check the endpoint
        for _ in range(30):
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    r = await client.get(f"http://localhost:{port}/")
                    if r.status_code < 500:
                        break
            except Exception:
                await asyncio.sleep(0.5)

        state.mss_embedded_process = proc
        state.mss_embedded_port = port
        state.mss_embedded_udid = udid
        _start_maestro_elements_consumer(port)
        logger.info(f"Embedded maestro studio ready at http://localhost:{port} (udid={udid})")
        return port


def _start_maestro_elements_consumer(port: int) -> None:
    """Start / restart the SSE consumer that pulls Maestro's multi-window
    element list into our cache. Safe to call multiple times."""
    if state.mss_maestro_consumer_task and not state.mss_maestro_consumer_task.done():
        return
    state.mss_maestro_consumer_task = asyncio.create_task(_maestro_elements_consumer(port))
