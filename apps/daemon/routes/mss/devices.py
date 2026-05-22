import asyncio
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from android.device_manager import device_manager_instance

router = APIRouter()
logger = logging.getLogger("mss.devices")


def _mss_build_device_list() -> list:
    """Build Maestro Studio device list from connected ADB devices."""
    devices = device_manager_instance.list_online_devices()
    result = []
    for dev in devices:
        udid = dev.udid or dev.serial
        # Distinguish emulators (emulator-5554) from physical USB devices
        is_emulator = udid.startswith("emulator-")
        result.append({
            "instanceId": udid,
            "modelId": udid,
            "state": "connected",
            "platform": "ANDROID",
            "description": f"Android {'Emulator' if is_emulator else 'Device'} ({udid})",
            "error": None,
        })
    return result


@router.get("/mss/api/devices/events")
async def mss_devices_events():
    """SSE stream: device list updates. Once connected sends current devices every 3s."""

    async def generate():
        while True:
            devices = _mss_build_device_list()
            yield f"data: {json.dumps(devices)}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
