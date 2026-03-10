import uiautomator2 as u2
import asyncio
import logging
import uuid
from typing import List, Tuple
from models.step import TestStep, StepAction
from models.run_event import RunEvent
from ws.events import EventType
from android.ui_inspector import UIInspector

logger = logging.getLogger("recorder")

class InteractionRecorder:
    def __init__(self, ws_broadcaster, screenshot_handler):
        self.ws_broadcaster = ws_broadcaster
        self.screenshot_handler = screenshot_handler
        self.is_recording: bool = False
        self.recorded_steps: List[TestStep] = []
        self.d: u2.Device = None
        self.udid: str = None
        
    async def start_recording(self, udid: str, device: u2.Device):
        self.udid = udid
        self.d = device
        self.is_recording = True
        self.recorded_steps = []
        
        # In a real watcher scenario, we'd hook into adb logcat or u2 watchers
        # For this prototype, we'll wait for instructions via API or rely on 
        # a dedicated frontend UI mirror if using minicap/minitouch.
        # But per the instructions, we'll mock the event stream or expose
        # a method that the frontend/VNC wrapper can trigger on touch.
        
        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.RECORDING_STARTED,
            run_id="recording",
            data={"udid": udid}
        ))
        
        logger.info(f"Started recording on {udid}")

    async def stop_recording(self) -> List[TestStep]:
        self.is_recording = False
        steps = self.recorded_steps.copy()
        
        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.RECORDING_STOPPED,
            run_id="recording",
            data={"step_count": len(steps)}
        ))
        
        logger.info(f"Stopped recording. Captured {len(steps)} steps.")
        return steps

    async def _on_touch_event(self, x: int, y: int):
        """
        Processes a generic touch event, extracts UI info, and yields a TestStep.
        This would be wired to an adb input interceptor or a frontend mirror.
        """
        if not self.is_recording:
            return
            
        logger.info(f"Processing touch at {x}, {y}")
        
        # 1. Take screenshot
        step_num = len(self.recorded_steps) + 1
        screenshot_url = await self.screenshot_handler.capture_and_upload(
            device=self.d,
            run_id="recording",
            step_num=step_num,
            phase="live"
        )
        
        # 2. Get Element At
        element_info = UIInspector.get_element_at(self.d, x, y)
        
        # 3. Build step
        target, target_type = self._build_best_selector(element_info, x, y)
        
        action = StepAction.TAP
        if "EditText" in element_info.get("class_name", ""):
            action = StepAction.TYPE_TEXT
            
        step = TestStep(
            id=str(uuid.uuid4()),
            action=action,
            target=target,
            value="" if action == StepAction.TYPE_TEXT else None
        )
        
        self.recorded_steps.append(step)
        
        # 4. Broadcast
        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.STEP_RECORDED,
            run_id="recording",
            data={
                "step": step.model_dump(),
                "screenshot_url": screenshot_url,
                "element_info": element_info,
                "target_type": target_type
            }
        ))

    def _build_best_selector(self, element_info: dict, x: int, y: int) -> Tuple[str, str]:
        if not element_info:
            return f"{x},{y}", "coordinates"
            
        res_id = element_info.get("resource_id", "")
        text = element_info.get("text", "")
        desc = element_info.get("content_desc", "")
        
        if res_id and not res_id.startswith("android:id"):
            # Prefer app-specific resource IDs over android layout generic IDs
            return res_id, "resource_id"
            
        if text:
            return text, "text"
            
        if desc:
            return desc, "description"
            
        if res_id:
            return res_id, "resource_id"
            
        return f"{x},{y}", "coordinates"
