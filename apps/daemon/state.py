import asyncio
from typing import Optional
import signal as _signal  # noqa: F401 — imported here so other modules can use `import state; state._signal`

# --- Maestro Studio embedded subprocess ---
mss_embedded_process = None  # subprocess.Popen
mss_embedded_port: int = 0
mss_embedded_udid: str = ""
mss_embedded_lock = asyncio.Lock()

# --- Maestro multi-window element cache (from Maestro's own SSE) ---
mss_maestro_elements: list = []
mss_maestro_consumer_task: Optional[asyncio.Task] = None

# --- ADB gate: pause screencap SSE while Maestro issues commands ---
adb_command_active = asyncio.Event()
# starts cleared (not active)

# --- Global test execution lock: only one maestro test subprocess at a time ---
# Prevents concurrent `maestro test` processes competing for the device's ADB
# channel / TCP forwarder, which reliably causes TcpForwarder TimeoutExceptions.
test_run_lock = asyncio.Lock()

# --- Screenshot and XML cache for MSS compatibility layer ---
mss_screenshots: dict = {}  # sid → jpeg bytes
mss_last_xml: str = ""

# --- Pending flow executions for flowStatus SSE ---
mss_flows: dict = {}  # flowId → {yaml, filePath, workspacePath, env, udid, status}

# --- Active UIAutomator2 run orchestrators (for cancellation) ---
active_runs: dict = {}

# --- App package resolution cache ---
APP_PACKAGE_CACHE: dict = {
    "foxbit": "br.com.foxbit.foxbitandroid",
    "wastezero": "com.app.wastezero_app",
    "settings": "com.android.settings",
    "configuracoes": "com.android.settings",
}

# --- Background task strong references (prevent GC) ---
background_tasks: set = set()

# --- Per-device flag: Maestro driver APKs already verified this daemon lifecycle ---
# `pm list instrumentation` adds ~500ms to every Run Test; cache the affirmative
# result so subsequent runs skip the check. Invalidate on driver reinstall.
mss_apks_verified: set = set()  # udids confirmed good
