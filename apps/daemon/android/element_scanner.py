"""
Element Scanner — Automated UI element discovery via ADB hierarchy dumps.

While the user navigates through the app (via Maestro Studio or manually),
this scanner periodically dumps the Android UI hierarchy and collects all
visible elements: resource-ids, text, hints, content-descriptions, classes.

The result is a structured element map that the AI uses to generate
accurate test steps with REAL selectors.
"""

import asyncio
import json
import logging
import os
import re
import subprocess
import time
from collections import defaultdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger("element_scanner")

# Where element maps are saved
ELEMENT_MAPS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "element_maps"
ELEMENT_MAPS_DIR.mkdir(parents=True, exist_ok=True)


class UIElement:
    """A single UI element extracted from the Android hierarchy."""

    def __init__(self, resource_id: str = "", text: str = "", hint: str = "",
                 content_desc: str = "", class_name: str = "", bounds: str = "",
                 clickable: bool = False, focusable: bool = False,
                 password: bool = False, enabled: bool = True):
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

    @property
    def short_id(self) -> str:
        """Resource ID without package prefix: 'com.app:id/btn_login' -> 'btn_login'"""
        if '/' in self.resource_id:
            return self.resource_id.split('/')[-1]
        return self.resource_id

    @property
    def unique_key(self) -> str:
        """Unique identifier for deduplication."""
        return f"{self.short_id}|{self.text}|{self.hint}|{self.content_desc}|{self.class_name}"

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
        return d

    def maestro_selector(self) -> str:
        """Generate the best Maestro selector for this element."""
        if self.short_id:
            return f'{{ id: "{self.short_id}" }}'
        if self.text:
            return f'"{self.text}"'
        if self.hint:
            return f'"{self.hint}"'
        if self.content_desc:
            return f'"{self.content_desc}"'
        return ""


def _parse_maestro_hierarchy(json_node: dict) -> list[UIElement]:
    """
    Parse Maestro hierarchy JSON (from `maestro hierarchy`) and extract elements.
    This is more reliable than uiautomator dump because it works alongside Maestro Studio.
    """
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

        # Skip empty elements
        if not any([resource_id, text, hint, content_desc]):
            pass
        # Skip system UI elements
        elif resource_id.startswith("com.android.systemui"):
            pass
        # Skip android:id/content (root container)
        elif resource_id == "android:id/content":
            pass
        else:
            elements.append(UIElement(
                resource_id=resource_id,
                text=text,
                hint=hint,
                content_desc=content_desc,
                class_name="",  # Maestro doesn't expose class in hierarchy
                bounds=bounds,
                clickable=clickable,
                focusable=focusable,
                password=password,
                enabled=enabled,
            ))

        for child in node.get("children", []):
            _walk(child)

    _walk(json_node)
    return elements


def _detect_screen_name(elements: list[UIElement]) -> str:
    """Try to detect the current screen name from element content."""
    # Strategy 1: Look for resource-ids with "title", "toolbar", "appbar"
    for el in elements:
        rid = el.short_id.lower()
        if rid and any(kw in rid for kw in ["title", "toolbar", "appbar", "header"]):
            if el.text and len(el.text) < 40:
                return el.text
            if el.content_desc and len(el.content_desc) < 40:
                return el.content_desc.split('\n')[0]

    # Strategy 2: Look for short non-clickable text near the top of the screen
    for el in elements:
        if el.text and not el.clickable and len(el.text) < 30:
            m = re.match(r'\[(\d+),(\d+)\]', el.bounds)
            if m and int(m.group(2)) < 250:
                return el.text

    # Strategy 3: Use first meaningful content_desc
    for el in elements:
        if el.content_desc and len(el.content_desc) < 40 and '\n' not in el.content_desc:
            return el.content_desc

    # Strategy 4: Fingerprint from element IDs
    app_ids = [el.short_id for el in elements if el.short_id and not el.short_id.startswith("com.android")]
    if app_ids:
        # Use common prefix of IDs to guess screen
        prefixes = set()
        for rid in app_ids[:5]:
            parts = rid.split('_')
            if len(parts) >= 2:
                prefixes.add(f"{parts[0]}_{parts[1]}")
        if prefixes:
            return f"tela_{'_'.join(sorted(prefixes)[:2])}"

    return f"tela_{int(time.time()) % 10000}"


def _detect_app_package(elements: list[UIElement]) -> Optional[str]:
    """
    Auto-detect the target app package from resource-ids.
    Returns the most frequent non-system package prefix found.
    e.g. 'com.foxbit.android' from 'com.foxbit.android:id/btn_login'
    """
    from collections import Counter
    # System/ignored packages
    IGNORE = {"com.android", "android", "com.google.android", "com.miui", "com.samsung",
               "com.sec", "com.huawei", "com.xiaomi", "com.oneplus", "com.oppo", "com.vivo"}
    packages = []
    for el in elements:
        rid = el.resource_id
        if rid and ':' in rid:
            pkg = rid.split(':')[0]
            # Skip known system packages
            if not any(pkg == s or pkg.startswith(s + '.') for s in IGNORE):
                packages.append(pkg)
    if not packages:
        return None
    most_common = Counter(packages).most_common(1)[0][0]
    return most_common


def _is_app_screen(elements: list[UIElement], app_package: str) -> bool:
    """
    Returns True if the current screen belongs to the target app.
    A screen belongs to the app if at least 1 element has a resource-id
    from the target package.
    """
    for el in elements:
        if el.resource_id.startswith(app_package + ":"):
            return True
    return False


class ElementScanner:
    """
    Accumulates UI elements across multiple hierarchy dumps.
    Each dump captures what's on screen at that moment.
    Over 2-3 minutes of user navigation, we build a complete element map.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._udid: str = ""
        self._project_id: str = ""
        self._screens: dict[str, dict[str, dict]] = {}  # screen_name -> {unique_key -> element_dict}
        self._dump_count = 0
        self._element_count = 0
        self._start_time: float = 0
        self._app_package: Optional[str] = None  # auto-detected on first dump

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

    async def start(self, udid: str, project_id: str):
        """Start scanning. Launches background task that dumps hierarchy every 4s."""
        if self._running:
            return
        self._running = True
        self._udid = udid
        self._project_id = project_id
        self._screens = {}
        self._dump_count = 0
        self._element_count = 0
        self._start_time = time.time()
        self._app_package = None
        self._task = asyncio.create_task(self._scan_loop())
        logger.info(f"[SCANNER] Started scanning on device {udid} for project {project_id}")

    async def stop(self) -> dict:
        """Stop scanning and return the accumulated element map."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        element_map = self._build_element_map()
        # Save to disk
        self._save_element_map(element_map)
        logger.info(f"[SCANNER] Stopped. {self.stats}")
        return element_map

    async def _scan_loop(self):
        """Periodically dump the UI hierarchy via maestro and extract elements."""
        logger.info(f"[SCANNER] Scan loop started (device={self._udid})")
        while self._running:
            try:
                hierarchy_json = await self._dump_hierarchy()
                if hierarchy_json is None:
                    logger.warning(f"[SCANNER] Dump #{self._dump_count + 1} failed — no hierarchy returned")
                else:
                    elements = _parse_maestro_hierarchy(hierarchy_json)
                    screen_name = "?"
                    if elements:
                        # Auto-detect app package on first successful dump
                        if not self._app_package:
                            self._app_package = _detect_app_package(elements)
                            if self._app_package:
                                logger.info(f"[SCANNER] App package detected: {self._app_package}")

                        # Filter: only capture screens that belong to the target app
                        if self._app_package and not _is_app_screen(elements, self._app_package):
                            self._dump_count += 1
                            logger.info(f"[SCANNER] Dump #{self._dump_count}: skipped (not app screen — other app/system UI)")
                            await asyncio.sleep(4)
                            continue

                        screen_name = _detect_screen_name(elements)
                        if screen_name not in self._screens:
                            self._screens[screen_name] = {}
                            logger.info(f"[SCANNER] New screen discovered: '{screen_name}'")

                        for el in elements:
                            # Only store elements from the target app package or elements without package (text/hint only)
                            if self._app_package and el.resource_id and not el.resource_id.startswith(self._app_package + ":"):
                                continue
                            key = el.unique_key
                            if key not in self._screens[screen_name]:
                                self._screens[screen_name][key] = el.to_dict()
                                self._element_count += 1

                    self._dump_count += 1
                    logger.info(f"[SCANNER] Dump #{self._dump_count}: {len(elements)} elements on '{screen_name}'")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[SCANNER] Dump error: {e}", exc_info=True)

            await asyncio.sleep(4)  # 4s between dumps

    def _find_maestro(self) -> Optional[str]:
        """Find maestro binary, checking all common locations."""
        import shutil
        found = shutil.which("maestro")
        if found:
            return found
        for p in [
            Path.home() / ".maestro" / "bin" / "maestro",
            Path("/opt/homebrew/bin/maestro"),
            Path("/usr/local/bin/maestro"),
        ]:
            if p.exists() and os.access(p, os.X_OK):
                return str(p)
        return None

    async def _dump_hierarchy(self) -> Optional[dict]:
        """
        Dump the UI hierarchy.
        Strategy 1: Query Maestro Studio HTTP API (port 9999) — works when Studio is running.
        Strategy 2: Run `maestro hierarchy` CLI as fallback.
        """
        # Strategy 1: Maestro Studio HTTP API
        result = await self._dump_via_studio_api()
        if result is not None:
            return result

        # Strategy 2: maestro hierarchy CLI
        return await self._dump_via_cli()

    async def _dump_via_studio_api(self) -> Optional[dict]:
        """Query Maestro Studio's built-in API to get the element hierarchy."""
        import urllib.request
        import urllib.error
        try:
            loop = asyncio.get_event_loop()
            def _fetch():
                req = urllib.request.Request(
                    "http://localhost:9999/api/v2/tree",
                    headers={"Accept": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    return resp.read().decode("utf-8", errors="replace")
            raw = await loop.run_in_executor(None, _fetch)
            data = json.loads(raw)
            # Maestro Studio returns {"hierarchy": {...}} or the tree directly
            if "hierarchy" in data:
                return data["hierarchy"]
            if "tree" in data:
                return data["tree"]
            # If it's already the tree node
            if "attributes" in data or "children" in data:
                return data
            logger.debug(f"[SCANNER] Studio API returned unexpected shape: {list(data.keys())[:5]}")
            return None
        except Exception as e:
            logger.debug(f"[SCANNER] Studio API not available: {e}")
            return None

    async def _dump_via_cli(self) -> Optional[dict]:
        """Run `maestro hierarchy` CLI and parse its JSON output."""
        try:
            maestro_bin = self._find_maestro()
            if not maestro_bin:
                logger.error("[SCANNER] Maestro binary not found — checked PATH, ~/.maestro/bin, /opt/homebrew/bin, /usr/local/bin")
                return None

            logger.debug(f"[SCANNER] Running: {maestro_bin} hierarchy (device={self._udid})")
            env = {**os.environ, 'ANDROID_SERIAL': self._udid}
            proc = await asyncio.create_subprocess_exec(
                maestro_bin, 'hierarchy',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
            output = stdout.decode('utf-8', errors='replace')
            err_output = stderr.decode('utf-8', errors='replace')

            if proc.returncode != 0:
                logger.warning(f"[SCANNER] maestro hierarchy failed (exit {proc.returncode}): {err_output[:300]}")
                return None

            if err_output.strip():
                logger.debug(f"[SCANNER] maestro hierarchy stderr: {err_output[:200]}")

            # Output starts with "Running on <udid>\n" then JSON
            json_start = output.find('{')
            if json_start >= 0:
                try:
                    return json.loads(output[json_start:])
                except json.JSONDecodeError as je:
                    logger.warning(f"[SCANNER] JSON parse error: {je} — output snippet: {output[json_start:json_start+100]}")
                    return None

            logger.warning(f"[SCANNER] No JSON in maestro hierarchy output. Full output: {output[:300]}")
            return None
        except asyncio.TimeoutError:
            logger.warning("[SCANNER] maestro hierarchy timed out (20s)")
            return None
        except Exception as e:
            logger.warning(f"[SCANNER] maestro hierarchy error: {e}")
            return None

    def _build_element_map(self) -> dict:
        """Build the final element map structure."""
        result = {
            "project_id": self._project_id,
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "device": self._udid,
            "app_package": self._app_package or "",
            "stats": self.stats,
            "screens": {},
        }

        for screen_name, elements in self._screens.items():
            screen_data = {
                "elements": [],
                "maestro_selectors": [],
            }
            for el_dict in elements.values():
                screen_data["elements"].append(el_dict)
                # Build maestro selector suggestion
                sel = {}
                if el_dict.get("id"):
                    sel["id"] = el_dict["id"]
                    sel["maestro"] = f'- tapOn:\n    id: "{el_dict["id"]}"'
                elif el_dict.get("text"):
                    sel["text"] = el_dict["text"]
                    sel["maestro"] = f'- tapOn: "{el_dict["text"]}"'
                elif el_dict.get("hint"):
                    sel["hint"] = el_dict["hint"]
                    sel["maestro"] = f'- tapOn: "{el_dict["hint"]}"'
                elif el_dict.get("content_desc"):
                    sel["content_desc"] = el_dict["content_desc"]
                    sel["maestro"] = f'- tapOn: "{el_dict["content_desc"]}"'

                if sel:
                    sel["class"] = el_dict.get("class", "")
                    if el_dict.get("password"):
                        sel["is_password"] = True
                    screen_data["maestro_selectors"].append(sel)

            result["screens"][screen_name] = screen_data

        return result

    def _save_element_map(self, element_map: dict):
        """Save element map to disk."""
        file_path = ELEMENT_MAPS_DIR / f"{self._project_id}.json"
        file_path.write_text(
            json.dumps(element_map, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info(f"[SCANNER] Element map saved: {file_path}")


def load_element_map(project_id: str) -> Optional[dict]:
    """Load a previously saved element map for a project."""
    file_path = ELEMENT_MAPS_DIR / f"{project_id}.json"
    if file_path.exists():
        try:
            return json.loads(file_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def element_map_to_prompt_context(element_map: dict) -> str:
    """
    Convert an element map into a text context string that can be
    injected into the AI prompt for test generation.
    """
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
        selectors = screen_data.get("maestro_selectors", [])
        for sel in selectors:
            parts = []
            if sel.get("id"):
                parts.append(f'id="{sel["id"]}"')
            if sel.get("text"):
                parts.append(f'text="{sel["text"]}"')
            if sel.get("hint"):
                parts.append(f'hint="{sel["hint"]}"')
            if sel.get("content_desc"):
                parts.append(f'desc="{sel["content_desc"]}"')
            parts.append(f'class={sel.get("class", "?")}')
            if sel.get("is_password"):
                parts.append("(senha)")

            maestro = sel.get("maestro", "")
            lines.append(f"  {' | '.join(parts)}")
            if maestro:
                lines.append(f"    Maestro: {maestro}")
        lines.append("")

    return "\n".join(lines)


# Singleton scanner instance
scanner_instance = ElementScanner()
