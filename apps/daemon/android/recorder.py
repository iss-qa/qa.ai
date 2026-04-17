"""
InteractionRecorder v2 — Records user interactions via ADB getevent + u2 element dump.

Architecture:
  1. AdbEventCapture  — spawns 'adb getevent -lt', parses touch events in real time
  2. InteractionRecorder
       - On tap: u2 dump_hierarchy() at the tap coords to identify the element (live dump,
         any screen, no uiautomator file-dump that kills scrcpy on Xiaomi)
       - Fallback: element map bounds lookup
       - Broadcasts steps via SSE queue + WebSocket
  3. ElementLookupService  — coordinates → element id in pre-scanned element map

Key constraints:
  - NEVER use 'adb shell uiautomator dump' during recording (kills scrcpy on Xiaomi)
  - u2 device.dump_hierarchy() IS safe for scrcpy
  - Element identification priority: u2 live dump → element map → point coords
"""

import asyncio
import logging
import re
import subprocess
import shutil
import os
import time
from typing import List, Tuple, Optional, Callable, Dict

from models.run_event import RunEvent
from ws.events import EventType

logger = logging.getLogger("recorder")

ADB_PATH = shutil.which("adb") or "/opt/homebrew/bin/adb"
_SUBPROCESS_ENV = {
    **os.environ,
    "PATH": os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin",
}

SYSTEM_PREFIXES = ("android:id", "com.android", "com.miui", "com.xiaomi")
FOCUSABLE_CLASSES = ("EditText", "AutoCompleteTextView")


def clean_resource_id(resource_id: str) -> str:
    """Remove package prefix: 'com.foxbit:id/btn_login' -> 'btn_login'"""
    if not resource_id:
        return ""
    match = re.search(r"/(.+)$", resource_id)
    return match.group(1) if match else resource_id


# ─── Touch State Machine ──────────────────────────────────────────────────────

class TouchState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.start_x: Optional[int] = None
        self.start_y: Optional[int] = None
        self.curr_x: Optional[int] = None
        self.curr_y: Optional[int] = None
        self.touching: bool = False


# ─── ADB Event Capture ────────────────────────────────────────────────────────

class AdbEventCapture:
    """
    Listens to 'adb getevent -lt' and emits tap / swipe events.

    Normalizes raw axis values → physical screen pixels using max values
    queried once via 'getevent -p'.
    """

    def __init__(self, udid: str):
        self.udid = udid
        self._process: Optional[asyncio.subprocess.Process] = None
        self._max_x: int = 32767
        self._max_y: int = 32767
        self._phys_w: int = 1080
        self._phys_h: int = 2400
        self._touch_device: str = ""   # e.g. /dev/input/event7 — detected from getevent -p
        self._state = TouchState()
        self._running = False
        self._read_task: Optional[asyncio.Task] = None

    def set_physical_resolution(self, w: int, h: int):
        self._phys_w = w
        self._phys_h = h

    async def _query_axis_limits(self):
        """
        Query 'getevent -p' to find the touchscreen device and its ABS_MT_POSITION max values.

        Many devices (Xiaomi/Qualcomm) report axis info using hex event codes (0035/0036)
        rather than named constants (ABS_MT_POSITION_X/Y), so we match both formats.
        We also detect which /dev/input/eventN to capture from (device with ABS 0035+0036).
        """
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [ADB_PATH, "-s", self.udid, "shell", "getevent", "-p"],
                capture_output=True, text=True, timeout=8, env=_SUBPROCESS_ENV,
            )
            output = result.stdout + result.stderr

            # Split output into per-device sections
            # Look for "add device N: /dev/input/eventX" headers
            sections = re.split(r'add device \d+: (/dev/input/\w+)', output)
            # sections = ['', '/dev/input/event0', 'section0', '/dev/input/event1', 'section1', ...]
            found_device = None
            found_max_x = None
            found_max_y = None

            for i in range(1, len(sections) - 1, 2):
                dev_path = sections[i]
                dev_body = sections[i + 1] if i + 1 < len(sections) else ""

                # Match: "0035  : value 0, min 0, max 19520" OR "ABS_MT_POSITION_X : value 0, min 0, max 19520"
                m_x = re.search(
                    r'(?:0035|ABS_MT_POSITION_X)\s*:\s*value\s*\d+,\s*min\s*\d+,\s*max\s*(\d+)',
                    dev_body,
                )
                m_y = re.search(
                    r'(?:0036|ABS_MT_POSITION_Y)\s*:\s*value\s*\d+,\s*min\s*\d+,\s*max\s*(\d+)',
                    dev_body,
                )
                if m_x and m_y:
                    found_device = dev_path
                    found_max_x = int(m_x.group(1))
                    found_max_y = int(m_y.group(1))
                    break  # take first device with both axes

            if found_device and found_max_x and found_max_y:
                self._touch_device = found_device
                self._max_x = found_max_x
                self._max_y = found_max_y
                logger.info(
                    f"[GETEVENT] Device: {found_device} "
                    f"max_x={self._max_x} max_y={self._max_y} phys={self._phys_w}x{self._phys_h}"
                )
            else:
                logger.warning(f"[GETEVENT] Could not parse axis limits — using defaults {self._max_x}/{self._max_y}")
        except Exception as e:
            logger.warning(f"[GETEVENT] axis query failed ({e}), defaults: {self._max_x}/{self._max_y}")

    def _normalize(self, raw_x: int, raw_y: int) -> Tuple[int, int]:
        """Raw getevent values → physical screen pixel coordinates."""
        if self._max_x <= 0 or self._max_y <= 0:
            return raw_x, raw_y
        x = int(raw_x * self._phys_w / self._max_x)
        y = int(raw_y * self._phys_h / self._max_y)
        return x, y

    async def start(self, on_tap: Callable, on_swipe: Callable):
        await self._query_axis_limits()
        self._running = True
        self._state = TouchState()

        # Capture ALL input devices — scrcpy creates a virtual uinput device that may
        # appear AFTER startup and won't be in the initial device list from getevent -p.
        # Specifying a single device (like focaltech_ts) misses scrcpy virtual touches.
        self._process = await asyncio.create_subprocess_exec(
            ADB_PATH, "-s", self.udid, "shell", "getevent", "-lt",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_SUBPROCESS_ENV,
        )
        self._read_task = asyncio.create_task(
            self._read_loop(on_tap, on_swipe), name=f"getevent_{self.udid}"
        )
        logger.info(f"[GETEVENT] Started for {self.udid} capturing all devices")

    async def _read_loop(self, on_tap: Callable, on_swipe: Callable):
        buf = ""
        while self._running and self._process:
            try:
                chunk = await asyncio.wait_for(self._process.stdout.read(2048), timeout=1.0)
                if not chunk:
                    break
                buf += chunk.decode("utf-8", errors="ignore")
                lines = buf.split("\n")
                buf = lines.pop()
                for line in lines:
                    self._parse_line(line, on_tap, on_swipe)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                if self._running:
                    logger.error(f"[GETEVENT] Read error: {e}")
                break

    def _parse_line(self, line: str, on_tap: Callable, on_swipe: Callable):
        """
        Parse one getevent -lt line.
        Format: [timestamp] /dev/input/eventN: EV_TYPE  EVENT_CODE  hex_value
        """
        state = self._state

        if "ABS_MT_TRACKING_ID" in line:
            hex_val = line.strip().split()[-1]
            try:
                val = int(hex_val, 16)
                if val == 0xFFFFFFFF:
                    # Finger lifted — classify and emit
                    if state.touching and state.curr_x is not None and state.curr_y is not None:
                        sx = state.start_x if state.start_x is not None else state.curr_x
                        sy = state.start_y if state.start_y is not None else state.curr_y
                        nx_s, ny_s = self._normalize(sx, sy)
                        nx_e, ny_e = self._normalize(state.curr_x, state.curr_y)
                        logger.info(
                            f"[GETEVENT] raw=({state.curr_x},{state.curr_y}) "
                            f"max=({self._max_x},{self._max_y}) "
                            f"→ norm=({nx_e},{ny_e})"
                        )
                        gesture = self._classify(nx_s, ny_s, nx_e, ny_e)
                        if gesture == "tap":
                            asyncio.create_task(on_tap(nx_e, ny_e))
                        else:
                            asyncio.create_task(on_swipe(gesture, nx_s, ny_s, nx_e, ny_e))
                    state.reset()
                else:
                    state.touching = True
            except ValueError:
                pass

        elif "ABS_MT_POSITION_X" in line:
            hex_val = line.strip().split()[-1]
            try:
                val = int(hex_val, 16)
                if state.start_x is None:
                    state.start_x = val
                state.curr_x = val
            except ValueError:
                pass

        elif "ABS_MT_POSITION_Y" in line:
            hex_val = line.strip().split()[-1]
            try:
                val = int(hex_val, 16)
                if state.start_y is None:
                    state.start_y = val
                state.curr_y = val
            except ValueError:
                pass

    @staticmethod
    def _classify(sx: int, sy: int, ex: int, ey: int) -> str:
        dx, dy = ex - sx, ey - sy
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < 30:
            return "tap"
        if abs(dy) >= abs(dx):
            return "swipe_up" if dy < 0 else "swipe_down"
        return "swipe_left" if dx < 0 else "swipe_right"

    async def stop(self):
        self._running = False
        if self._read_task:
            self._read_task.cancel()
            try:
                await self._read_task
            except asyncio.CancelledError:
                pass
            self._read_task = None
        if self._process:
            try:
                self._process.terminate()
                await asyncio.sleep(0.3)
            except Exception:
                pass
            self._process = None
        logger.info(f"[GETEVENT] Stopped for {self.udid}")


# ─── Element Lookup Service (element map fallback) ────────────────────────────

class ElementLookupService:
    """
    Fallback lookup when u2 dump can't identify the element.
    Searches pre-scanned element map by coordinates, restricted to current screen.
    """

    def __init__(self, element_map: dict):
        self.element_map = element_map

    def find_by_coords(self, x: int, y: int, screen_name: str = None) -> Optional[dict]:
        if not self.element_map or not self.element_map.get("screens"):
            return None
        screens = self.element_map["screens"]
        if screen_name:
            if screen_name in screens:
                screens = {screen_name: screens[screen_name]}
            else:
                matched = {
                    k: v for k, v in screens.items()
                    if screen_name.lower() in k.lower() or k.lower() in screen_name.lower()
                }
                if matched:
                    screens = matched

        best: Optional[dict] = None
        best_area = float("inf")
        for sname, sdata in screens.items():
            for el in sdata.get("elements", []):
                eid = el.get("id", "")
                if not eid:
                    continue
                m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", el.get("bounds", ""))
                if not m:
                    continue
                x1, y1, x2, y2 = map(int, m.groups())
                if x1 <= x <= x2 and y1 <= y <= y2:
                    area = (x2 - x1) * (y2 - y1)
                    if area < best_area:
                        best_area = area
                        best = {**el, "screen_name": sname}
        return best

    def find_by_text(self, text: str) -> Optional[dict]:
        if not self.element_map or not self.element_map.get("screens"):
            return None
        for sname, sdata in self.element_map["screens"].items():
            for group in sdata.get("maestro_selectors", []):
                el = group.get("element", {})
                if el.get("text") == text and el.get("id"):
                    return {"id": el["id"], "screen_name": sname, "class": el.get("class", "")}
        return None

    def find_by_desc(self, desc: str) -> Optional[dict]:
        if not self.element_map or not self.element_map.get("screens"):
            return None
        for sname, sdata in self.element_map["screens"].items():
            for group in sdata.get("maestro_selectors", []):
                el = group.get("element", {})
                if el.get("content_desc") == desc and el.get("id"):
                    return {"id": el["id"], "screen_name": sname, "class": el.get("class", "")}
        return None


# ─── Interaction Recorder ─────────────────────────────────────────────────────

PENDING_INPUT = "__PENDING_INPUT__"


class InteractionRecorder:
    """
    Combines ADB getevent (touch detection) with u2 live dump (element identification).

    Flow:
      getevent tap at (x, y)
        → u2 dump_hierarchy at (x, y) with retry   [live, safe for scrcpy]
        → _resolve_from_dump: resource_id → text → content_desc
        → fallback: element map bounds search
        → fallback: tapOn point: "x,y"
      → assertVisible + tapOn (+ pending inputText if EditText)
      → broadcast via SSE + WebSocket
    """

    # Minimum interval between two consecutive taps (seconds).
    # Prevents duplicate steps when the frontend fires multiple pointer events for one click.
    _TAP_DEBOUNCE_S: float = 0.6

    def __init__(self, ws_broadcaster):
        self.ws_broadcaster = ws_broadcaster
        self.is_recording: bool = False
        self.recorded_steps: List[dict] = []
        self.udid: str = ""
        self.project_id: Optional[str] = None
        self._recording_id: str = ""
        self._physical_resolution: Tuple[int, int] = (1080, 2400)
        self._app_package: str = ""
        self._prev_activity: Optional[str] = None
        self._element_map: Optional[dict] = None
        self._lookup: Optional[ElementLookupService] = None
        self._capture: Optional[AdbEventCapture] = None
        self._d = None  # u2 device (for live dump)
        # SSE subscribers
        self._sse_queues: List[asyncio.Queue] = []
        # Debounce: timestamp of the last accepted tap
        self._last_tap_ts: float = 0.0
        # Semaphore: serialised lazily in the first async call
        # (can't create asyncio primitives before the event loop starts)
        self._dump_sem: Optional[asyncio.Semaphore] = None

    # ── SSE pub/sub ───────────────────────────────────────────────────────────

    def subscribe_sse(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=128)
        self._sse_queues.append(q)
        return q

    def unsubscribe_sse(self, q: asyncio.Queue):
        try:
            self._sse_queues.remove(q)
        except ValueError:
            pass

    async def _broadcast(self, step_data: dict):
        for q in list(self._sse_queues):
            try:
                q.put_nowait(step_data)
            except asyncio.QueueFull:
                pass
        try:
            await self.ws_broadcaster.broadcast(RunEvent(
                type=EventType.STEP_RECORDED,
                run_id="recording",
                data=step_data,
            ))
        except Exception:
            pass

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start_recording(self, udid: str, project_id: str = None) -> str:
        from android.ui_inspector import UIInspector
        from android.element_scanner import load_element_map
        from android.device_manager import device_manager_instance

        self.udid = udid
        self.is_recording = True
        self.recorded_steps = []
        self.project_id = project_id
        self._recording_id = f"rec_{udid}_{int(time.time())}"

        # Connect u2 device for live dump during recording
        try:
            self._d = device_manager_instance.connect(udid)
        except Exception as e:
            logger.warning(f"[RECORDING] u2 connect failed: {e} — element map only")

        # Physical resolution (matches element map coordinate space)
        phys = await asyncio.to_thread(UIInspector.get_physical_resolution, udid)
        self._physical_resolution = phys if phys else (1220, 2712)
        logger.info(f"[RECORDING] Resolution: {self._physical_resolution}, device: {udid}")

        # Foreground app
        self._app_package = await asyncio.to_thread(UIInspector.get_foreground_package, udid)
        logger.info(f"[RECORDING] App: {self._app_package}")

        # Load element map (fallback for screens not covered by live dump)
        if project_id:
            try:
                emap = load_element_map(project_id)
                if emap:
                    self._element_map = emap
                    self._lookup = ElementLookupService(emap)
                    logger.info(f"[RECORDING] Element map: {len(emap.get('screens', {}))} screens")
                else:
                    logger.warning(f"[RECORDING] No element map for project {project_id}")
            except Exception as e:
                logger.warning(f"[RECORDING] Element map load failed: {e}")

        try:
            self._prev_activity = await asyncio.to_thread(UIInspector.get_current_activity, udid)
        except Exception:
            pass

        # Start getevent capture
        self._capture = AdbEventCapture(udid)
        self._capture.set_physical_resolution(*self._physical_resolution)
        await self._capture.start(on_tap=self._on_tap, on_swipe=self._on_swipe)

        try:
            await self.ws_broadcaster.broadcast(RunEvent(
                type=EventType.RECORDING_STARTED,
                run_id="recording",
                data={"udid": udid, "recording_id": self._recording_id},
            ))
        except Exception:
            pass

        logger.info(f"[RECORDING] Started: {self._recording_id}")
        return self._recording_id

    async def stop_recording(self) -> List[dict]:
        self.is_recording = False
        if self._capture:
            await self._capture.stop()
            self._capture = None

        for q in list(self._sse_queues):
            try:
                q.put_nowait({"__done__": True})
            except asyncio.QueueFull:
                pass

        try:
            await self.ws_broadcaster.broadcast(RunEvent(
                type=EventType.RECORDING_STOPPED,
                run_id="recording",
                data={"step_count": len(self.recorded_steps)},
            ))
        except Exception:
            pass

        steps = self.recorded_steps.copy()
        logger.info(f"[RECORDING] Stopped: {len(steps)} steps")
        return steps

    async def handle_frontend_tap(
        self,
        stream_x: int,
        stream_y: int,
        stream_width: Optional[int] = None,
        stream_height: Optional[int] = None,
    ):
        """
        Entry point when the frontend intercepts a DevicePreview click.
        Debounced — ignores calls that arrive faster than _TAP_DEBOUNCE_S seconds apart.
        Scales stream coordinates → physical device pixels, then identifies element via u2 dump.
        """
        now = time.time()
        elapsed = now - self._last_tap_ts
        if elapsed < self._TAP_DEBOUNCE_S:
            logger.debug(f"[DEBOUNCE] tap ignored ({elapsed:.2f}s < {self._TAP_DEBOUNCE_S}s)")
            return
        self._last_tap_ts = now

        phys_x, phys_y = self._scale_to_physical(stream_x, stream_y, stream_width, stream_height)
        logger.info(f"[FRONTEND_TAP] stream=({stream_x},{stream_y}) → phys=({phys_x},{phys_y})")
        await self._on_tap(phys_x, phys_y)

    def _scale_to_physical(
        self,
        stream_x: int,
        stream_y: int,
        stream_width: Optional[int],
        stream_height: Optional[int],
    ) -> Tuple[int, int]:
        """Convert scrcpy stream pixel coords → physical device pixel coords."""
        phys_w, phys_h = self._physical_resolution

        # Try to get stream dims from scrcpy client if not provided
        if not stream_width or not stream_height:
            try:
                from ws.stream_manager import screen_stream_manager
                client = screen_stream_manager.scrcpy_clients.get(self.udid)
                if client and client.frame_width and client.frame_height:
                    stream_width = client.frame_width
                    stream_height = client.frame_height
            except Exception:
                pass

        if not stream_width or stream_width == phys_w:
            return stream_x, stream_y

        phys_x = int(stream_x * phys_w / stream_width)
        phys_y = int(stream_y * phys_h / stream_height)
        return phys_x, phys_y

    async def confirm_input(self, step_index: int, text: str) -> dict:
        """Resolve a pending inputText step with the actual text value."""
        if 0 <= step_index < len(self.recorded_steps):
            step = self.recorded_steps[step_index]
            if step.get("action") == "inputText" and step.get("is_pending"):
                step["value"] = text
                step["maestro_command"] = f'- inputText: "{text}"'
                step["is_pending"] = False
                await self._broadcast({**step, "step_index": step_index, "updated": True})
                return step
        return {}

    # ── Element identification ────────────────────────────────────────────────

    async def _identify_element(self, x: int, y: int) -> dict:
        """
        Identify element at physical coords (x, y).

        1. u2 dump_hierarchy — live dump, works on any screen, safe for scrcpy
        2. element map bounds lookup — restricted to confirmed current screen
        3. fallback: None (caller uses point coords)
        """
        from android.ui_inspector import UIInspector

        # ── 1. Live u2 dump (primary) ──────────────────────────────────────
        # Serialised via semaphore — concurrent dumps on Xiaomi kill scrcpy stream.
        if self._d:
            if self._dump_sem is None:
                self._dump_sem = asyncio.Semaphore(1)
            element_info = {}
            async with self._dump_sem:
                for attempt in range(3):
                    try:
                        info = await asyncio.to_thread(
                            UIInspector.get_element_at_safe, self._d, x, y
                        )
                        rid = info.get("resource_id", "")
                        is_sys = rid and any(rid.startswith(p) for p in SYSTEM_PREFIXES)
                        has_data = (rid and not is_sys) or info.get("text") or info.get("content_desc")
                        if has_data:
                            element_info = info
                            break
                        if attempt < 2:
                            await asyncio.sleep(0.5 * (attempt + 1))
                    except Exception as e:
                        logger.debug(f"[IDENTIFY] u2 dump attempt {attempt+1} failed: {e}")
                        if attempt < 2:
                            await asyncio.sleep(0.5)

            if element_info:
                rid = element_info.get("resource_id", "")
                text = element_info.get("text", "")
                desc = element_info.get("content_desc", "")
                cls = element_info.get("class_name", "")

                if rid and not any(rid.startswith(p) for p in SYSTEM_PREFIXES):
                    eid = clean_resource_id(rid)
                    return {"id": eid, "class": cls, "from_dump": True,
                            "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}

                # text lookup in element map first for a cleaner id
                if text:
                    if self._lookup:
                        match = self._lookup.find_by_text(text)
                        if match:
                            return {**match, "from_dump": True,
                                    "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}
                    return {"id": text, "class": cls, "from_dump": True, "use_text": True,
                            "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}

                if desc:
                    if self._lookup:
                        match = self._lookup.find_by_desc(desc)
                        if match:
                            return {**match, "from_dump": True,
                                    "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}
                    short = desc.split("\n")[0].strip()[:50]
                    return {"id": short, "class": cls, "from_dump": True, "use_text": True,
                            "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}

        # ── 2. Element map bounds (fallback for screens in the map) ────────
        if self._lookup:
            curr_screen = await self._current_screen()
            found = self._lookup.find_by_coords(x, y, curr_screen)
            if found and found.get("id"):
                cls = found.get("class", "")
                return {**found, "from_map": True,
                        "is_focusable": any(fc in cls for fc in FOCUSABLE_CLASSES)}

        return {}

    def _build_steps(self, element: dict, x: int, y: int) -> List[dict]:
        """
        Build assertVisible + tapOn steps (+ pending inputText if EditText).

        Priority:
          1. element has 'id' (resource-id or text from element map with id)
          2. element has 'use_text' → tapOn by text
          3. no element → tapOn point: "x,y"
        """
        steps: List[dict] = []
        is_focusable = element.get("is_focusable", False)
        eid = element.get("id", "")
        use_text = element.get("use_text", False)
        screen = element.get("screen_name")

        if eid and not use_text:
            steps.append({
                "action": "assertVisible",
                "elementId": eid,
                "maestro_command": f'- assertVisible:\n    id: "{eid}"',
                "auto_generated": True,
                **({"screen_name": screen} if screen else {}),
            })
            steps.append({
                "action": "tapOn",
                "elementId": eid,
                "maestro_command": f'- tapOn:\n    id: "{eid}"',
                "is_focusable": is_focusable,
                "x": x, "y": y,
                **({"screen_name": screen} if screen else {}),
            })
        elif eid and use_text:
            steps.append({
                "action": "assertVisible",
                "elementId": eid,
                "maestro_command": f'- assertVisible:\n    text: "{eid}"',
                "auto_generated": True,
            })
            steps.append({
                "action": "tapOn",
                "elementId": eid,
                "maestro_command": f'- tapOn: "{eid}"',
                "is_focusable": is_focusable,
                "x": x, "y": y,
            })
        else:
            steps.append({
                "action": "tapOn",
                "elementId": f"{x},{y}",
                "maestro_command": f'- tapOn:\n    point: "{x},{y}"',
                "is_focusable": False,
                "fallback": True,
                "x": x, "y": y,
            })

        if is_focusable:
            steps.append({
                "action": "inputText",
                "elementId": eid,
                "value": PENDING_INPUT,
                "maestro_command": f'- inputText: "{PENDING_INPUT}"',
                "is_pending": True,
            })

        return steps

    # ── Event handlers ────────────────────────────────────────────────────────

    async def _current_screen(self) -> Optional[str]:
        try:
            from android.ui_inspector import UIInspector
            return await asyncio.to_thread(UIInspector.get_current_activity, self.udid)
        except Exception:
            return None

    async def _on_tap(self, x: int, y: int):
        if not self.is_recording:
            return
        logger.info(f"[TAP] ({x}, {y})")

        curr_screen = await self._current_screen()

        # Screen change → insert assertVisible for transition
        if curr_screen and curr_screen != self._prev_activity:
            logger.info(f"[RECORDING] Screen: {self._prev_activity} → {curr_screen}")
            self._prev_activity = curr_screen
            await asyncio.sleep(0.5)

        element = await self._identify_element(x, y)

        steps = self._build_steps(element, x, y)
        for step in steps:
            idx = len(self.recorded_steps)
            self.recorded_steps.append(step)
            await self._broadcast({**step, "step_index": idx})

        eid = element.get("id", f"{x},{y}")
        src = "dump" if element.get("from_dump") else ("map" if element.get("from_map") else "coords")
        logger.info(f"[TAP] → {eid!r} [{src}]")

    async def _on_swipe(self, direction: str, sx: int, sy: int, ex: int, ey: int):
        if not self.is_recording:
            return
        logger.info(f"[SWIPE] {direction} ({sx},{sy})→({ex},{ey})")

        scroll_map = {
            "swipe_down": ("scroll", "- scroll", "DOWN"),
            "swipe_up": ("scroll", "- scroll:\n    direction: UP", "UP"),
            "swipe_left": ("swipe", "- swipe:\n    direction: LEFT", "LEFT"),
            "swipe_right": ("swipe", "- swipe:\n    direction: RIGHT", "RIGHT"),
        }
        if direction in scroll_map:
            action, cmd, dir_label = scroll_map[direction]
            step = {"action": action, "elementId": "", "maestro_command": cmd, "direction": dir_label}
            idx = len(self.recorded_steps)
            self.recorded_steps.append(step)
            await self._broadcast({**step, "step_index": idx})


# ─── Module-level registry ────────────────────────────────────────────────────

active_recorders: Dict[str, InteractionRecorder] = {}
