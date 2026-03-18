import asyncio
import subprocess
import logging
import shutil
import sys
import os
import uiautomator2 as u2
from typing import Dict, List, Optional
from models.device import Device, DeviceStatus
from ws.server import ws_server
from models.run_event import RunEvent
from ws.events import EventType
from log_manager import log_manager

logger = logging.getLogger("device_manager")

# Resolve adb path at module load time to avoid PATH issues in subprocesses
ADB_PATH = shutil.which("adb") or "/opt/homebrew/bin/adb"
_SUBPROCESS_ENV = {**os.environ, "PATH": os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin"}
logger.info(f"Using adb at: {ADB_PATH}")

class DeviceManager:
    def __init__(self):
        self.devices: Dict[str, Device] = {}
        self.connections: Dict[str, u2.Device] = {}
    
    async def poll_devices(self):
        """
        Polls adb for connected devices every 5 seconds.
        """
        while True:
            try:
                # Run adb devices command
                process = await asyncio.create_subprocess_shell(
                    f"{ADB_PATH} devices",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_SUBPROCESS_ENV
                )
                stdout, _ = await process.communicate()
                output = stdout.decode().strip().split('\n')
                
                # First line is "List of devices attached", skip it
                current_udids = set()
                if len(output) > 1:
                    for line in output[1:]:
                        if not line.strip():
                            continue
                        parts = line.split()
                        if len(parts) >= 2 and parts[1] == 'device':
                            current_udids.add(parts[0])
                
                # Check for new devices
                for udid in current_udids:
                    if udid not in self.devices or self.devices[udid].status == DeviceStatus.OFFLINE:
                        await self._handle_new_device(udid)
                
                # Check for disconnected devices
                for udid in list(self.devices.keys()):
                    if udid not in current_udids and self.devices[udid].status != DeviceStatus.OFFLINE:
                        await self._handle_disconnected_device(udid)
                        
            except Exception as e:
                logger.error(f"Error polling devices: {e}")
                
            await asyncio.sleep(5)

    async def scan_now(self):
        """Synchronous forceful scan."""
        try:
            process = await asyncio.create_subprocess_shell(
                f"{ADB_PATH} devices",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_SUBPROCESS_ENV
            )
            stdout, _ = await process.communicate()
            output = stdout.decode().strip().split('\n')
            
            current_udids = set()
            if len(output) > 1:
                for line in output[1:]:
                    if not line.strip(): continue
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == 'device':
                        current_udids.add(parts[0])
            
            # Auto-init u2 if new
            for udid in current_udids:
                if udid not in self.devices or self.devices[udid].status == DeviceStatus.OFFLINE:
                    await self._handle_new_device(udid)
                    
            for udid in list(self.devices.keys()):
                if udid not in current_udids and self.devices[udid].status != DeviceStatus.OFFLINE:
                    await self._handle_disconnected_device(udid)
                    
            return True
        except Exception as e:
            logger.error(f"Scan failed: {e}")
            return False

    async def _handle_new_device(self, udid: str):
        logger.info(f"New device detected: {udid}")
        log_manager.device(f"Novo device detectado: {udid}", udid=udid)
        device_name = "Unknown"
        device_model = "Unknown"
        os_version = "Unknown"
        resolution = "1080x1920"
        battery = 100

        try:
            # Try to get model via adb directly as a quick fallback
            model_proc = await asyncio.create_subprocess_shell(
                f"{ADB_PATH} -s {udid} shell getprop ro.product.model",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_SUBPROCESS_ENV
            )
            stdout, _ = await model_proc.communicate()
            if model_proc.returncode == 0:
                device_model = stdout.decode().strip()
                device_name = device_model
        except Exception as e:
            log_manager.error(f"Falha ao obter modelo do device {udid} via ADB: {e}", context="DEVICE", exc=e)

        try:
            # Initialize u2 silently to prevent errors on first connect
            init_proc = await asyncio.create_subprocess_shell(
                f"{sys.executable} -m uiautomator2 init --serial {udid}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_SUBPROCESS_ENV
            )
            await init_proc.communicate()

            # Create connection to get info (run blocking u2 calls in thread
            # to avoid stalling the event loop / scrcpy relay)
            d = await asyncio.to_thread(u2.connect, udid)
            info = await asyncio.to_thread(lambda: d.info)
            device_info = await asyncio.to_thread(lambda: d.device_info)
            battery = device_info.get("battery", {}).get("level", 100)

            # Use safe defaults if some fields are missing
            display = info.get("displaySizeDpX", 1080), info.get("displaySizeDpY", 1920)
            resolution = f"{display[0]}x{display[1]}"
            device_name = device_info.get("marketName", device_info.get("model", device_model))
            device_model = device_info.get("model", device_model)
            os_version = str(device_info.get("version", "Unknown"))

            self.connections[udid] = d
        except Exception as e:
            logger.error(f"Failed to connect and initialize uiautomator2 for device {udid}: {e}")
            logger.info("Adding device to list anyway with basic info")
            log_manager.device(f"Falha ao inicializar u2: {e}", udid=udid, level="ERROR")
            log_manager.error(f"Falha u2 init para device {udid}: {e}", context="DEVICE", exc=e)

        # Create device entry regardless of u2 success
        device = Device(
            id=udid,
            udid=udid,
            name=device_name,
            model=device_model,
            os_version=os_version,
            resolution=resolution,
            status=DeviceStatus.ONLINE,
            battery_level=battery
        )

        self.devices[udid] = device
        log_manager.device(
            f"Device conectado: {udid} | {device_name} ({device_model}) | Android {os_version} | {resolution} | Bateria: {battery}%",
            udid=udid
        )

        # Broadcast event
        await ws_server.broadcast(RunEvent(
            type=EventType.DEVICE_CONNECTED,
            run_id="system",
            data={"device": device.model_dump()}
        ))

    async def _handle_disconnected_device(self, udid: str):
        logger.info(f"Device disconnected: {udid}")
        log_manager.device(f"Device desconectado: {udid}", udid=udid, level="WARN")
        if udid in self.devices:
            self.devices[udid].status = DeviceStatus.OFFLINE
            if udid in self.connections:
                del self.connections[udid]

            # Broadcast event
            await ws_server.broadcast(RunEvent(
                type=EventType.DEVICE_DISCONNECTED,
                run_id="system",
                data={"udid": udid}
            ))

    def connect(self, udid: str) -> u2.Device:
        if udid not in self.connections:
            self.connections[udid] = u2.connect(udid)
        return self.connections[udid]
    
    def get_device_info(self, udid: str) -> dict:
        if udid in self.devices:
            return self.devices[udid].model_dump()
        return {}

    def get_device(self, udid: str) -> Optional[u2.Device]:
        return self.connections.get(udid)
    
    def list_online_devices(self) -> List[Device]:
        return [d for d in self.devices.values() if d.status == DeviceStatus.ONLINE]

device_manager_instance = DeviceManager()
