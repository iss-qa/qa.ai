import asyncio
import subprocess
import logging
import uiautomator2 as u2
from typing import Dict, List, Optional
from models.device import Device, DeviceStatus
from ws.server import ws_server
from models.run_event import RunEvent
from ws.events import EventType

logger = logging.getLogger("device_manager")

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
                    "adb devices",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
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
                "adb devices",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
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
        device_name = "Unknown"
        device_model = "Unknown"
        os_version = "Unknown"
        resolution = "1080x1920"
        battery = 100
        
        try:
            # Try to get model via adb directly as a quick fallback
            model_proc = await asyncio.create_subprocess_shell(
                f"adb -s {udid} shell getprop ro.product.model",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await model_proc.communicate()
            if model_proc.returncode == 0:
                device_model = stdout.decode().strip()
                device_name = device_model
        except Exception:
            pass

        try:
            # Initialize u2 silently to prevent errors on first connect
            init_proc = await asyncio.create_subprocess_shell(
                f"python -m uiautomator2 init --serial {udid}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await init_proc.communicate()
            
            # Create connection to get info
            d = u2.connect(udid)
            info = d.info
            battery = d.device_info.get("battery", {}).get("level", 100)
            
            # Use safe defaults if some fields are missing
            display = info.get("displaySizeDpX", 1080), info.get("displaySizeDpY", 1920)
            resolution = f"{display[0]}x{display[1]}"
            device_name = d.device_info.get("marketName", d.device_info.get("model", device_model))
            device_model = d.device_info.get("model", device_model)
            os_version = str(d.device_info.get("version", "Unknown"))
            
            self.connections[udid] = d
        except Exception as e:
            logger.error(f"Failed to connect and initialize uiautomator2 for device {udid}: {e}")
            logger.info("Adding device to list anyway with basic info")

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
        
        # Broadcast event
        await ws_server.broadcast(RunEvent(
            type=EventType.DEVICE_CONNECTED,
            run_id="system",
            data={"device": device.model_dump()}
        ))

    async def _handle_disconnected_device(self, udid: str):
        logger.info(f"Device disconnected: {udid}")
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
