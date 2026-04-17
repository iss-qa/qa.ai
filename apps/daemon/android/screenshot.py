import uiautomator2 as u2
from PIL import Image
import io
import httpx
import os
import logging
import asyncio
import base64

logger = logging.getLogger("screenshot")

def _png_to_jpeg_half_res(png_bytes: bytes) -> tuple[bytes, int, int]:
    """PIL pipeline: decode PNG → resize to 50% → JPEG 45%. Returns (jpeg, native_w, native_h)."""
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    native_w, native_h = img.size
    img = img.resize((native_w // 2, native_h // 2), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    img.save(output, format='JPEG', quality=45, optimize=False)
    return output.getvalue(), native_w, native_h


async def capture_screenshot_fast(udid: str) -> bytes:
    """
    Optimized pipeline: PNG → JPEG 45% quality, 50% resolution.
    Result: ~80-120KB instead of ~500KB. Latency: ~150-250ms.
    """
    jpeg, _w, _h = await capture_screenshot_with_native_size(udid)
    return jpeg


async def capture_screenshot_with_native_size(udid: str) -> tuple[bytes, int, int]:
    """Same as capture_screenshot_fast but also returns the NATIVE (pre-resize) dimensions.

    Needed by the Maestro Studio SSE stream so that element bounds (which are in native
    device coords from uiautomator) map correctly onto the preview — mismatched width/height
    would cause highlights to be scaled wrong relative to the bounds percentages.
    """
    proc = await asyncio.create_subprocess_exec(
        'adb', '-s', udid, 'exec-out', 'screencap', '-p',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    png_bytes, _ = await proc.communicate()

    try:
        # PIL decode/resize/encode is CPU-bound — run off the event loop so concurrent
        # SSE consumers and other HTTP handlers are not blocked.
        return await asyncio.to_thread(_png_to_jpeg_half_res, png_bytes)
    except Exception as e:
        logger.error(f"Failed to capture fast screenshot for {udid}: {e}")
        return b"", 0, 0

class ScreenshotHandler:
    QUALITY = 80
    MAX_WIDTH = 1080
    
    def __init__(self):
        self.supabase_url = os.environ.get("SUPABASE_URL", "http://localhost:54321")
        self.supabase_key = os.environ.get("SUPABASE_KEY", "")
        self.bucket = "screenshots"
        
    async def capture_and_upload(
        self, 
        device: u2.Device,
        run_id: str,
        step_num: int,
        phase: str
    ) -> str:
        try:
            # 1. Capture image (returns PIL Image)
            # Run in thread to avoid blocking the event loop / scrcpy relay
            img = await asyncio.to_thread(device.screenshot)
            
            # 2. Resize if necessary
            if img.width > self.MAX_WIDTH:
                ratio = self.MAX_WIDTH / img.width
                new_height = int(img.height * ratio)
                img = img.resize((self.MAX_WIDTH, new_height), Image.Resampling.LANCZOS)
                
            # 3. Compress to JPEG
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG', quality=self.QUALITY, optimize=True)
            img_byte_arr.seek(0)
            
            # Temporary fallback for local testing without Supabase configured
            if not self.supabase_key or self.supabase_key == "your-supabase-key-here":
                logger.info(f"Skipping screenshot upload for {step_num}_{phase} (No Supabase key). Returning base64 data URI.")
                b64_data = base64.b64encode(img_byte_arr.read()).decode('utf-8')
                return f"data:image/jpeg;base64,{b64_data}"
            
            # 4. Upload to Supabase Storage
            filename = f"{run_id}/step_{step_num}_{phase}.jpg"
            upload_url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{filename}"
            
            headers = {
                "Authorization": f"Bearer {self.supabase_key}",
                "apikey": self.supabase_key,
                "Content-Type": "image/jpeg"
            }
            
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.post(upload_url, headers=headers, content=img_byte_arr.read())
                res.raise_for_status()
                
            public_url = f"{self.supabase_url}/storage/v1/object/public/{self.bucket}/{filename}"
            return public_url
            
        except Exception as e:
            logger.error(f"Error capturing/uploading screenshot: {e}")
            return ""

screenshot_handler = ScreenshotHandler()
