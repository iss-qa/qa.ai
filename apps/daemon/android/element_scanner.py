"""
Element Scanner — Automated UI element discovery via ADB hierarchy dumps.

While the user navigates through the app (via device screen or DevicePreview),
this scanner dumps the Android UI hierarchy and collects all visible elements:
resource-ids, text, hints, content-descriptions, classes, bounds.

The result is a structured element map that the AI uses to generate
accurate test steps with REAL selectors.

Supports two modes:
  - "auto": periodic dumps every 4s (background scanning)
  - "on_click": on-demand dumps triggered by user clicks on DevicePreview
"""

import asyncio
import json
import logging
import os
import re
import shutil
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

logger = logging.getLogger("element_scanner")

# Where element maps are saved
ELEMENT_MAPS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "element_maps"
ELEMENT_MAPS_DIR.mkdir(parents=True, exist_ok=True)

# ADB path
ADB_PATH = shutil.which("adb") or "/opt/homebrew/bin/adb"
_SUBPROCESS_ENV = {**os.environ, "PATH": os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin"}

# ── Notification / system element filter ──────────────────────────────────

_NOTIFICATION_PATTERNS = re.compile(
    r'^Notifica[cç][aã]o\s+d[eoa]\s+|'
    r'^Notification\s+from\s+|'
    r'^Notifica[cç][aã]o\s+do\s+Sistema',
    re.IGNORECASE,
)

_STATUS_BAR_KEYWORDS = {
    "bluetooth ativado", "bluetooth desativado", "perfil de trabalho",
    "wi-fi", "wifi", "modo aviao", "modo silencioso", "nao perturbe",
    "nao perturbar", "alarme", "carregando", "economia de bateria",
    "tem acesso a localizacao", "has location access",
    "vpn ativada", "vpn ativo",
}

_SYSTEM_PACKAGES = {
    "com.android.systemui", "com.android.launcher",
    "com.miui.home", "com.sec.android.app.launcher",
    "com.google.android.apps.nexuslauncher",
    "android",
}


def _is_notification_element(resource_id: str, text: str, content_desc: str) -> bool:
    """Return True if this element looks like a notification or status bar item."""
    if any(resource_id.startswith(pkg) for pkg in _SYSTEM_PACKAGES):
        return True
    for val in (text, content_desc):
        if not val:
            continue
        if _NOTIFICATION_PATTERNS.match(val):
            return True
        if val.lower().strip() in _STATUS_BAR_KEYWORDS:
            return True
    return False


# ── UIElement ─────────────────────────────────────────────────────────────

class UIElement:
    """A single UI element extracted from the Android hierarchy."""

    def __init__(self, resource_id: str = "", text: str = "", hint: str = "",
                 content_desc: str = "", class_name: str = "", bounds: str = "",
                 clickable: bool = False, focusable: bool = False,
                 password: bool = False, enabled: bool = True, index: int = 0):
        self.resource_id = resource_id
        self.text = text
        self.hint = hint
        self.content_desc = content_desc
        self.class_name = class_name
        self.bounds = bounds
        self.clickable = clickable
        self.focusable = focusable
        self.password = password
        self.enabled = enabled
        self.index = index

    @property
    def short_id(self) -> str:
        if '/' in self.resource_id:
            return self.resource_id.split('/')[-1]
        return self.resource_id

    @property
    def unique_key(self) -> str:
        return f"{self.short_id}|{self.text}|{self.hint}|{self.content_desc}|{self.class_name}"

    def center_point(self) -> tuple[int, int] | None:
        """Parse bounds '[x1,y1][x2,y2]' and return center (cx, cy)."""
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', self.bounds)
        if m:
            x1, y1, x2, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
            return ((x1 + x2) // 2, (y1 + y2) // 2)
        return None

    def to_dict(self) -> dict:
        d = {}
        if self.short_id:
            d["id"] = self.short_id
        if self.text:
            d["text"] = self.text
        if self.hint:
            d["hint"] = self.hint
        if self.content_desc:
            d["content_desc"] = self.content_desc
        d["class"] = self.class_name
        if self.clickable:
            d["clickable"] = True
        if self.password:
            d["password"] = True
        if self.bounds:
            d["bounds"] = self.bounds
        return d


# ── Hierarchy parsers ─────────────────────────────────────────────────────

def _parse_uiautomator_xml(xml_content: str) -> list[UIElement]:
    """Parse standard Android uiautomator dump XML into UIElements."""
    elements = []
    if not xml_content or '<hierarchy' not in xml_content:
        return elements
    try:
        root = ElementTree.fromstring(xml_content)
        for node in root.iter('node'):
            resource_id = node.get('resource-id', '')
            text = node.get('text', '')
            content_desc = node.get('content-desc', '')
            bounds = node.get('bounds', '')
            class_name = node.get('class', '')
            hint = node.get('hint', '') or node.get('hintText', '')
            clickable = node.get('clickable', 'false') == 'true'
            focusable = node.get('focusable', 'false') == 'true'
            password = node.get('password', 'false') == 'true'
            enabled = node.get('enabled', 'true') == 'true'
            index = int(node.get('index', '0'))

            if not any([resource_id, text, hint, content_desc]):
                continue
            if resource_id == 'android:id/content':
                continue
            if _is_notification_element(resource_id, text, content_desc):
                continue

            elements.append(UIElement(
                resource_id=resource_id, text=text, hint=hint,
                content_desc=content_desc, class_name=class_name,
                bounds=bounds, clickable=clickable, focusable=focusable,
                password=password, enabled=enabled, index=index,
            ))
    except Exception as e:
        logger.warning(f"[SCANNER] XML parse error: {e}")
    return elements


def _parse_maestro_hierarchy(json_node: dict) -> list[UIElement]:
    """Parse Maestro hierarchy JSON and extract elements (legacy support)."""
    elements = []

    def _walk(node: dict):
        attrs = node.get("attributes", {})
        resource_id = attrs.get("resource-id", "")
        text = attrs.get("text", "")
        hint = attrs.get("hintText", "")
        content_desc = attrs.get("accessibilityText", "")
        bounds = attrs.get("bounds", "")
        clickable = attrs.get("clickable", "false") == "true"
        focusable = attrs.get("focused", "false") == "true"
        password = attrs.get("password", "false") == "true"
        enabled = attrs.get("enabled", "true") == "true"

        if not any([resource_id, text, hint, content_desc]):
            pass
        elif _is_notification_element(resource_id, text, content_desc):
            pass
        elif resource_id == "android:id/content":
            pass
        else:
            elements.append(UIElement(
                resource_id=resource_id, text=text, hint=hint,
                content_desc=content_desc, class_name="",
                bounds=bounds, clickable=clickable, focusable=focusable,
                password=password, enabled=enabled,
            ))
        for child in node.get("children", []):
            _walk(child)

    _walk(json_node)
    return elements


# ── Screen detection ──────────────────────────────────────────────────────

async def _get_foreground_activity(udid: str) -> Optional[str]:
    """Get the current foreground activity name via ADB."""
    try:
        proc = await asyncio.create_subprocess_exec(
            ADB_PATH, '-s', udid, 'shell',
            'dumpsys', 'activity', 'activities',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=_SUBPROCESS_ENV,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        output = stdout.decode('utf-8', errors='replace')
        # Match patterns: ResumedActivity:, mResumedActivity:, mFocusedApp=
        m = re.search(r'(?:ResumedActivity|mResumedActivity|mFocusedApp)[=:]\s*ActivityRecord\{.*?\s+(\S+)/([\w.]+)', output)
        if m:
            activity = m.group(2).lstrip('.')
            parts = activity.split('.')
            return parts[-1] if parts else activity
    except Exception:
        pass
    return None


async def _get_foreground_package(udid: str) -> Optional[str]:
    """Get the current foreground app package via ADB."""
    try:
        proc = await asyncio.create_subprocess_exec(
            ADB_PATH, '-s', udid, 'shell',
            'dumpsys', 'activity', 'activities',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=_SUBPROCESS_ENV,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        output = stdout.decode('utf-8', errors='replace')
        m = re.search(r'(?:ResumedActivity|mResumedActivity|mFocusedApp)[=:]\s*ActivityRecord\{.*?\s+(\S+)/', output)
        if m:
            return m.group(1)
    except Exception:
        pass
    return None


def _detect_screen_name(elements: list[UIElement]) -> str:
    """Try to detect the current screen name from element content."""
    # Strategy 1: resource-ids with title/toolbar/header
    for el in elements:
        rid = el.short_id.lower()
        if rid and any(kw in rid for kw in ["title", "toolbar", "appbar", "header"]):
            if el.text and len(el.text) < 40:
                return el.text
            if el.content_desc and len(el.content_desc) < 40:
                return el.content_desc.split('\n')[0]

    # Strategy 2: short non-clickable text near top (skip notifications)
    for el in elements:
        if el.text and not el.clickable and len(el.text) < 30:
            if _is_notification_element("", el.text, el.content_desc):
                continue
            m = re.match(r'\[(\d+),(\d+)\]', el.bounds)
            if m and int(m.group(2)) < 250:
                return el.text

    # Strategy 3: first meaningful content_desc
    for el in elements:
        if el.content_desc and len(el.content_desc) < 40 and '\n' not in el.content_desc:
            if not _is_notification_element("", "", el.content_desc):
                return el.content_desc

    # Strategy 4: fingerprint from element IDs
    app_ids = [el.short_id for el in elements if el.short_id and not el.short_id.startswith("com.android")]
    if app_ids:
        prefixes = set()
        for rid in app_ids[:5]:
            parts = rid.split('_')
            if len(parts) >= 2:
                prefixes.add(f"{parts[0]}_{parts[1]}")
        if prefixes:
            return f"tela_{'_'.join(sorted(prefixes)[:2])}"

    return f"tela_{int(time.time()) % 10000}"


def _detect_app_package(elements: list[UIElement]) -> Optional[str]:
    """Auto-detect the target app package from resource-ids."""
    IGNORE = {"com.android", "android", "com.google.android", "com.miui", "com.samsung",
              "com.sec", "com.huawei", "com.xiaomi", "com.oneplus", "com.oppo", "com.vivo"}
    packages = []
    for el in elements:
        rid = el.resource_id
        if rid and ':' in rid:
            pkg = rid.split(':')[0]
            if not any(pkg == s or pkg.startswith(s + '.') for s in IGNORE):
                packages.append(pkg)
    if not packages:
        return None
    return Counter(packages).most_common(1)[0][0]


def _is_app_screen(elements: list[UIElement], app_package: str) -> bool:
    """Check if the current screen belongs to the target app.
    Handles both prefixed IDs (com.app:id/btn) and unprefixed IDs (btn)."""
    for el in elements:
        rid = el.resource_id
        if not rid or rid == 'android:id/content':
            continue
        # Prefixed: com.foxbit.android:id/btn_login
        if rid.startswith(app_package + ":"):
            return True
        # Unprefixed: btn_login (React Native / Compose / Flutter testTags)
        if ':' not in rid and not rid.startswith('android:') and not rid.startswith('com.android'):
            return True
    return False


# ── Element Scanner ───────────────────────────────────────────────────────

class ElementScanner:
    """
    Accumulates UI elements across multiple hierarchy dumps.
    Supports auto mode (periodic 4s) and on_click mode (user-triggered).
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._udid: str = ""
        self._project_id: str = ""
        self._project_name: str = ""
        self._screens: dict[str, dict[str, dict]] = {}  # screen_name -> {unique_key -> element_dict}
        self._screen_meta: dict[str, dict] = {}  # screen_name -> {screenshot_b64, activity, element_count}
        self._dump_count = 0
        self._element_count = 0
        self._start_time: float = 0
        self._app_package: Optional[str] = None
        self._screen_width: int = 1080
        self._screen_height: int = 2400
        self._mode: str = "auto"
        self._last_screen_name: str = ""

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def stats(self) -> dict:
        screens = len(self._screens)
        elements = sum(len(els) for els in self._screens.values())
        elapsed = int(time.time() - self._start_time) if self._start_time else 0
        return {
            "running": self._running,
            "screens_found": screens,
            "elements_found": elements,
            "dumps_completed": self._dump_count,
            "elapsed_seconds": elapsed,
            "app_package": self._app_package or "",
        }

    async def start(self, udid: str, project_id: str, mode: str = "auto", app_package: str = None, project_name: str = ""):
        if self._running:
            return
        self._running = True
        self._udid = udid
        self._project_id = project_id
        self._project_name = project_name or project_id
        self._screens = {}
        self._dump_count = 0
        self._element_count = 0
        self._start_time = time.time()
        self._app_package = app_package  # Pre-locked if provided
        self._mode = mode

        # Get screen dimensions
        await self._detect_screen_size()

        if mode == "auto":
            self._task = asyncio.create_task(self._scan_loop())
        logger.info(f"[SCANNER] Started (mode={mode}) on device {udid} for project {project_id}")

    async def stop(self) -> dict:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        element_map = self._build_element_map()
        self._save_element_map(element_map)
        logger.info(f"[SCANNER] Stopped. {self.stats}")
        return element_map

    async def dump_now(self) -> dict:
        """On-demand dump — call from on_click mode or manual trigger."""
        elements = await self._adb_dump_elements()
        if elements:
            await self._process_elements(elements)
        return self.stats

    async def _detect_screen_size(self):
        try:
            proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', self._udid, 'shell', 'wm', 'size',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=_SUBPROCESS_ENV,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            m = re.search(r'(\d+)x(\d+)', stdout.decode())
            if m:
                self._screen_width = int(m.group(1))
                self._screen_height = int(m.group(2))
                logger.info(f"[SCANNER] Screen size: {self._screen_width}x{self._screen_height}")
        except Exception:
            pass

    async def _scan_loop(self):
        """Periodic dump loop — ADB-based, no Maestro dependency."""
        logger.info(f"[SCANNER] Scan loop started (device={self._udid})")
        while self._running:
            try:
                elements = await self._adb_dump_elements()
                if elements:
                    await self._process_elements(elements)
                else:
                    hierarchy = await self._dump_via_studio_api()
                    if hierarchy:
                        elements = _parse_maestro_hierarchy(hierarchy)
                        if elements:
                            await self._process_elements(elements)

                self._dump_count += 1
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[SCANNER] Dump error: {e}", exc_info=True)
            await asyncio.sleep(4)

    async def _process_elements(self, elements: list[UIElement]):
        """Process a batch of elements into the screen map."""
        if not elements:
            return

        if not self._app_package:
            self._app_package = _detect_app_package(elements)
            if self._app_package:
                logger.info(f"[SCANNER] App package detected: {self._app_package}")

        if self._app_package and not _is_app_screen(elements, self._app_package):
            logger.debug(f"[SCANNER] Skipped non-app screen")
            return

        # Use ADB activity as primary screen identifier for precision
        activity = await _get_foreground_activity(self._udid) or ""
        heuristic_name = _detect_screen_name(elements)

        # Build a meaningful screen name combining activity + heuristic
        if activity and activity not in ("MainActivity", "Unknown"):
            screen_name = activity.replace("Activity", "").replace("Fragment", "")
        else:
            screen_name = heuristic_name

        is_new_screen = screen_name not in self._screens

        if is_new_screen:
            self._screens[screen_name] = {}
            logger.info(f"[SCANNER] New screen discovered: '{screen_name}' (activity={activity})")
            # Capture screenshot for the new screen
            screenshot_b64 = await self._capture_screenshot_b64()
            self._screen_meta[screen_name] = {
                "activity": activity,
                "heuristic_name": heuristic_name,
                "screenshot": screenshot_b64,
                "first_seen": time.strftime("%H:%M:%S"),
            }
        elif screen_name != self._last_screen_name:
            # Screen changed back to an existing screen — update screenshot
            screenshot_b64 = await self._capture_screenshot_b64()
            if screenshot_b64:
                self._screen_meta.setdefault(screen_name, {})["screenshot"] = screenshot_b64

        self._last_screen_name = screen_name

        added = 0
        for el in elements:
            rid = el.resource_id
            if self._app_package and rid:
                if ':' in rid and not rid.startswith(self._app_package + ":") and not rid.startswith("android:id/content"):
                    continue
            key = el.unique_key
            if key not in self._screens[screen_name]:
                self._screens[screen_name][key] = el.to_dict()
                self._element_count += 1
                added += 1

        logger.info(f"[SCANNER] Dump #{self._dump_count + 1}: {len(elements)} elements on '{screen_name}' (+{added} new)")

    async def _capture_screenshot_b64(self) -> str:
        """Capture a screenshot via ADB and return as base64 JPEG."""
        import base64
        try:
            proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', self._udid, 'exec-out', 'screencap', '-p',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=_SUBPROCESS_ENV,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            if proc.returncode == 0 and stdout and len(stdout) > 100:
                return base64.b64encode(stdout).decode('ascii')
        except Exception as e:
            logger.debug(f"[SCANNER] Screenshot failed: {e}")
        return ""

    async def _adb_dump_elements(self) -> list[UIElement]:
        """Dump UI hierarchy via ADB uiautomator — no external tools needed."""
        # Strategy: dump to file on device, then cat it back
        # /dev/stdout fails on many devices (Xiaomi, Samsung, etc.)
        try:
            dump_proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', self._udid, 'shell', 'uiautomator', 'dump', '/sdcard/ui_dump.xml',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_SUBPROCESS_ENV,
            )
            await asyncio.wait_for(dump_proc.communicate(), timeout=15)

            cat_proc = await asyncio.create_subprocess_exec(
                ADB_PATH, '-s', self._udid, 'shell', 'cat', '/sdcard/ui_dump.xml',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=_SUBPROCESS_ENV,
            )
            stdout, _ = await asyncio.wait_for(cat_proc.communicate(), timeout=10)
            xml = stdout.decode('utf-8', errors='replace').strip()
            if xml and '<hierarchy' in xml:
                return _parse_uiautomator_xml(xml)
            else:
                logger.warning(f"[SCANNER] ADB dump returned no XML (len={len(xml)})")
        except Exception as e:
            logger.warning(f"[SCANNER] ADB dump failed: {e}")

        return []

    async def _dump_via_studio_api(self) -> Optional[dict]:
        """Query Maestro Studio HTTP API (fallback if running)."""
        import urllib.request
        try:
            loop = asyncio.get_event_loop()
            def _fetch():
                req = urllib.request.Request(
                    "http://localhost:9999/api/v2/tree",
                    headers={"Accept": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    return resp.read().decode("utf-8", errors="replace")
            raw = await loop.run_in_executor(None, _fetch)
            data = json.loads(raw)
            if "hierarchy" in data:
                return data["hierarchy"]
            if "tree" in data:
                return data["tree"]
            if "attributes" in data or "children" in data:
                return data
        except Exception:
            pass
        return None

    def _build_element_map(self) -> dict:
        """Build the final element map with ALL selector types."""
        result = {
            "project_id": self._project_id,
            "project_name": self._project_name or self._project_id,
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "device": self._udid,
            "app_package": self._app_package or "",
            "screen_size": f"{self._screen_width}x{self._screen_height}",
            "stats": self.stats,
            "screens": {},
        }

        for screen_name, elements in self._screens.items():
            meta = self._screen_meta.get(screen_name, {})
            screen_data = {
                "elements": [],
                "maestro_selectors": [],
                "screenshot": meta.get("screenshot", ""),
                "activity": meta.get("activity", ""),
                "first_seen": meta.get("first_seen", ""),
            }

            # Count duplicate IDs for index tracking
            el_list = list(elements.values())
            id_counts: dict[str, int] = Counter(
                d.get("id", "") for d in el_list if d.get("id")
            )
            id_current_idx: dict[str, int] = defaultdict(int)

            for el_dict in el_list:
                el_id = el_dict.get("id", "")
                el_text = el_dict.get("text", "")
                el_hint = el_dict.get("hint", "")
                el_desc = el_dict.get("content_desc", "")
                el_bounds = el_dict.get("bounds", "")
                is_dup = el_id and id_counts.get(el_id, 0) > 1

                # Track index for duplicates
                idx = None
                if is_dup:
                    idx = id_current_idx[el_id]
                    id_current_idx[el_id] += 1
                    el_dict["index"] = idx

                screen_data["elements"].append(el_dict)

                # Generate ALL selector commands for this element
                commands = []

                # tapOn by ID (with index if duplicate)
                if el_id:
                    if idx is not None:
                        commands.append({
                            "type": "tapOn",
                            "strategy": "id",
                            "command": f'- tapOn:\n    id: "{el_id}"\n    index: {idx}',
                        })
                    else:
                        commands.append({
                            "type": "tapOn",
                            "strategy": "id",
                            "command": f'- tapOn:\n    id: "{el_id}"',
                        })

                # tapOn by text
                if el_text:
                    commands.append({
                        "type": "tapOn",
                        "strategy": "text",
                        "command": f'- tapOn: "{el_text}"',
                    })

                # tapOn by hint (if different from text)
                if el_hint and el_hint != el_text:
                    commands.append({
                        "type": "tapOn",
                        "strategy": "hint",
                        "command": f'- tapOn: "{el_hint}"',
                    })

                # tapOn by content_desc (if different from text)
                if el_desc and el_desc != el_text:
                    commands.append({
                        "type": "tapOn",
                        "strategy": "content_desc",
                        "command": f'- tapOn: "{el_desc}"',
                    })

                # tapOn by coordinates
                if el_bounds and self._screen_width > 0:
                    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', el_bounds)
                    if m:
                        cx = (int(m.group(1)) + int(m.group(3))) // 2
                        cy = (int(m.group(2)) + int(m.group(4))) // 2
                        px = round(cx / self._screen_width * 100)
                        py = round(cy / self._screen_height * 100)
                        commands.append({
                            "type": "tapOn",
                            "strategy": "point",
                            "command": f'- tapOn:\n    point: "{px}%,{py}%"',
                        })

                # assertVisible by ID
                if el_id:
                    if idx is not None:
                        commands.append({
                            "type": "assertVisible",
                            "strategy": "id",
                            "command": f'- assertVisible:\n    id: "{el_id}"\n    index: {idx}',
                        })
                    else:
                        commands.append({
                            "type": "assertVisible",
                            "strategy": "id",
                            "command": f'- assertVisible:\n    id: "{el_id}"',
                        })

                # assertVisible by text
                if el_text:
                    commands.append({
                        "type": "assertVisible",
                        "strategy": "text",
                        "command": f'- assertVisible: "{el_text}"',
                    })

                if commands:
                    screen_data["maestro_selectors"].append({
                        "element": {k: v for k, v in el_dict.items() if k in ("id", "text", "hint", "content_desc", "class", "index")},
                        "commands": commands,
                    })

            result["screens"][screen_name] = screen_data

        return result

    def _save_element_map(self, element_map: dict):
        # Build human-readable filename: scaneamento_projeto_NOME_DATA.json
        project_name = self._project_name or self._project_id
        safe_name = re.sub(r'[^\w\s-]', '', project_name).strip().replace(' ', '_')
        date_str = time.strftime("%Y%m%d_%H%M%S")
        filename = f"scaneamento_projeto_{safe_name}_{date_str}.json"

        # Delete previous scan file(s) for this project_id (keep only latest)
        for old_file in ELEMENT_MAPS_DIR.glob("scaneamento_projeto_*.json"):
            try:
                old_data = json.loads(old_file.read_text(encoding="utf-8"))
                if old_data.get("project_id") == self._project_id:
                    old_file.unlink()
                    logger.info(f"[SCANNER] Removed old scan: {old_file.name}")
            except Exception:
                continue
        # Also remove legacy UUID-named file if it exists
        legacy = ELEMENT_MAPS_DIR / f"{self._project_id}.json"
        if legacy.exists():
            legacy.unlink()

        file_path = ELEMENT_MAPS_DIR / filename
        file_path.write_text(
            json.dumps(element_map, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info(f"[SCANNER] Element map saved: {file_path}")


def load_element_map(project_id: str) -> Optional[dict]:
    """Load element map for a project. Supports both new naming format
    (scaneamento_projeto_NAME_DATE.json) and legacy UUID format."""
    # 1. Search new naming format — find by project_id field in JSON
    for fpath in sorted(ELEMENT_MAPS_DIR.glob("scaneamento_projeto_*.json"), reverse=True):
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            if data.get("project_id") == project_id:
                return data
        except Exception:
            continue
    # 2. Legacy: UUID-named file
    legacy = ELEMENT_MAPS_DIR / f"{project_id}.json"
    if legacy.exists():
        try:
            return json.loads(legacy.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def element_map_to_prompt_context(element_map: dict) -> str:
    """Convert element map to text context for AI prompt injection."""
    if not element_map or not element_map.get("screens"):
        return ""

    lines = [
        "══ MAPA DE ELEMENTOS DO APP (coletado via scanner) ══",
        "Use ESTES resource-ids e textos REAIS para montar os seletores Maestro.",
        f"Escaneado em: {element_map.get('scanned_at', 'N/A')}",
        "",
    ]

    for screen_name, screen_data in element_map["screens"].items():
        lines.append(f"--- TELA: {screen_name} ---")
        for sel_group in screen_data.get("maestro_selectors", []):
            el = sel_group.get("element", {})
            parts = []
            if el.get("id"):
                idx_str = f" [index:{el['index']}]" if "index" in el else ""
                parts.append(f'id="{el["id"]}"{idx_str}')
            if el.get("text"):
                parts.append(f'text="{el["text"]}"')
            if el.get("hint"):
                parts.append(f'hint="{el["hint"]}"')
            if el.get("content_desc"):
                parts.append(f'desc="{el["content_desc"]}"')
            parts.append(f'class={el.get("class", "?")}')

            lines.append(f"  {' | '.join(parts)}")
            for cmd in sel_group.get("commands", []):
                lines.append(f"    {cmd['command']}")
        lines.append("")

    return "\n".join(lines)


# Singleton scanner instance
scanner_instance = ElementScanner()
