import asyncio
import base64 as _base64
import io
import json
import logging
import uuid as _uuid_lib

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from PIL import Image

import state
from android.screenshot import capture_screenshot_fast, capture_screenshot_with_native_size
from services.maestro.elements import (
    _mss_get_udid,
    _xml_to_mss_elements,
    _adb_dump,
)

router = APIRouter()
logger = logging.getLogger("mss.device_screen")

# ── Shared background frame capturer ────────────────────────────────────────
#
# A single background task continuously captures screenshots for each device
# and stores the latest frame in _live_frames. SSE generators read from this
# cache instead of blocking inside the loop, decoupling capture latency from
# delivery latency.
#
# Without this, each SSE connection calls screencap serially — so multiple
# open connections (or a slow screencap) would pile up and increase delivery
# lag. With the capturer, every SSE client always gets the most recent frame
# within ~50ms of it being captured, regardless of how many clients are connected.

_live_frames: dict = {}       # udid → {"jpeg": bytes, "w": int, "h": int, "seq": int}
_capturer_tasks: dict = {}    # udid → asyncio.Task
_capturer_refs: dict = {}     # udid → int (count of active SSE consumers)


def _capturer_acquire(udid: str) -> None:
    """Increment consumer count and start the background capturer if needed."""
    _capturer_refs[udid] = _capturer_refs.get(udid, 0) + 1
    task = _capturer_tasks.get(udid)
    if not task or task.done():
        _capturer_tasks[udid] = asyncio.create_task(_frame_capturer(udid))


def _capturer_release(udid: str) -> None:
    """Decrement consumer count. Cancel capturer when no consumers remain."""
    count = _capturer_refs.get(udid, 1) - 1
    _capturer_refs[udid] = max(count, 0)
    if count <= 0:
        task = _capturer_tasks.pop(udid, None)
        if task and not task.done():
            task.cancel()
        _live_frames.pop(udid, None)


async def _frame_capturer(udid: str) -> None:
    """Background task: continuously capture screenshots into _live_frames.

    Screencap itself takes ~150-250ms on most devices, providing natural pacing.
    No additional sleep is added so frames arrive as fast as ADB allows.

    Captures are fully paused while the embedded Maestro Studio server is issuing
    commands (adb_command_active) to avoid ADB contention that causes both
    operations to time out. During a CLI `maestro test` run (maestro_test_active)
    the mirror KEEPS capturing — that path drives the device over Maestro's gRPC
    driver, not adb screencap — so the QA engineer sees the run in real time; we
    only throttle slightly to stay gentle on ADB while Maestro works.

    FRAME DEDUP (critical for low latency): the bundle frontend consumes the SSE
    stream with a raw EventSource, which has NO frame-dropping — it fires
    onmessage for every event in order and buffers the unprocessed ones in the
    browser without bound. If we bumped `seq` on every capture (~3-5 fps) even
    when the screen is unchanged, the browser would receive frames faster than it
    can decode+paint a base64 <img>, and the displayed frame would fall further
    and further behind real time (the 5-30s lag the QA engineer reported).

    So we only advance `seq` when the captured image actually CHANGED (hash
    compare). On a static screen the stream goes quiet, the browser's buffer
    drains to empty, and the next real change is delivered near-instantly. During
    a test this keeps latency bounded to ~one step (screens are static between
    steps) instead of accumulating across the whole run.
    """
    import hashlib

    seq = 0
    last_hash = None  # md5 digest of the last frame we stored (dedup)
    while True:
        # Yield fully to the embedded studio during its command bursts
        while state.adb_command_active.is_set():
            await asyncio.sleep(0.1)

        try:
            jpeg, native_w, native_h = await capture_screenshot_with_native_size(udid)
            if jpeg and native_w:
                # Skip unchanged frames so we never stream a static screen.
                # md5 of a ~100KB JPEG is ~0.1ms — negligible next to screencap.
                h = hashlib.md5(jpeg).digest()
                if h != last_hash:
                    last_hash = h
                    seq += 1
                    _live_frames[udid] = {
                        "jpeg": jpeg,
                        "w": native_w,
                        "h": native_h,
                        "seq": seq,
                    }
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.debug(f"frame_capturer {udid}: {e}")
            await asyncio.sleep(0.3)

        # Yield to the event loop between captures. The screencap itself already
        # takes 150-250ms, so this is a minimal no-op sleep that prevents the
        # coroutine from starving other tasks if screencap ever becomes instant.
        # During a CLI test, throttle to ~3 FPS so the live mirror stays smooth
        # without piling extra ADB pressure onto Maestro's running flow.
        await asyncio.sleep(0.15 if state.maestro_test_active.is_set() else 0)


# ── Old SSE endpoint (kept for compatibility) ──────────────────────────────

@router.get("/mss/api/device-screen/sse")
async def mss_device_screen_sse():
    """SSE stream: live device screenshot + UI elements (legacy endpoint, 1-s cadence)."""

    async def generate():
        elements_cache: list = []
        dump_tick = 0

        while True:
            udid = _mss_get_udid()

            if not udid:
                event = {"platform": "ANDROID", "screenshot": "",
                         "width": 390, "height": 844, "elements": [], "url": None}
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(2)
                continue

            try:
                jpeg = await capture_screenshot_fast(udid)
                if not jpeg:
                    await asyncio.sleep(1)
                    continue

                sid = str(_uuid_lib.uuid4())
                state.mss_screenshots[sid] = jpeg
                if len(state.mss_screenshots) > 30:
                    del state.mss_screenshots[next(iter(state.mss_screenshots))]

                try:
                    img = Image.open(io.BytesIO(jpeg))
                    w, h = img.size
                except Exception:
                    w, h = 390, 844

                dump_tick += 1
                if dump_tick >= 3:
                    dump_tick = 0
                    xml = await _adb_dump(udid)
                    if xml:
                        state.mss_last_xml = xml
                        elements_cache = _xml_to_mss_elements(xml)

                b64 = _base64.b64encode(jpeg).decode("ascii")
                event = {
                    "platform": "ANDROID",
                    "screenshot": b64,
                    "width": w,
                    "height": h,
                    "elements": elements_cache,
                    "url": None,
                }
                yield f"data: {json.dumps(event)}\n\n"

            except Exception as e:
                logger.error(f"MSS SSE frame error: {e}")

            await asyncio.sleep(1)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/mss/screenshot/{sid}")
async def mss_screenshot(sid: str):
    data = state.mss_screenshots.get(sid)
    if not data:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return Response(content=data, media_type="image/jpeg")


# ── New real-time SSE endpoint ──────────────────────────────────────────────

@router.get("/mss/api/devices/deviceScreen/sse")
async def mss_device_screen_new(instanceId: str = ""):
    """SSE stream: near-real-time device screen + UI elements.

    Architecture:
    - A shared background capturer (_frame_capturer) grabs screenshots at the
      device's maximum rate (~5 FPS on most Android devices via ADB screencap).
    - This SSE generator polls the frame cache every 50ms and immediately
      delivers any new frame to the browser.
    - Physical device interactions (touches, swipes) appear in the browser
      within ~200-300ms instead of the previous ~400-500ms.
    - A sibling task updates the element hierarchy every 1.5s without
      blocking the frame loop.
    - Width/height reported are NATIVE device dimensions so that element
      bounds (from uiautomator in native coords) align correctly with the
      preview image even though the JPEG is sent at half resolution.
    """
    udid = instanceId or _mss_get_udid()

    async def generate():
        active_udid = udid or _mss_get_udid()
        if not active_udid:
            # Wait briefly for a device to appear
            for _ in range(20):
                await asyncio.sleep(0.5)
                active_udid = _mss_get_udid()
                if active_udid:
                    break

        if not active_udid:
            yield f"data: {json.dumps({'platform': 'ANDROID', 'screenshot': '', 'width': 390, 'height': 844, 'elements': [], 'url': None})}\n\n"
            return

        # Start/join the shared background frame capturer for this device
        _capturer_acquire(active_udid)

        elements_ref = {"cache": [], "native_w": 0, "native_h": 0}

        async def dump_loop():
            """Pull UI hierarchy in the background without stalling the frame loop.

            Pauses during BOTH the embedded studio bursts (adb_command_active)
            and CLI test runs (maestro_test_active): `adb shell uiautomator dump`
            contends with Maestro driving the device, so we suspend it while a
            flow runs. The live mirror keeps streaming regardless."""
            while True:
                while state.adb_command_active.is_set() or state.maestro_test_active.is_set():
                    await asyncio.sleep(0.2)

                if state.mss_maestro_elements:
                    elements_ref["cache"] = state.mss_maestro_elements
                    await asyncio.sleep(0.5)
                    continue

                try:
                    xml = await _adb_dump(active_udid)
                    if xml:
                        state.mss_last_xml = xml
                        elements_ref["cache"] = _xml_to_mss_elements(xml)
                except Exception as e:
                    logger.debug(f"dump_loop error: {e}")
                await asyncio.sleep(1.5)

        dump_task = asyncio.create_task(dump_loop())

        try:
            last_seq = -1
            last_send_t = 0.0
            _loop = asyncio.get_event_loop()

            # COALESCE-TO-LATEST + RATE CAP. The bundle consumes this stream with
            # a raw EventSource, which CANNOT drop frames — it fires onmessage for
            # every event in order. Server-side delivery is real-time (measured:
            # ~2fps, a screen change reaches a fresh client in <0.1s, no
            # accumulation even during a maestro test). But the browser decodes a
            # base64 <img> + re-renders the screenshot/element overlay per frame,
            # and during a test it ALSO re-renders the flowStatus step list while
            # the host runs the maestro JVM + the daemon's PIL pipeline. When that
            # per-frame render is slower than the arrival rate, frames pile up in
            # the browser's buffer and the preview falls progressively behind
            # (the reported "preview on step 1, device on step 20").
            #
            # We can't make the precompiled bundle drop frames, so we throttle the
            # SOURCE: emit at most ~1.25 fps and always send the FRESHEST captured
            # frame (intermediate captures are dropped because we read _live_frames
            # at send time, not a queue). A slow renderer can keep up at this rate,
            # so the backlog never builds and latency stays <1s instead of growing
            # to 30s. Tunable knob — lower for smoother motion, raise if a slower
            # host still accumulates lag.
            MIN_SEND_INTERVAL = 0.8

            while True:
                # Pause delivery only during the embedded studio bursts (the
                # capturer is stopped then, so frames would be stale). During a
                # CLI test the capturer keeps producing fresh frames, so we keep
                # delivering them — this is what makes the run visible live.
                while state.adb_command_active.is_set():
                    await asyncio.sleep(0.1)

                frame = _live_frames.get(active_udid)
                now = _loop.time()
                if frame and frame["seq"] != last_seq and (now - last_send_t) >= MIN_SEND_INTERVAL:
                    last_seq = frame["seq"]
                    last_send_t = now

                    native_w = frame["w"]
                    native_h = frame["h"]
                    if native_w:
                        elements_ref["native_w"] = native_w
                        elements_ref["native_h"] = native_h

                    w = elements_ref["native_w"] or 390
                    h = elements_ref["native_h"] or 844

                    # Store for /mss/screenshot/:sid lookups
                    sid = str(_uuid_lib.uuid4())
                    state.mss_screenshots[sid] = frame["jpeg"]
                    if len(state.mss_screenshots) > 30:
                        del state.mss_screenshots[next(iter(state.mss_screenshots))]

                    b64 = _base64.b64encode(frame["jpeg"]).decode("ascii")
                    event = {
                        "platform": "ANDROID",
                        "screenshot": b64,
                        "width": w,
                        "height": h,
                        "elements": elements_ref["cache"],
                        "url": None,
                    }
                    yield f"data: {json.dumps(event)}\n\n"

                # Poll the cache at 50ms intervals — fast enough to deliver
                # frames within one tick of being captured (screencap is the
                # bottleneck at 150-250ms) and slow enough to avoid starving
                # the maestro subprocess's stdout drain task on Run Test.
                await asyncio.sleep(0.05)

        finally:
            dump_task.cancel()
            try:
                await dump_task
            except (asyncio.CancelledError, Exception):
                pass
            _capturer_release(active_udid)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
