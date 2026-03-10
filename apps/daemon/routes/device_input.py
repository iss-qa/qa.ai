from fastapi import APIRouter
from pydantic import BaseModel
import subprocess

router = APIRouter(prefix="/api/devices/{udid}/input", tags=["Device Input"])

class TapRequest(BaseModel):
    x: int
    y: int

class SwipeRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    duration_ms: int = 200

class KeyEventRequest(BaseModel):
    keycode: int

class TextRequest(BaseModel):
    text: str

@router.post("/tap")
async def tap(udid: str, body: TapRequest):
    """Toque simples nas coordenadas reais do device."""
    subprocess.run([
        'adb', '-s', udid, 'shell', 'input', 'tap',
        str(body.x), str(body.y)
    ])
    return {"status": "ok"}

@router.post("/swipe")
async def swipe(udid: str, body: SwipeRequest):
    """
    Swipe de (x1,y1) para (x2,y2) em duration_ms milissegundos.
    Usado para scroll e drag.
    """
    subprocess.run([
        'adb', '-s', udid, 'shell', 'input', 'swipe',
        str(body.x1), str(body.y1),
        str(body.x2), str(body.y2),
        str(body.duration_ms)
    ])
    return {"status": "ok"}

@router.post("/keyevent")
async def keyevent(udid: str, body: KeyEventRequest):
    """
    Pressionar tecla pelo código Android.
    Exemplos: KEYCODE_BACK=4, KEYCODE_HOME=3, KEYCODE_APP_SWITCH=187
    """
    subprocess.run([
        'adb', '-s', udid, 'shell', 'input', 'keyevent',
        str(body.keycode)
    ])
    return {"status": "ok"}

@router.post("/text")
async def input_text(udid: str, body: TextRequest):
    """Digitar texto no campo focado."""
    # Escapar caracteres especiais para o shell
    escaped = body.text.replace(' ', '%s').replace("'", "\\'")
    subprocess.run([
        'adb', '-s', udid, 'shell', 'input', 'text', escaped
    ])
    return {"status": "ok"}
