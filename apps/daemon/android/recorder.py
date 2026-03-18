import uiautomator2 as u2
import asyncio
import logging
import uuid
from typing import List, Tuple, Optional
from models.step import TestStep, StepAction
from models.run_event import RunEvent
from ws.events import EventType
from android.ui_inspector import UIInspector
from log_manager import log_manager

logger = logging.getLogger("recorder")

class InteractionRecorder:
    def __init__(self, ws_broadcaster, screenshot_handler):
        self.ws_broadcaster = ws_broadcaster
        self.screenshot_handler = screenshot_handler
        self.is_recording: bool = False
        self.recorded_steps: List[dict] = []
        self.d: u2.Device = None
        self.udid: str = None

    async def start_recording(self, udid: str, device: u2.Device):
        self.udid = udid
        self.d = device
        self.is_recording = True
        self.recorded_steps = []
        self._recording_id = f"rec_{udid}_{int(asyncio.get_event_loop().time())}"
        self._device_resolution = None  # actual device pixel resolution

        # Initialize recording log
        log_manager.start_recording_log(self._recording_id)

        # Get actual device resolution (run in thread to avoid blocking event loop / scrcpy relay).
        # This is needed to scale scrcpy video coords → real device coords for UIInspector.
        try:
            w, h = await asyncio.to_thread(device.window_size)
            self._device_resolution = (w, h)
            resolution = f"{w}x{h}"
        except Exception as e:
            resolution = "unknown"
            log_manager.error(f"Falha ao obter resolução do device {udid}: {e}", context="RECORDING", exc=e)

        log_manager.recording(
            f"Gravação iniciada | Device: {udid} | Resolução: {resolution}",
            recording_id=self._recording_id
        )

        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.RECORDING_STARTED,
            run_id="recording",
            data={"udid": udid}
        ))

        logger.info(f"Started recording on {udid}")

    async def stop_recording(self) -> List[dict]:
        self.is_recording = False
        steps = self.recorded_steps.copy()

        log_manager.recording(
            f"Gravação finalizada | {len(steps)} steps capturados",
            recording_id=getattr(self, '_recording_id', 'default')
        )
        log_manager.end_recording_log(getattr(self, '_recording_id', 'default'))

        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.RECORDING_STOPPED,
            run_id="recording",
            data={"step_count": len(steps)}
        ))

        logger.info(f"Stopped recording. Captured {len(steps)} steps.")
        return steps

    async def enrich_step(self, x: int, y: int, action: str = "tap") -> dict:
        """
        Given coordinates where the user interacted, capture a screenshot
        and inspect the UI hierarchy to identify the element.
        Returns element info for the frontend to update the step.
        """
        if not self.d:
            return {"element_info": {}, "screenshot_url": None}

        element_info = {}
        screenshot_url = None

        recording_id = getattr(self, '_recording_id', 'default')

        # Scale coordinates from scrcpy video space to actual device pixels.
        # The frontend sends coords based on scrcpy's frame dimensions (limited by max_size),
        # but dump_hierarchy bounds use the real device resolution.
        inspect_x, inspect_y = x, y
        device_res = getattr(self, '_device_resolution', None)
        if device_res:
            from ws.stream_manager import screen_stream_manager
            scrcpy_client = screen_stream_manager.scrcpy_clients.get(self.udid)
            if scrcpy_client and scrcpy_client.frame_width and scrcpy_client.frame_height:
                scale_x = device_res[0] / scrcpy_client.frame_width
                scale_y = device_res[1] / scrcpy_client.frame_height
                inspect_x = int(x * scale_x)
                inspect_y = int(y * scale_y)
                if scale_x != 1.0 or scale_y != 1.0:
                    logger.info(f"Coord scaling: scrcpy({x},{y}) -> device({inspect_x},{inspect_y}) | scale=({scale_x:.2f},{scale_y:.2f})")

        try:
            # Get element at coordinates (run in thread to avoid blocking event loop / scrcpy relay)
            element_info = await asyncio.to_thread(UIInspector.get_element_at, self.d, inspect_x, inspect_y)
            logger.info(f"Element at ({x},{y}): {element_info}")
        except Exception as e:
            logger.warning(f"Failed to inspect UI at ({x},{y}): {e}")
            log_manager.recording(f"Dump XML: falha ao inspecionar ({x},{y}): {e}", recording_id=recording_id, level="WARN")

        try:
            # Capture screenshot
            step_num = len(self.recorded_steps) + 1
            screenshot_url = await self.screenshot_handler.capture_and_upload(
                device=self.d,
                run_id="recording",
                step_num=step_num,
                phase="live"
            )
        except Exception as e:
            logger.warning(f"Failed to capture screenshot during recording: {e}")

        # Build best selector
        target, target_type = self._build_best_selector(element_info, x, y)

        result = {
            "element_info": element_info,
            "screenshot_url": screenshot_url,
            "target": target,
            "target_type": target_type,
        }

        step_num = len(self.recorded_steps) + 1

        # Log the event
        action_upper = action.upper()
        element_desc = ""
        if element_info:
            text = element_info.get("text", "")
            res_id = element_info.get("resource_id", "")
            if text:
                element_desc = f' | Elemento: text="{text}"'
            elif res_id:
                element_desc = f' | Elemento: resourceId="{res_id}"'

        if target_type == "coordinates":
            log_manager.recording_event(
                f"{action_upper} | Coordenadas: ({x}, {y}){element_desc} | Nenhum seletor identificado",
                recording_id=recording_id
            )
        else:
            log_manager.recording(
                f"Step {step_num} enriquecido: seletor={target_type}:{target}{element_desc}",
                recording_id=recording_id
            )
            log_manager.recording_event(
                f"{action_upper} | Coordenadas: ({x}, {y}){element_desc} | Seletor: {target_type}:{target}",
                recording_id=recording_id
            )

        # Store enriched step
        self.recorded_steps.append({
            "action": action,
            "x": x,
            "y": y,
            "element_info": element_info,
            "target": target,
            "target_type": target_type,
            "screenshot_url": screenshot_url,
        })

        # Broadcast
        await self.ws_broadcaster.broadcast(RunEvent(
            type=EventType.STEP_RECORDED,
            run_id="recording",
            data=result
        ))

        return result

    def _build_best_selector(self, element_info: dict, x: int, y: int) -> Tuple[str, str]:
        if not element_info:
            return f"{x},{y}", "coordinates"

        res_id = element_info.get("resource_id", "")
        text = element_info.get("text", "")
        desc = element_info.get("content_desc", "")

        if res_id and not res_id.startswith("android:id"):
            return res_id, "resource_id"

        if text:
            return text, "text"

        if desc:
            return desc, "description"

        if res_id:
            return res_id, "resource_id"

        return f"{x},{y}", "coordinates"


# Global recorder instances per device
active_recorders: dict[str, InteractionRecorder] = {}
