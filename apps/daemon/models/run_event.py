import json
from datetime import datetime
from dataclasses import dataclass
from typing import Any, Optional
from ws.events import EventType

@dataclass
class RunEvent:
    type: EventType
    run_id: str
    data: dict
    timestamp: Optional[str] = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()
    
    def to_json(self) -> str:
        return json.dumps({
            "type": self.type.value,
            "run_id": self.run_id,
            "data": self.data,
            "timestamp": self.timestamp
        })
