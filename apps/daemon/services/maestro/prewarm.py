"""Daemon-startup warm-up to shave seconds off the FIRST Run Test of a session.

What this does — and ONLY this:

1. Reads every JAR in ~/.maestro/lib/ into the OS page cache. The JVM class
   loader makes many small reads against these files when `maestro test`
   starts; with them already in RAM, cold-start drops ~1-3s on SSD machines.
2. Runs `pm list instrumentation` once per online device so that
   `_ensure_maestro_apks` short-circuits on the first real Run Test
   (saves ~500ms on the first click after daemon boot).

What this does NOT do:

- Does NOT spawn `maestro` / `maestro test` / `maestro studio` processes.
  Those would hold the device driver and break Run Test (see main.py
  startup_event comment).
- Does NOT touch the device beyond a single read-only `pm list`.
- Does NOT raise. Every operation is wrapped in try/except. A broken
  pre-warm must NEVER block daemon startup or affect Run Test.

Feature-flagged via the env var MAESTRO_PREWARM (default "1"). Set to "0"
to skip entirely if you ever want to bisect a regression.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

import state

logger = logging.getLogger("maestro.prewarm")

_MAESTRO_LIB_DIR = Path(os.path.expanduser("~/.maestro/lib"))
_JAR_READ_CHUNK = 1 << 20  # 1 MiB


def _is_enabled() -> bool:
    return os.environ.get("MAESTRO_PREWARM", "1") != "0"


def _warm_jars_sync() -> tuple[int, int]:
    """Read every JAR sequentially into /dev/null so its bytes land in the
    OS page cache. Runs in a thread so it never blocks the event loop.

    Returns (jar_count, bytes_read). Returns (0, 0) on any failure or when
    the lib dir doesn't exist.
    """
    if not _MAESTRO_LIB_DIR.is_dir():
        return 0, 0
    jar_count = 0
    bytes_read = 0
    for jar in _MAESTRO_LIB_DIR.glob("*.jar"):
        try:
            with open(jar, "rb") as f:
                while True:
                    chunk = f.read(_JAR_READ_CHUNK)
                    if not chunk:
                        break
                    bytes_read += len(chunk)
            jar_count += 1
        except Exception as e:
            logger.debug(f"[prewarm] jar read skipped ({jar.name}): {e}")
    return jar_count, bytes_read


async def warm_jars() -> None:
    if not _is_enabled():
        return
    if not _MAESTRO_LIB_DIR.is_dir():
        logger.info(f"[prewarm] {_MAESTRO_LIB_DIR} not found — skipping JAR warm")
        return
    t0 = time.perf_counter()
    try:
        jar_count, bytes_read = await asyncio.to_thread(_warm_jars_sync)
    except Exception as e:
        logger.debug(f"[prewarm] warm_jars failed: {e}")
        return
    if jar_count:
        mb = bytes_read / (1024 * 1024)
        ms = (time.perf_counter() - t0) * 1000
        logger.info(f"[prewarm] paged in {jar_count} jar(s) ({mb:.1f} MiB) in {ms:.0f}ms")


async def warm_devices(initial_delay_s: float = 3.0) -> None:
    """For every online device, run `pm list instrumentation` once so
    `state.mss_apks_verified` is populated before the user clicks Run Test.

    Waits a few seconds first so the device manager has had time to poll.
    """
    if not _is_enabled():
        return
    await asyncio.sleep(initial_delay_s)
    try:
        from android.device_manager import device_manager_instance
        devices = device_manager_instance.list_online_devices()
    except Exception as e:
        logger.debug(f"[prewarm] list_online_devices failed: {e}")
        return
    if not devices:
        return
    for dev in devices:
        udid = getattr(dev, "udid", None)
        if not udid or udid in state.mss_apks_verified:
            continue
        try:
            p = await asyncio.create_subprocess_exec(
                "adb", "-s", udid, "shell", "pm", "list", "instrumentation",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await asyncio.wait_for(p.communicate(), timeout=5)
            if b"dev.mobile.maestro.test/androidx.test.runner.AndroidJUnitRunner" in out:
                state.mss_apks_verified.add(udid)
                logger.info(f"[prewarm] {udid}: maestro instrumentation already registered (cached)")
            else:
                logger.info(f"[prewarm] {udid}: maestro driver missing — first Run Test will reinstall")
        except Exception as e:
            logger.debug(f"[prewarm] pm list on {udid} failed: {e}")


async def run_all() -> None:
    """Entry point invoked from main.py startup. Fires both warm tasks
    concurrently. Catches everything — never propagates."""
    if not _is_enabled():
        logger.info("[prewarm] disabled via MAESTRO_PREWARM=0")
        return
    try:
        await asyncio.gather(warm_jars(), warm_devices(), return_exceptions=True)
    except Exception as e:
        logger.debug(f"[prewarm] run_all swallowed: {e}")
