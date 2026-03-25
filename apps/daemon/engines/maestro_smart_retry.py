"""
Maestro Smart Retry — AI-powered element resolution.

When a Maestro step fails with "element not found", this module:
1. Captures a screenshot of the current device screen
2. Dumps the UI hierarchy XML to extract all available selectors
3. Sends both to Claude Vision to identify the correct element
4. Generates alternative Maestro selectors in priority order:
   - semantics id (testTag / accessibility id)
   - resource-id
   - visible text (exact)
   - placeholder / hint text
   - content-description
   - text contains (partial match)
   - percentage coordinates (last resort)
5. Returns a corrected Maestro command

This is the core AI differentiator of QAMind.
"""

import asyncio
import base64
import json
import logging
import re
import subprocess
from typing import Optional
from xml.etree import ElementTree

logger = logging.getLogger("maestro_smart_retry")

# Selector priority order — semantics id first, coordinates last
SELECTOR_PRIORITY = [
    "semantics_id",      # testTag / accessibility id (Compose/Flutter)
    "resource_id",       # Android resource-id
    "text_exact",        # Exact visible text
    "placeholder",       # Hint text / placeholder
    "content_desc",      # content-description
    "text_contains",     # Partial text match
    "point_percent",     # Percentage coordinates (last resort)
]


def dump_ui_hierarchy(udid: str) -> str:
    """Dump the UI hierarchy XML from the device."""
    try:
        result = subprocess.run(
            ['adb', '-s', udid, 'shell', 'uiautomator', 'dump', '/dev/stdout'],
            capture_output=True, text=True, timeout=10,
        )
        xml = result.stdout.strip()
        if xml and '<hierarchy' in xml:
            return xml
    except Exception as e:
        logger.warning(f"uiautomator dump failed: {e}")

    # Fallback: dump to file and pull
    try:
        subprocess.run(
            ['adb', '-s', udid, 'shell', 'uiautomator', 'dump', '/sdcard/ui_dump.xml'],
            capture_output=True, timeout=10,
        )
        result = subprocess.run(
            ['adb', '-s', udid, 'shell', 'cat', '/sdcard/ui_dump.xml'],
            capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip()
    except Exception as e:
        logger.error(f"uiautomator dump fallback failed: {e}")
        return ""


def capture_screenshot_base64(udid: str) -> str:
    """Capture a screenshot and return as base64 PNG."""
    try:
        result = subprocess.run(
            ['adb', '-s', udid, 'exec-out', 'screencap', '-p'],
            capture_output=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout:
            return base64.b64encode(result.stdout).decode('utf-8')
    except Exception as e:
        logger.error(f"Screenshot capture failed: {e}")
    return ""


def extract_all_selectors_from_xml(xml_content: str) -> list[dict]:
    """Parse UI XML and extract all elements with their selectors."""
    elements = []
    if not xml_content:
        return elements

    try:
        root = ElementTree.fromstring(xml_content)
        for node in root.iter('node'):
            bounds = node.get('bounds', '')
            if not bounds:
                continue

            # Parse bounds [x1,y1][x2,y2]
            b = bounds.replace('][', ',').replace('[', '').replace(']', '')
            try:
                x1, y1, x2, y2 = map(int, b.split(','))
            except ValueError:
                continue

            element = {
                "resource_id": node.get("resource-id", ""),
                "text": node.get("text", ""),
                "content_desc": node.get("content-desc", ""),
                "class_name": node.get("class", ""),
                "clickable": node.get("clickable", "false") == "true",
                "bounds": bounds,
                "center_x": (x1 + x2) // 2,
                "center_y": (y1 + y2) // 2,
                "hint": node.get("hint", "") or node.get("hintText", ""),
            }

            # Only include elements with at least one useful selector
            if any([element["resource_id"], element["text"],
                    element["content_desc"], element["hint"]]):
                elements.append(element)

    except Exception as e:
        logger.warning(f"XML parse error: {e}")

    return elements


def find_alternative_selectors(
    failed_selector: str,
    elements: list[dict],
    screen_width: int = 1080,
    screen_height: int = 2400,
) -> list[dict]:
    """
    Given a failed selector, find the best alternative selectors
    from the UI hierarchy, ordered by priority.

    Returns list of {strategy, selector, maestro_command, confidence}
    """
    alternatives = []
    failed_lower = failed_selector.lower().strip('"').strip("'")

    for el in elements:
        score = 0
        matched_by = None

        # Check if this element is semantically related to the failed selector
        rid = el["resource_id"]
        text = el["text"]
        desc = el["content_desc"]
        hint = el["hint"]

        # Strip package prefix from resource-id
        rid_short = rid.split("/")[-1] if "/" in rid else rid

        # Semantic matching — check if the failed selector is related
        if failed_lower in text.lower() or failed_lower in desc.lower():
            score = 80
        elif failed_lower in hint.lower():
            score = 70
        elif failed_lower in rid_short.lower():
            score = 60
        elif any(word in text.lower() for word in failed_lower.split()):
            score = 40
        elif any(word in desc.lower() for word in failed_lower.split()):
            score = 35
        elif any(word in hint.lower() for word in failed_lower.split()):
            score = 30

        if score == 0:
            continue

        # Generate alternative commands in priority order
        # 1. Semantics ID (resource-id stripped)
        if rid_short:
            alternatives.append({
                "strategy": "semantics_id",
                "selector": rid_short,
                "maestro_command": f'- tapOn:\n    id: "{rid_short}"',
                "confidence": score + 20,
                "element": el,
            })

        # 2. Full resource-id
        if rid and rid != rid_short:
            alternatives.append({
                "strategy": "resource_id",
                "selector": rid,
                "maestro_command": f'- tapOn:\n    id: "{rid}"',
                "confidence": score + 15,
                "element": el,
            })

        # 3. Exact text
        if text:
            alternatives.append({
                "strategy": "text_exact",
                "selector": text,
                "maestro_command": f'- tapOn: "{text}"',
                "confidence": score + 10,
                "element": el,
            })

        # 4. Hint/placeholder
        if hint:
            alternatives.append({
                "strategy": "placeholder",
                "selector": hint,
                "maestro_command": f'- tapOn: "{hint}"',
                "confidence": score + 8,
                "element": el,
            })

        # 5. Content description
        if desc:
            alternatives.append({
                "strategy": "content_desc",
                "selector": desc,
                "maestro_command": f'- tapOn: "{desc}"',
                "confidence": score + 5,
                "element": el,
            })

        # 6. Percentage coordinates (last resort)
        cx_pct = round(el["center_x"] / screen_width * 100)
        cy_pct = round(el["center_y"] / screen_height * 100)
        alternatives.append({
            "strategy": "point_percent",
            "selector": f"{cx_pct}%,{cy_pct}%",
            "maestro_command": f'- tapOn:\n    point: "{cx_pct}%,{cy_pct}%"',
            "confidence": score,
            "element": el,
        })

    # Sort by confidence descending
    alternatives.sort(key=lambda x: x["confidence"], reverse=True)
    return alternatives


async def smart_retry_failed_step(
    failed_line: str,
    yaml_path: str,
    udid: str,
    run_id: str,
    anthropic_client=None,
) -> Optional[str]:
    """
    When a Maestro step fails, analyze the screen and generate a corrected YAML.

    Returns the path to the corrected YAML, or None if no fix found.
    """
    # Extract the failed command from the Maestro output
    # Pattern: 'Tap on "Something"... FAILED' or 'Assert that "X" is visible... FAILED'
    failed_selector = ""
    match = re.search(r'"([^"]+)"', failed_line)
    if match:
        failed_selector = match.group(1)

    if not failed_selector:
        logger.info(f"[SMART_RETRY] Could not extract selector from: {failed_line}")
        return None

    logger.info(f"[SMART_RETRY] Analyzing failed step for selector: '{failed_selector}'")

    # 1. Dump UI hierarchy
    xml_content = dump_ui_hierarchy(udid)
    elements = extract_all_selectors_from_xml(xml_content)
    logger.info(f"[SMART_RETRY] Found {len(elements)} UI elements")

    # 2. Get device screen size for coordinate calculation
    try:
        size_result = subprocess.run(
            ['adb', '-s', udid, 'shell', 'wm', 'size'],
            capture_output=True, text=True, timeout=5,
        )
        size_match = re.search(r'(\d+)x(\d+)', size_result.stdout)
        screen_w = int(size_match.group(1)) if size_match else 1080
        screen_h = int(size_match.group(2)) if size_match else 2400
    except Exception:
        screen_w, screen_h = 1080, 2400

    # 3. Find alternatives from XML
    alternatives = find_alternative_selectors(
        failed_selector, elements, screen_w, screen_h
    )

    if not alternatives:
        logger.info(f"[SMART_RETRY] No alternatives found in UI hierarchy for '{failed_selector}'")

        # 4. If no alternatives from XML, try Claude Vision as last resort
        if anthropic_client:
            screenshot_b64 = capture_screenshot_base64(udid)
            if screenshot_b64:
                vision_alt = await _ask_vision_for_selector(
                    anthropic_client, screenshot_b64, failed_selector, xml_content
                )
                if vision_alt:
                    alternatives = [vision_alt]

    if not alternatives:
        return None

    # 5. Try each alternative - generate corrected YAML and test
    for i, alt in enumerate(alternatives[:3]):  # Try top 3
        logger.info(
            f"[SMART_RETRY] Attempt {i+1}: strategy={alt['strategy']}, "
            f"selector='{alt['selector']}', confidence={alt['confidence']}"
        )

        # Read original YAML and replace the failed command
        corrected_yaml = _replace_failed_command_in_yaml(
            yaml_path, failed_selector, alt["maestro_command"], failed_line
        )

        if corrected_yaml:
            corrected_path = yaml_path.replace('.yaml', f'_retry{i+1}.yaml')
            from pathlib import Path as P
            P(corrected_path).write_text(corrected_yaml, encoding='utf-8')
            logger.info(f"[SMART_RETRY] Corrected YAML saved: {corrected_path}")
            return corrected_path

    return None


async def _ask_vision_for_selector(
    client, screenshot_b64: str, failed_selector: str, xml_snippet: str
) -> Optional[dict]:
    """Use Claude Vision to identify the correct element on screen."""
    try:
        prompt = f"""Analise esta tela de um app Android. O teste Maestro falhou ao tentar encontrar o elemento "{failed_selector}".

Olhe para a tela e me diga: qual seria o seletor correto para encontrar esse elemento?

Priorize nesta ordem:
1. testTag / semantics id (se React Native ou Compose)
2. resource-id do elemento
3. Texto exato visivel na tela
4. Placeholder / hint do campo
5. content-description
6. Coordenadas percentuais (X%, Y%) como ultimo recurso

XML parcial da hierarquia (pode estar incompleto):
{xml_snippet[:3000]}

Retorne APENAS um JSON:
{{"strategy": "text_exact|resource_id|placeholder|content_desc|point_percent", "selector": "valor", "maestro_command": "- tapOn: \\"valor\\""}}"""

        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": screenshot_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        content = message.content[0].text.strip()
        # Clean JSON from markdown
        if "```" in content:
            content = content.split("```")[1].split("```")[0]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content.strip())
        result["confidence"] = 50  # Vision-based has moderate confidence
        return result

    except Exception as e:
        logger.warning(f"[SMART_RETRY] Vision analysis failed: {e}")
        return None


def _replace_failed_command_in_yaml(
    yaml_path: str,
    failed_selector: str,
    new_selector: str,
    failed_line: str,
) -> Optional[str]:
    """
    Replace a failed selector in the YAML with a new one.
    Uses simple string replacement of the selector value — safe for both
    simple (- tapOn: "X") and multi-line (visible: "X") commands.
    """
    try:
        from pathlib import Path as P
        content = P(yaml_path).read_text(encoding='utf-8')

        # Simple approach: just replace the old selector string with the new one
        # This works for both:
        #   - tapOn: "old" -> - tapOn: "new"
        #   - visible: "old" -> visible: "new"
        #   - assertVisible: "old" -> assertVisible: "new"

        # Extract just the selector value from the new command
        # new_selector might be '- tapOn: "new value"' or just '"new value"'
        new_value = new_selector
        match = re.search(r'"([^"]+)"', new_selector)
        if match:
            new_value = match.group(1)

        # Replace all occurrences of the failed selector with the new value
        if f'"{failed_selector}"' in content:
            corrected = content.replace(f'"{failed_selector}"', f'"{new_value}"', 1)
            return corrected

        # Try without quotes
        if failed_selector in content:
            corrected = content.replace(failed_selector, new_value, 1)
            return corrected

    except Exception as e:
        logger.error(f"[SMART_RETRY] Failed to replace in YAML: {e}")

    return None
