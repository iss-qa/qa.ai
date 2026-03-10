from pydantic import BaseModel
from typing import Optional
from enum import Enum

class DeviceStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    BUSY = "BUSY"

class Device(BaseModel):
    id: str
    udid: str
    name: str
    model: str
    os_version: str
    resolution: str
    status: DeviceStatus
    battery_level: Optional[int] = None
