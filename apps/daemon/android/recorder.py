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


def _is_text_input_class(cls: str) -> bool:
    """Return True only when `cls` is a real text-input widget.

    The previous check was a substring match (`any(fc in cls)`) which
    mis-fires on any class whose name happens to contain "EditText" as
    a substring — obscure widget wrappers, accessibility delegates, or
    Compose nodes that bubble an EditText accessibility class up to a
    Button container. On the Foxbit welcome screen the "Entrar" button
    was matching incorrectly; the recorder then emitted a pending
    `inputText` step right after the tap, and the user typing their
    email landed on a step bound to `bt_welcome_login` (a button).

    Tighter rule: the class name must END WITH the focusable type, so
    `androidx.appcompat.widget.AppCompatEditText` still matches while
    `androidx.compose.ui.platform.ComposeButtonWithEditTextLabel`
    doesn't.
    """
    if not cls:
        return False
    return any(cls.endswith(fc) for fc in FOCUSABLE_CLASSES)


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

    def get_first_element_for_screen(self, screen_name: Optional[str]) -> Optional[dict]:
        """Return the first identifiable element of a screen (by activity name).

        Used to emit an auto-`assertVisible` whenever the recorder detects a
        screen transition. Prefers elements with a stable resource-id; falls
        back to anything that has a usable selector.

        Matching is fuzzy: if `screen_name` doesn't appear verbatim in the
        element_map, we try substring matches against each screen key (the
        scanner sometimes uses friendly names like `LoginActivity` while the
        device reports the package-qualified `com.app.activities.LoginActivity`).
        """
        if not self.element_map or not self.element_map.get("screens") or not screen_name:
            return None
        screens = self.element_map["screens"]
        candidate = None
        if screen_name in screens:
            candidate = screens[screen_name]
            matched_name = screen_name
        else:
            for k, v in screens.items():
                if screen_name.lower() in k.lower() or k.lower() in screen_name.lower():
                    candidate = v
                    matched_name = k
                    break
        if not candidate:
            return None
        for el in candidate.get("elements", []):
            if el.get("id"):
                return {**el, "screen_name": matched_name}
        # No element with a clean id — last-ditch: pick the first that has text
        for el in candidate.get("elements", []):
            if el.get("text") or el.get("content_desc"):
                return {**el, "screen_name": matched_name}
        return None


# ─── Interaction Recorder ─────────────────────────────────────────────────────

PENDING_INPUT = "__PENDING_INPUT__"


async def _adb_input_text(udid: str, text: str) -> None:
    """Type `text` on the connected device via `adb shell input text`.

    `input text` doesn't accept literal spaces (they become tab stops) or
    several shell metacharacters. We follow the standard adb workaround:
      • space → '%s'
      • single-quote each chunk so the shell doesn't interpret it
      • split by single-quote boundaries to keep escaping simple
    Special characters in passwords (@, !, &, etc.) work fine inside the
    single-quote envelope on stock Android shell.
    """
    if not text:
        return
    # Replace literal spaces with the special token recognised by input text.
    safe = text.replace(" ", "%s")
    # Drop any embedded single-quotes by closing/quoting/escaping them, then
    # reopening the quote. This is the canonical shell escape for adb input.
    parts = safe.split("'")
    escaped = "'" + "'\\''".join(parts) + "'"
    proc = await asyncio.create_subprocess_exec(
        "adb", "-s", udid, "shell", "input", "text", escaped,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(proc.wait(), timeout=8)
    except asyncio.TimeoutError:
        try: proc.kill()
        except Exception: pass


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
        # When the recorder is waiting for the user to confirm the text for a
        # pending inputText step, taps on the device's soft keyboard would
        # otherwise be captured as separate `tapOn` events on the focused
        # EditText (showing up as N spurious `0_resource_name_obfuscated`
        # steps for an N-char password). While this gate is set, _on_tap
        # becomes a no-op.
        self._pending_input: bool = False

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

    async def start_recording(
        self,
        udid: str,
        project_id: str = None,
        app_id: Optional[str] = None,
        clear_state: bool = False,
    ) -> str:
        """Start a recording session.

        If `app_id` is provided, the daemon launches the app on the device
        BEFORE the getevent capture begins. This matches what the recorded
        `launchApp` step does at replay time, so the user's first interactions
        are always captured on the app's actual first screen — not on
        whatever was open when they clicked Gravar.

        `clear_state=True` first force-stops the package so the app starts
        from a clean state (matching `launchApp: clearState: true` in YAML).
        """
        from android.ui_inspector import UIInspector
        from android.element_scanner import load_element_map
        from android.device_manager import device_manager_instance

        self.udid = udid
        self.is_recording = True
        self.recorded_steps = []
        self.project_id = project_id
        self._recording_id = f"rec_{udid}_{int(time.time())}"

        # ── Launch the target app (best-effort) ──
        # We INTENTIONALLY don't use `am force-stop` here, even when clearState
        # is requested. The reason: force-stop tears down the foreground app's
        # SurfaceFlinger surface, and the scrcpy H.264 encoder doesn't emit a
        # fresh keyframe for the new surface — the browser decoder freezes on
        # the last decoded frame (control channel still works, video doesn't).
        #
        # Trade-off accepted:
        #   • During RECORDING, the app comes up wherever it naturally opens.
        #     The user is responsible for being at the desired starting screen
        #     before clicking Gravar.
        #   • During REPLAY, the `launchApp: clearState: true` step at the top
        #     of the YAML is what actually guarantees a clean start — Maestro
        #     handles that on its own driver (no scrcpy in the loop).
        #
        # `monkey -p <pkg> -c LAUNCHER 1` brings the app's launcher activity
        # to the foreground without killing the process, so the surface
        # survives and the mirror stays smooth.
        if app_id:
            try:
                p = await asyncio.create_subprocess_exec(
                    "adb", "-s", udid, "shell", "monkey", "-p", app_id,
                    "-c", "android.intent.category.LAUNCHER", "1",
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(p.wait(), timeout=8)
                logger.info(f"[RECORDING] launched {app_id} (clearState={clear_state} honored only at replay time)")
                # Brief settle so getevent doesn't pick up the launch's own
                # micro-taps (e.g. the launcher's app-open ripple).
                await asyncio.sleep(0.4)
            except Exception as e:
                logger.warning(f"[RECORDING] launch {app_id} failed: {e} — proceeding anyway")

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
        """Resolve a pending inputText step with the actual text value AND
        type that value on the device. Without the device-side type, the
        user would have to physically tap the soft keyboard — and each
        character would register as a separate tapOn step on the focused
        EditText (the `0_resource_name_obfuscated` artifact in password
        fields). After the type lands, we clear the gate so subsequent
        taps on different elements resume being recorded normally.
        """
        result: dict = {}
        if 0 <= step_index < len(self.recorded_steps):
            step = self.recorded_steps[step_index]
            if step.get("action") == "inputText" and step.get("is_pending"):
                step["value"] = text
                step["maestro_command"] = f'- inputText: "{text}"'
                step["is_pending"] = False
                await self._broadcast({**step, "step_index": step_index, "updated": True})
                result = step

        # Best-effort device-side type: even if the step bookkeeping above
        # didn't match (e.g. user re-submitted after the recording ended),
        # we still try to put the text in the focused field for parity with
        # what the recorder UI implies happened.
        if text and self.udid:
            try:
                await _adb_input_text(self.udid, text)
            except Exception as e:
                logger.warning(f"[confirm_input] device type failed: {e}")
            # Tiny settle so we don't catch the IME's release event as a tap.
            await asyncio.sleep(0.25)

        # Always lift the gate, even on errors, so the recorder doesn't
        # get stuck swallowing taps.
        self._pending_input = False
        return result

    # ── Element identification ────────────────────────────────────────────────

    async def _identify_element(self, x: int, y: int, pre_tap_xml: Optional[str] = None) -> dict:
        """
        Identify element at physical coords (x, y).

        1. pre-tap XML snapshot (preferred) — captured by _on_tap before any
           await so we always look up against the screen the user actually
           tapped, not whatever screen the navigation transitioned to.
        2. u2 dump_hierarchy — live dump, fallback for when snapshot failed
           or didn't include a meaningful element.
        3. element map bounds lookup — restricted to current screen.
        4. fallback: None (caller uses point coords)
        """
        from android.ui_inspector import UIInspector, _find_element_in_xml

        # ── 1. Pre-tap XML snapshot (preferred when available) ─────────────
        if pre_tap_xml:
            try:
                info = _find_element_in_xml(pre_tap_xml, x, y)
                rid = info.get("resource_id", "") if info else ""
                is_sys = rid and any(rid.startswith(p) for p in SYSTEM_PREFIXES)
                has_data = info and ((rid and not is_sys) or info.get("text") or info.get("content_desc"))
                if has_data:
                    cls = info.get("class_name", "") or info.get("class", "")
                    if rid and not is_sys:
                        eid = clean_resource_id(rid)
                        logger.info(f"[IDENTIFY] pre-tap snapshot → id={eid}")
                        return {"id": eid, "class": cls, "from_dump": True,
                                "is_focusable": _is_text_input_class(cls)}
                    # No resource-id but has text/desc — use text-based selector
                    text = info.get("text", "")
                    desc = info.get("content_desc", "")
                    if text:
                        if self._lookup:
                            m = self._lookup.find_by_text(text)
                            if m:
                                return {**m, "from_dump": True,
                                        "is_focusable": _is_text_input_class(cls)}
                        return {"id": text, "class": cls, "from_dump": True, "use_text": True,
                                "is_focusable": _is_text_input_class(cls)}
                    if desc:
                        if self._lookup:
                            m = self._lookup.find_by_desc(desc)
                            if m:
                                return {**m, "from_dump": True,
                                        "is_focusable": _is_text_input_class(cls)}
                        short = desc.split("\n")[0].strip()[:50]
                        return {"id": short, "class": cls, "from_dump": True, "use_text": True,
                                "is_focusable": _is_text_input_class(cls)}
            except Exception as e:
                logger.debug(f"[IDENTIFY] pre-tap snapshot parse failed: {e}")

        # ── 2. Live u2 dump (fallback when snapshot missed) ────────────────
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
                            "is_focusable": _is_text_input_class(cls)}

                # text lookup in element map first for a cleaner id
                if text:
                    if self._lookup:
                        match = self._lookup.find_by_text(text)
                        if match:
                            return {**match, "from_dump": True,
                                    "is_focusable": _is_text_input_class(cls)}
                    return {"id": text, "class": cls, "from_dump": True, "use_text": True,
                            "is_focusable": _is_text_input_class(cls)}

                if desc:
                    if self._lookup:
                        match = self._lookup.find_by_desc(desc)
                        if match:
                            return {**match, "from_dump": True,
                                    "is_focusable": _is_text_input_class(cls)}
                    short = desc.split("\n")[0].strip()[:50]
                    return {"id": short, "class": cls, "from_dump": True, "use_text": True,
                            "is_focusable": _is_text_input_class(cls)}

        # ── 2. Element map bounds (fallback for screens in the map) ────────
        if self._lookup:
            curr_screen = await self._current_screen()
            found = self._lookup.find_by_coords(x, y, curr_screen)
            if found and found.get("id"):
                cls = found.get("class", "")
                return {**found, "from_map": True,
                        "is_focusable": _is_text_input_class(cls)}

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
            # Gate subsequent taps until the frontend resolves the value.
            # `confirm_input` clears this when the user confirms in the modal.
            self._pending_input = True

        return steps

    # ── Event handlers ────────────────────────────────────────────────────────

    async def _current_screen(self) -> Optional[str]:
        try:
            from android.ui_inspector import UIInspector
            return await asyncio.to_thread(UIInspector.get_current_activity, self.udid)
        except Exception:
            return None

    async def _build_screen_assert(self, screen_name: Optional[str]) -> Optional[dict]:
        """Compose an `assertVisible` step for the first identifiable element
        of `screen_name`. Returns None when no element can be resolved, so the
        caller skips the assert rather than emitting an invalid YAML stub.

        Resolution order:
          1. ElementLookupService (pre-scanned element_map) — preferred,
             gives a clean resource-id matching the recording's `screen_name`.
          2. Live uiautomator dump — fallback if the map is missing the
             screen. We walk the XML for the first element with a non-system
             resource-id; ignores android.* IDs (system chrome).
        """
        if not screen_name:
            return None

        eid: Optional[str] = None
        screen: Optional[str] = None

        # 1. Pre-scanned map (best case)
        try:
            mapped = self._lookup.get_first_element_for_screen(screen_name)
            if mapped and mapped.get("id"):
                eid = mapped["id"]
                screen = mapped.get("screen_name") or screen_name
        except Exception as e:
            logger.debug(f"[screen_assert] map lookup failed: {e}")

        # 2. Live dump fallback
        if not eid:
            try:
                from android.ui_inspector import UIInspector
                import xml.etree.ElementTree as ET
                from android.device_manager import device_manager_instance
                device = await asyncio.to_thread(device_manager_instance.connect, self.udid)
                xml = await asyncio.to_thread(UIInspector.dump_via_u2, device) if device else None
                if xml:
                    root = ET.fromstring(xml)
                    for node in root.iter():
                        rid = node.get("resource-id", "")
                        if not rid:
                            continue
                        # Skip Android system IDs (status bar, nav, etc.)
                        if rid.startswith("android:") or rid.startswith("com.android.systemui:"):
                            continue
                        clean = rid.split("/", 1)[-1] if "/" in rid else rid
                        if clean:
                            eid = clean
                            screen = screen_name
                            break
            except Exception as e:
                logger.debug(f"[screen_assert] live dump failed: {e}")

        if not eid:
            return None

        return {
            "action": "assertVisible",
            "elementId": eid,
            "maestro_command": f'- assertVisible:\n    id: "{eid}"',
            "auto_generated": True,
            "screen_name": screen or screen_name,
        }

    async def _on_tap(self, x: int, y: int):
        if not self.is_recording:
            return
        if self._pending_input:
            # Swallow taps while a pending inputText is awaiting confirmation.
            # Each character the user types on the device's keyboard would
            # otherwise be captured as a separate tapOn on the focused
            # EditText, polluting the recording.
            logger.info(f"[TAP] ({x}, {y}) — ignored (pending input awaiting confirm)")
            return
        logger.info(f"[TAP] ({x}, {y})")

        # CRITICAL: snapshot the view hierarchy AS THE FIRST ACTION, BEFORE any
        # await that could let the device transition to the next screen. The
        # most common bug we hit is:
        #   1. user taps "Entrar" button on welcome (button has resource-id)
        #   2. screen starts transitioning to login form (~200ms)
        #   3. _on_tap awaits _current_screen() and the screen-change check
        #   4. by the time _identify_element runs, the dump returns the LOGIN
        #      screen's hierarchy — (x,y) doesn't match any clickable there →
        #      fallback to coordinates, defeating the whole point of the scan.
        # Snapshotting now binds the lookup to the screen the user actually
        # tapped on.
        pre_tap_xml: Optional[str] = None
        if self._d:
            try:
                from android.ui_inspector import UIInspector
                if self._dump_sem is None:
                    self._dump_sem = asyncio.Semaphore(1)
                async with self._dump_sem:
                    pre_tap_xml = await asyncio.to_thread(UIInspector.dump_via_u2, self._d)
            except Exception as e:
                logger.debug(f"[TAP] pre-tap dump failed: {e}")

        curr_screen = await self._current_screen()

        # Screen change → auto-emit an assertVisible for the new screen so the
        # generated YAML confirms we've landed where the user expected before
        # acting. Without this the flow can pass even if a previous step
        # navigated to the wrong screen.
        screen_changed = bool(curr_screen and curr_screen != self._prev_activity)
        if screen_changed:
            logger.info(f"[RECORDING] Screen: {self._prev_activity} → {curr_screen}")
            self._prev_activity = curr_screen
            await asyncio.sleep(0.5)
            assert_step = await self._build_screen_assert(curr_screen)
            if assert_step:
                # Don't emit if the same element is already the last recorded
                # step — happens when the previous screen's exit step landed
                # on the same id that's first-visible on the new screen.
                last = self.recorded_steps[-1] if self.recorded_steps else None
                if (
                    last
                    and last.get("action") == "assertVisible"
                    and last.get("elementId") == assert_step.get("elementId")
                ):
                    logger.info(f"[RECORDING] dedup: skipping screen-change assertVisible id={assert_step.get('elementId')!r}")
                else:
                    idx = len(self.recorded_steps)
                    self.recorded_steps.append(assert_step)
                    await self._broadcast({**assert_step, "step_index": idx})

        element = await self._identify_element(x, y, pre_tap_xml=pre_tap_xml)

        steps = self._build_steps(element, x, y)
        for step in steps:
            # Dedupe consecutive assertVisible steps on the same element.
            # Two paths emit asserts:
            #   1. _build_screen_assert on screen change (appended directly above)
            #   2. _build_steps emits its own assertVisible for the tapped element
            # When the first visible element of the new screen IS the one the
            # user just tapped (common: user navigates to a screen with a
            # single prominent button), both asserts target the same element
            # and we end up with a useless duplicate.
            #
            # We compare only `action` + `elementId` — `maestro_command` would
            # be the right semantic but tiny formatting differences across
            # the two emitters (whitespace, quote style if it ever changes)
            # would silently break the dedupe. Action+id is the safe minimum.
            if step.get("action") == "assertVisible" and self.recorded_steps:
                last = self.recorded_steps[-1]
                if (
                    last.get("action") == "assertVisible"
                    and last.get("elementId") == step.get("elementId")
                    and last.get("elementId")
                ):
                    logger.info(
                        f"[TAP] dedup: skipping assertVisible id={step.get('elementId')!r} "
                        f"(prev={last.get('elementId')!r}, same)"
                    )
                    continue
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
