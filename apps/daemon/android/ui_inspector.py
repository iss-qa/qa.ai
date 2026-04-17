"""
UIInspector — Identifies UI elements at screen coordinates.

Uses uiautomator2 dump_hierarchy() with:
- App-package validation (reject MIUI system UI dumps)
- Smart walk-up to find nearest interactive parent with resource-id
- Retry with increasing delay for transient failures
- Physical resolution detection via ADB
"""

import logging
import os
import re
import shutil
import subprocess
from xml.etree import ElementTree
from typing import Optional, Tuple

import uiautomator2 as u2

logger = logging.getLogger("ui_inspector")

ADB_PATH = shutil.which("adb") or "/opt/homebrew/bin/adb"
_SUBPROCESS_ENV = {**os.environ, "PATH": os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin"}

# System package prefixes to ignore in resource-ids
_SYSTEM_PREFIXES = ("android:id", "com.android", "com.miui", "com.xiaomi")

# Interactive widget classes where walk-up should accept the parent
_INTERACTIVE_CLASSES = {
    "Button", "EditText", "ImageButton", "CheckBox", "RadioButton",
    "Switch", "ToggleButton", "ImageView", "TextView", "AutoCompleteTextView",
    "ViewGroup", "FrameLayout", "LinearLayout", "RelativeLayout", "CardView",
}


def _parse_bounds(bounds_str: str) -> Optional[Tuple[int, int, int, int]]:
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str or '')
    if m:
        return tuple(map(int, m.groups()))
    return None


def _is_system_rid(rid: str) -> bool:
    return any(rid.startswith(p) for p in _SYSTEM_PREFIXES)


def _has_app_elements(xml: str) -> bool:
    """Check if XML contains at least one non-system resource-id."""
    for m in re.finditer(r'resource-id="([^"]+)"', xml):
        if m.group(1) and not _is_system_rid(m.group(1)):
            return True
    return False


def _find_element_in_xml(xml_content: str, x: int, y: int) -> dict:
    """
    Find the element at (x, y) in the XML hierarchy.

    1. Find the smallest (deepest) element containing (x, y)
    2. If it has a non-system resource-id → return it
    3. Otherwise → walk up max 4 levels, accept nearest parent that:
       - Has a non-system resource-id AND
       - Is clickable OR focusable OR has an interactive class
    4. Keep deepest element's text/desc for context
    """
    try:
        root = ElementTree.fromstring(xml_content)
    except Exception as e:
        logger.error(f"XML parse error: {e}")
        return {}

    # Build parent map
    parent_map = {}
    for parent in root.iter():
        for child in parent:
            parent_map[child] = parent

    # Find smallest element at (x, y)
    best_match = None
    best_area = float('inf')

    for node in root.iter('node'):
        bounds = _parse_bounds(node.get('bounds', ''))
        if not bounds:
            continue
        x1, y1, x2, y2 = bounds
        if x1 <= x <= x2 and y1 <= y <= y2:
            area = (x2 - x1) * (y2 - y1)
            # Use <= so that when a child has identical bounds to its parent,
            # the child (processed later in depth-first order) wins.
            # This correctly returns inp_login_email instead of its View wrapper.
            if area <= best_area:
                best_match = node
                best_area = area

    if best_match is None:
        return {}

    resource_id = best_match.get("resource-id", "")
    text = best_match.get("text", "")
    content_desc = best_match.get("content-desc", "")
    class_name = best_match.get("class", "")
    bounds_str = best_match.get("bounds", "")

    # If deepest element has good resource-id, return immediately
    if resource_id and not _is_system_rid(resource_id):
        return {
            "resource_id": resource_id,
            "text": text,
            "content_desc": content_desc,
            "class_name": class_name,
            "bounds": bounds_str,
        }

    # Walk up to find nearest CLICKABLE/FOCUSABLE parent with resource-id.
    # Only accept parents that are explicitly clickable or focusable —
    # layout containers (ViewGroup, FrameLayout…) are rejected even if they
    # have a resource-id, to avoid returning wrong parent IDs.
    node = best_match
    for _ in range(4):
        if node not in parent_map:
            break
        node = parent_map[node]
        p_rid = node.get("resource-id", "")
        if not p_rid or _is_system_rid(p_rid):
            continue

        p_click = node.get("clickable", "") == "true"
        p_focus = node.get("focusable", "") == "true"

        if p_click or p_focus:
            resource_id = p_rid
            class_name = node.get("class", "")
            bounds_str = node.get("bounds", "")
            # Keep deepest text/desc
            if not text:
                text = node.get("text", "")
            if not content_desc:
                content_desc = node.get("content-desc", "")
            break

    return {
        "resource_id": resource_id,
        "text": text,
        "content_desc": content_desc,
        "class_name": class_name,
        "bounds": bounds_str,
    }


class UIInspector:

    @staticmethod
    def dump_via_u2(device: u2.Device) -> Optional[str]:
        """Dump via uiautomator2. May conflict with scrcpy on MIUI."""
        try:
            xml = device.dump_hierarchy()
            if xml and '<hierarchy' in xml:
                return xml
        except Exception as e:
            logger.warning(f"u2 dump failed: {e}")
        return None

    @staticmethod
    def get_element_at_safe(device: u2.Device, x: int, y: int) -> dict:
        """Find element at (x,y) using u2 dump. Single attempt."""
        xml = UIInspector.dump_via_u2(device)
        if not xml:
            return {}
        return _find_element_in_xml(xml, x, y)

    @staticmethod
    def get_element_at_validated(device: u2.Device, x: int, y: int,
                                  expected_pkg: str = "", max_retries: int = 3) -> dict:
        """
        Find element at (x,y) with validation and retry.
        Rejects dumps that only contain system UI (MIUI AOD, systemui).
        """
        for attempt in range(max_retries):
            xml = UIInspector.dump_via_u2(device)
            if not xml:
                import time
                time.sleep(0.5 * (attempt + 1))
                continue

            # Validate the dump has real app elements
            if expected_pkg and f'{expected_pkg}:id/' in xml:
                return _find_element_in_xml(xml, x, y)

            if _has_app_elements(xml):
                return _find_element_in_xml(xml, x, y)

            # Got system UI only — wait and retry
            logger.warning(f"[DUMP] attempt {attempt+1}: system UI only, retrying...")
            import time
            time.sleep(0.8 * (attempt + 1))

        return {}

    @staticmethod
    def get_physical_resolution(udid: str) -> Optional[Tuple[int, int]]:
        """Get physical screen resolution via ADB wm size."""
        try:
            result = subprocess.run(
                [ADB_PATH, '-s', udid, 'shell', 'wm', 'size'],
                capture_output=True, text=True, timeout=5, env=_SUBPROCESS_ENV,
            )
            # Prefer "Physical size: WxH" over "Override size: WxH"
            m = re.search(r'Physical size:\s*(\d+)x(\d+)', result.stdout)
            if not m:
                m = re.search(r'(\d+)x(\d+)', result.stdout)
            if m:
                return (int(m.group(1)), int(m.group(2)))
        except Exception as e:
            logger.warning(f"Failed to get physical resolution: {e}")
        return None

    @staticmethod
    def get_current_activity(udid: str) -> str:
        """Get current foreground activity."""
        try:
            result = subprocess.run(
                [ADB_PATH, '-s', udid, 'shell', 'dumpsys', 'activity', 'activities'],
                capture_output=True, text=True, timeout=5, env=_SUBPROCESS_ENV,
            )
            for line in result.stdout.split('\n'):
                if 'mResumedActivity' in line or 'mFocusedActivity' in line:
                    m = re.search(r'(\w+/[\w.]+)', line)
                    if m:
                        return m.group(1)
        except Exception:
            pass
        return ""

    @staticmethod
    def get_foreground_package(udid: str) -> str:
        """Get the package name of the foreground app."""
        try:
            result = subprocess.run(
                [ADB_PATH, '-s', udid, 'shell', 'dumpsys', 'window', 'windows'],
                capture_output=True, text=True, timeout=5, env=_SUBPROCESS_ENV,
            )
            for line in result.stdout.split('\n'):
                if 'mCurrentFocus' in line:
                    m = re.search(r'(\w[\w.]+)/[\w.]+', line)
                    if m:
                        return m.group(1)
        except Exception:
            pass
        return ""
