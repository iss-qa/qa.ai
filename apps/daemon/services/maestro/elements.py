import asyncio
import logging
import re as _re
import uuid as _uuid_lib
import xml.etree.ElementTree as _ET
from typing import Optional

import state
from android.device_manager import device_manager_instance
from android.screenshot import capture_screenshot_with_native_size

logger = logging.getLogger("maestro.elements")


def _mss_get_udid() -> Optional[str]:
    devs = device_manager_instance.list_online_devices()
    return devs[0].udid if devs else None


def _parse_bounds(s: str) -> Optional[dict]:
    m = _re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', s or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _xml_to_mss_elements(xml_str: str) -> list:
    """Parse ADB uiautomator XML into precise Maestro UIElement list.

    Rules for precision:
    1. Only include interactive (clickable/focusable) elements or real leaf nodes.
    2. Post-process: remove any element whose bounds COMPLETELY CONTAIN another
       element's bounds — this eliminates container blobs (RecyclerView sections)
       that cover multiple children, so each list item is highlighted individually.
    """
    raw: list = []
    rid_cnt: dict = {}
    txt_cnt: dict = {}

    def walk(node):
        rid        = node.get("resource-id") or None
        text       = node.get("text") or None
        hint       = node.get("hint") or None
        acc        = node.get("content-desc") or None
        clickable  = node.get("clickable") == "true"
        focusable  = node.get("focusable") == "true"
        enabled    = node.get("enabled", "true") == "true"
        bnds       = _parse_bounds(node.get("bounds", ""))
        has_children = len(list(node)) > 0

        is_interactive = (clickable or focusable) and enabled
        is_leaf        = not has_children
        should_include = (rid or text or acc) and (is_interactive or is_leaf)

        if should_include and bnds and bnds["width"] > 0 and bnds["height"] > 0:
            rid_idx = None
            if rid:
                c = rid_cnt.get(rid, 0)
                if c:
                    rid_idx = c
                rid_cnt[rid] = c + 1

            txt_idx = None
            if text:
                c = txt_cnt.get(text, 0)
                if c:
                    txt_idx = c
                txt_cnt[text] = c + 1

            el: dict = {"id": str(_uuid_lib.uuid4())}
            el["bounds"]                  = bnds
            if rid:                       el["resourceId"]         = rid
            if rid_idx is not None:       el["resourceIdIndex"]    = rid_idx
            if text:                      el["text"]               = text
            if hint:                      el["hintText"]           = hint
            if acc and acc != text:       el["accessibilityText"]  = acc
            if txt_idx is not None:       el["textIndex"]          = txt_idx
            raw.append(el)

        for child in node:
            walk(child)

    try:
        walk(_ET.fromstring(xml_str))
    except Exception as e:
        logger.warning(f"MSS element parse error: {e}")
        return []

    # ── Post-process: remove containers that fully enclose other elements ──────
    # If element A's bounds contain element B's bounds entirely, A is a container
    # and should be excluded so the user can select B individually.
    def contains(outer: dict, inner: dict) -> bool:
        o, i = outer["bounds"], inner["bounds"]
        return (o["x"] <= i["x"] and o["y"] <= i["y"]
                and o["x"] + o["width"]  >= i["x"] + i["width"]
                and o["y"] + o["height"] >= i["y"] + i["height"])

    # Mark elements that contain at least one other element → skip them
    is_container = [False] * len(raw)
    for ai, a in enumerate(raw):
        for bi, b in enumerate(raw):
            if ai != bi and contains(a, b):
                is_container[ai] = True
                break

    return [el for el, skip in zip(raw, is_container) if not skip]


async def _adb_shell(udid: str, *args: str, timeout: float = 3.0) -> int:
    """Run `adb -s UDID shell ARGS...` and return the exit code (or -1 on error)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", *args,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout)
        return proc.returncode or 0
    except Exception:
        return -1


async def _u2_dump(udid: str) -> str:
    """Capture UI hierarchy via uiautomator2 (accessibility service).

    Unlike raw `adb shell uiautomator dump` — which only captures the topmost
    Activity window — u2's ATX service uses the AccessibilityNodeInfo API and
    merges all visible windows. This is required for screens where the focused
    input lives in a BottomSheet / DialogFragment / popup overlay while the
    previous Activity remains in the window stack underneath.
    """
    try:
        dev = device_manager_instance.get_device(udid)
        if not dev:
            return ""
        # Run in a thread — dump_hierarchy is blocking I/O over ADB.
        xml = await asyncio.to_thread(dev.dump_hierarchy)
        if isinstance(xml, str) and xml.lstrip().startswith("<"):
            return xml
        return ""
    except Exception as e:
        logger.debug(f"MSS u2 dump: {e}")
        return ""


async def _adb_dump(udid: str) -> str:
    """Capture UI hierarchy. Primary path: uiautomator2 accessibility service
    (handles multi-window correctly). Fallback: raw `adb shell uiautomator dump`
    if u2 is unavailable or fails."""
    xml = await _u2_dump(udid)
    if xml:
        return xml

    try:
        p1 = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "uiautomator", "dump", "/sdcard/mss.xml",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(p1.wait(), timeout=10)

        p2 = await asyncio.create_subprocess_exec(
            "adb", "-s", udid, "shell", "cat", "/sdcard/mss.xml",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(p2.communicate(), timeout=8)
        xml = out.decode("utf-8", errors="replace").strip()
        return xml if xml.startswith("<") else ""
    except Exception as e:
        logger.debug(f"MSS adb dump: {e}")
        return ""


def _find_element_bounds_by_id(xml_str: str, resource_id: str) -> Optional[dict]:
    try:
        root = _ET.fromstring(xml_str)
    except Exception:
        return None

    def walk(node):
        rid = node.get("resource-id") or ""
        # Match exact or suffix ("bt_welcome_login" should match "pkg:id/bt_welcome_login")
        if rid == resource_id or rid.endswith("/" + resource_id) or rid.endswith(":" + resource_id):
            b = _parse_bounds(node.get("bounds", ""))
            if b and b["width"] > 0 and b["height"] > 0:
                return b
        for child in node:
            r = walk(child)
            if r:
                return r
        return None
    return walk(root)


def _find_element_bounds_by_text(xml_str: str, text: str) -> Optional[dict]:
    try:
        root = _ET.fromstring(xml_str)
    except Exception:
        return None

    def walk(node):
        t = node.get("text") or ""
        cd = node.get("content-desc") or ""
        if t == text or cd == text:
            b = _parse_bounds(node.get("bounds", ""))
            if b and b["width"] > 0 and b["height"] > 0:
                return b
        for child in node:
            r = walk(child)
            if r:
                return r
        return None
    return walk(root)


async def _get_fresh_xml(udid: str, max_age_ok: bool = True) -> str:
    """Return cached XML (updated every ~1.5s by the SSE dump task) or do a fresh dump."""
    if max_age_ok and state.mss_last_xml:
        return state.mss_last_xml
    xml = await _adb_dump(udid)
    if xml:
        state.mss_last_xml = xml
    return xml or ""


async def _fast_run_maestro_command(udid: str, yaml_content: str) -> Optional[dict]:
    """Fast path: parse common Maestro commands and execute directly via ADB.

    Returns {"success": bool, "error"?: str} if the command matched a fast path,
    or None if the caller should fall back to the maestro CLI.
    """
    body = yaml_content.strip()
    # Drop appId header (first line or appId: ... block separated by ---)
    if "---" in body:
        parts = body.split("---", 1)
        body = parts[1].strip()

    # tapOn with resource id:   - tapOn:\n    id: "xxx"
    m = _re.match(r'-\s*tapOn:\s*\n\s+id:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        rid = m.group(1)
        xml = await _get_fresh_xml(udid)
        bounds = _find_element_bounds_by_id(xml, rid) if xml else None
        if not bounds:
            # Retry once with a forced fresh dump — UI may have changed since last cache
            xml = await _get_fresh_xml(udid, max_age_ok=False)
            bounds = _find_element_bounds_by_id(xml, rid) if xml else None
        if bounds:
            cx = bounds["x"] + bounds["width"] // 2
            cy = bounds["y"] + bounds["height"] // 2
            rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
            return {"success": rc == 0} if rc == 0 else {"success": False, "error": "tap failed"}
        return {"success": False, "error": f"Element id '{rid}' not found"}

    # tapOn with text or content-desc
    m = _re.match(r'-\s*tapOn:\s*\n\s+text:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        txt = m.group(1)
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_text(xml, txt) if xml else None
        if bounds:
            cx = bounds["x"] + bounds["width"] // 2
            cy = bounds["y"] + bounds["height"] // 2
            rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
            return {"success": rc == 0} if rc == 0 else {"success": False, "error": "tap failed"}
        return {"success": False, "error": f"Element text '{txt}' not found"}

    # tapOn with point percentages:  point: "50%, 50%"
    m = _re.match(r'-\s*tapOn:\s*\n\s+point:\s*["\'](\d+)%\s*,\s*(\d+)%["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        px, py = int(m.group(1)), int(m.group(2))
        try:
            proc = await asyncio.create_subprocess_exec(
                "adb", "-s", udid, "shell", "wm", "size",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
            wm = _re.search(r'(\d+)x(\d+)', out.decode(errors="ignore"))
            if wm:
                w, h = int(wm.group(1)), int(wm.group(2))
                cx, cy = w * px // 100, h * py // 100
                rc = await _adb_shell(udid, "input", "tap", str(cx), str(cy))
                return {"success": rc == 0}
        except Exception:
            pass
        return None

    # assertVisible with id / text — just check XML, no side effect
    m = _re.match(r'-\s*assertVisible:\s*\n\s+id:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_id(xml, m.group(1)) if xml else None
        return {"success": bool(bounds), "error": None if bounds else f"Element id '{m.group(1)}' not visible"}

    m = _re.match(r'-\s*assertVisible:\s*\n\s+text:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        xml = await _get_fresh_xml(udid, max_age_ok=False)
        bounds = _find_element_bounds_by_text(xml, m.group(1)) if xml else None
        return {"success": bool(bounds), "error": None if bounds else f"Element text '{m.group(1)}' not visible"}

    # back / pressKey back
    if _re.match(r'-\s*(back|pressKey:\s*back)\s*$', body, _re.MULTILINE):
        rc = await _adb_shell(udid, "input", "keyevent", "KEYCODE_BACK")
        return {"success": rc == 0}

    # inputText: "..."  — types into currently focused field
    m = _re.match(r'-\s*inputText:\s*["\']([^"\']+)["\']\s*$', body, _re.MULTILINE | _re.DOTALL)
    if m:
        text = m.group(1).replace(" ", "%s").replace("'", r"\'")
        rc = await _adb_shell(udid, "input", "text", text, timeout=5)
        return {"success": rc == 0}

    return None  # fall back to maestro CLI
