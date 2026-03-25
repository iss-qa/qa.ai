import asyncio
import os
import shutil
import subprocess
import logging
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/engines", tags=["Engines"])
logger = logging.getLogger("engines")

# Maestro may be installed in ~/.maestro/bin or via Homebrew.
# The daemon subprocess doesn't inherit shell functions/aliases,
# so we must resolve the full binary path explicitly.
_MAESTRO_SEARCH_PATHS = [
    Path.home() / ".maestro" / "bin" / "maestro",
    Path("/opt/homebrew/bin/maestro"),
    Path("/usr/local/bin/maestro"),
]


def _find_maestro_binary() -> str | None:
    """Find the maestro binary, checking common install locations."""
    # First try PATH (works if daemon was started with correct env)
    found = shutil.which("maestro")
    if found:
        return found
    # Then try known install locations
    for p in _MAESTRO_SEARCH_PATHS:
        if p.exists() and os.access(p, os.X_OK):
            return str(p)
    return None


def get_maestro_binary() -> str:
    """Return maestro binary path or raise if not found."""
    binary = _find_maestro_binary()
    if not binary:
        raise FileNotFoundError("Maestro CLI not found")
    return binary


async def _get_maestro_version() -> dict:
    """Detect Maestro CLI availability and version (timeout 3s)."""
    try:
        binary = _find_maestro_binary()
        if not binary:
            return {"available": False, "version": None}

        proc = await asyncio.create_subprocess_exec(
            binary, '--version',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
        version = stdout.decode().strip()
        if proc.returncode == 0 and version:
            return {"available": True, "version": version}
        return {"available": False, "version": None}
    except (FileNotFoundError, asyncio.TimeoutError, Exception) as e:
        logger.debug(f"Maestro detection failed: {e}")
        return {"available": False, "version": None}


async def _get_uiautomator2_version() -> dict:
    """Detect UIAutomator2 (uiautomator2 pip package)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'python3', '-c', 'import uiautomator2; print(uiautomator2.__version__)',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
        version = stdout.decode().strip()
        if proc.returncode == 0 and version:
            return {"available": True, "version": version}
        return {"available": False, "version": None}
    except Exception:
        return {"available": False, "version": None}


def ensure_port_forward(udid: str, port: int = 7001):
    """Ensure adb forward tcp:port is set for the given device, handling conflicts."""
    try:
        result = subprocess.run(
            ['adb', 'forward', '--list'],
            capture_output=True, text=True, timeout=3,
        )
        lines = result.stdout.strip()
        port_str = f"tcp:{port}"

        if f"{udid} {port_str}" in lines:
            # Already forwarded to this device
            return

        if port_str in lines:
            # Forwarded to a different device - remove first
            subprocess.run(
                ['adb', 'forward', '--remove', port_str],
                capture_output=True, timeout=3,
            )

        subprocess.run(
            ['adb', '-s', udid, 'forward', port_str, port_str],
            capture_output=True, timeout=3,
        )
        logger.info(f"Port {port} forwarded to device {udid}")
    except Exception as e:
        logger.warning(f"Port forward failed for {udid}:{port}: {e}")


@router.get("/status")
async def engines_status():
    u2, maestro = await asyncio.gather(
        _get_uiautomator2_version(),
        _get_maestro_version(),
    )
    return {
        "uiautomator2": u2,
        "maestro": maestro,
    }
