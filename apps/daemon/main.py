import asyncio
import logging
import os
import ssl

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ssl._create_default_https_context = ssl._create_unverified_context

from android.device_manager import device_manager_instance
from log_manager import log_manager
from services.maestro.elements import _mss_get_udid
from services.maestro.studio import _ensure_embedded_maestro_studio
import state

# Import all routers
from routes.device_input import router as device_input_router
from routes.engines import router as engines_router
from routes.devices import router as devices_router
from routes.runs import router as runs_router
from routes.recording import router as recording_router
from routes.tests import router as tests_router
from routes.projects import router as projects_router
from routes.scanner import router as scanner_router
from routes.logs import router as logs_router
from routes.maestro_studio import router as maestro_studio_router
from routes.mss.device_screen import router as mss_device_screen_router
from routes.mss.commands import router as mss_commands_router
from routes.mss.workspace import router as mss_workspace_router
from routes.mss.flows import router as mss_flows_router
from routes.mss.devices import router as mss_devices_router
from routes.mss.apps import router as mss_apps_router
from routes.mss.misc import router as mss_misc_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

app = FastAPI(title="QAMind Daemon", version="1.0.0")

# Origens permitidas no CORS. Localhost/127.0.0.1 (qualquer porta) sempre
# liberados via regex. A web em producao (HTTPS) precisa ser liberada
# explicitamente para que o navegador do usuario, rodando o app deployado,
# consiga falar com ESTE daemon local (modo "executar na web com device local").
# Origens extras (ex.: dominio proprio) via env DAEMON_ALLOWED_ORIGINS (CSV).
_default_web_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://qamind.issqa.com.br",
]
_extra_origins = [
    o.strip() for o in os.getenv("DAEMON_ALLOWED_ORIGINS", "").split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_web_origins + _extra_origins,
    # localhost/127.0.0.1 em qualquer porta (dev local sem impacto).
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
for router in [
    device_input_router, engines_router, devices_router, runs_router,
    recording_router, tests_router, projects_router, scanner_router,
    logs_router, maestro_studio_router,
    mss_device_screen_router, mss_commands_router, mss_workspace_router,
    mss_flows_router, mss_devices_router, mss_apps_router, mss_misc_router,
]:
    app.include_router(router)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(device_manager_instance.poll_devices())
    logger.info("Started device polling background task.")
    try:
        log_manager.rotate_logs()
        logger.info("Log rotation completed.")
    except Exception as e:
        logger.warning(f"Log rotation failed: {e}")

    # Kill orphan `maestro test` processes left by a previous daemon run so they
    # don't hold ADB forwarder ports that would block new test executions.
    import subprocess as _sp
    try:
        _sp.run(["pkill", "-f", "maestro.*test.*\\.yaml"], capture_output=True, timeout=5)
        logger.info("Cleaned up any orphan maestro test processes.")
    except Exception:
        pass

    # NOTE: PROCESS warm-up is intentionally disabled.
    # `maestro studio --no-window` and `maestro test` both hold the device's
    # Maestro driver session. Running both simultaneously causes
    # TcpForwarder.waitFor TimeoutException and silently kills the test.
    # The embedded studio starts on-demand when the console needs it (first
    # use of _embedded_run_yaml). For "Run Test" we use `maestro test` directly.
    #
    # What we DO is read-only OS-level warm-up: page-cache the maestro JARs
    # and pre-confirm the driver APK is registered on connected devices.
    # See services/maestro/prewarm.py — safe to disable via MAESTRO_PREWARM=0.
    try:
        from services.maestro.prewarm import run_all as _maestro_prewarm
        asyncio.create_task(_maestro_prewarm())
        logger.info("Started maestro pre-warm background task.")
    except Exception as e:
        logger.warning(f"Pre-warm scheduling failed (non-fatal): {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Tear down the embedded maestro studio subprocess so ports/sessions don't leak."""
    if state.mss_embedded_process and state.mss_embedded_process.poll() is None:
        try:
            state.mss_embedded_process.terminate()
            state.mss_embedded_process.wait(timeout=5)
        except Exception:
            try:
                state.mss_embedded_process.kill()
            except Exception:
                pass
        logger.info("Embedded maestro studio terminated.")


if __name__ == "__main__":
    import uvicorn
    daemon_port = int(os.environ.get("DAEMON_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=daemon_port)
