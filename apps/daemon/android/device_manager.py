import asyncio
import subprocess
import logging
import re
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
        """Detect device using only ADB — no app installation required."""
        logger.info(f"New device detected: {udid}")
        log_manager.device(f"Novo device detectado: {udid}", udid=udid)
        device_name = "Android Device"
        device_model = "Unknown"
        os_version = "Unknown"
        resolution = "1080x1920"
        battery = 100

        # All info gathered via ADB shell — fast and requires nothing installed
        adb_props = {
            "model": "ro.product.model",
            "brand": "ro.product.brand",
            "name": "ro.product.marketname",
            "version": "ro.build.version.release",
        }
        prop_values = {}
        for key, prop in adb_props.items():
            try:
                proc = await asyncio.create_subprocess_exec(
                    ADB_PATH, '-s', udid, 'shell', 'getprop', prop,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    env=_SUBPROCESS_ENV,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
                val = stdout.decode().strip()
                if val:
                    prop_values[key] = val
            except Exception:
                pass

        device_model = prop_values.get("model", "Unknown")
        device_name = prop_values.get("name") or prop_values.get("model") or "Android Device"
        brand = prop_values.get("brand", "")
        if brand and brand.lower() not in device_name.lower():
            device_name = f"{brand} {device_name}"
        os_version = prop_values.get("version", "Unknown")

        # Resolution via ADB
        try:
            proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', udid, 'shell', 'wm', 'size',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=_SUBPROCESS_ENV,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            m = re.search(r'(\d+)x(\d+)', stdout.decode())
            if m:
                resolution = f"{m.group(1)}x{m.group(2)}"
        except Exception:
            pass

        # Battery via ADB
        try:
            proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', udid, 'shell', 'dumpsys', 'battery',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=_SUBPROCESS_ENV,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            m = re.search(r'level:\s*(\d+)', stdout.decode())
            if m:
                battery = int(m.group(1))
        except Exception:
            pass

        device = Device(
            id=udid,
            udid=udid,
            name=device_name,
            model=device_model,
            os_version=os_version,
            resolution=resolution,
            status=DeviceStatus.ONLINE,
            battery_level=battery,
        )

        self.devices[udid] = device
        log_manager.device(
            f"Device conectado: {udid} | {device_name} ({device_model}) | Android {os_version} | {resolution} | Bateria: {battery}%",
            udid=udid,
        )

        await ws_server.broadcast(RunEvent(
            type=EventType.DEVICE_CONNECTED,
            run_id="system",
            data={"device": device.model_dump()},
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
