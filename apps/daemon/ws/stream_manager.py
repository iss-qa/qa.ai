import asyncio
import json
import logging
from fastapi import WebSocket, WebSocketDisconnect
from android.scrcpy_client import ScrcpyClient

logger = logging.getLogger("stream_manager")

class ScreenStreamManager:
    """
    Gerencia as conexões de WebSocket para espelhamento via scrcpy.
    Relays stream H.264 do device para o browser.
    Recebe inputs touch/keyevent do browser e repassa ao device via scrcpy control socket.
    """
    def __init__(self):
        self.scrcpy_clients: dict[str, ScrcpyClient] = {}
        self.active_streams: dict[str, WebSocket] = {}
        self.relay_tasks: dict[str, asyncio.Task] = {}
    
    async def connect(self, udid: str, websocket: WebSocket):
        await websocket.accept()
        self.active_streams[udid] = websocket
        
        # Iniciar scrcpy client se ainda não existir para esse device
        if udid not in self.scrcpy_clients:
            client = ScrcpyClient(udid, max_fps=60, max_width=1080)
            try:
                await client.start()
                self.scrcpy_clients[udid] = client
            except Exception as e:
                logger.error(f"Error starting ScrcpyClient for {udid}: {e}")
                await websocket.close(code=1011, reason="Failed to start scrcpy")
                return
        
        client = self.scrcpy_clients[udid]
        
        # Enviar metadados iniciais (dimensões e nome do device)
        await websocket.send_text(json.dumps({
            "type": "device_info",
            "width": client.frame_width,
            "height": client.frame_height,
            "device_name": client.device_name
        }))
        
        # Criar task para relé contínuo de vídeo do scrcpy -> WebSocket
        self.relay_tasks[udid] = asyncio.create_task(self._relay_video(udid, client, websocket))
        logger.info(f"Stream WebSocket connected for device {udid} (Scrcpy)")
        
        # Loop para receber eventos de input do browser -> scrcpy
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                    msg_type = msg.get("type")
                    if msg_type == "touch":
                        await client.send_touch(
                            action=msg.get("action", "down"),
                            x=msg.get("x", 0),
                            y=msg.get("y", 0),
                            pressure=msg.get("pressure", 1.0)
                        )
                    elif msg_type == "keyevent":
                        await client.send_keyevent(keycode=msg.get("keycode", 0))
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            pass
        finally:
            await self.disconnect(udid)

    async def disconnect(self, udid: str):
        if udid in self.active_streams:
            self.active_streams.pop(udid)
            
        if udid in self.relay_tasks:
            self.relay_tasks[udid].cancel()
            self.relay_tasks.pop(udid)
            
        if udid in self.scrcpy_clients:
            try:
                client = self.scrcpy_clients.pop(udid)
                await client.stop()
            except Exception as e:
                logger.error(f"Error stopping ScrcpyClient for {udid}: {e}")
            
        logger.info(f"Stream WebSocket disconnected and Scrcpy stopped for device {udid}")

    async def _relay_video(self, udid: str, client: ScrcpyClient, websocket: WebSocket):
        """Lê frames binários NAL H.264 do scrcpy e repassa ao browser."""
        try:
            while udid in self.active_streams:
                frame_data = await client.read_video_frame()
                if frame_data is None:
                    # Stream terminou ou desconectou
                    logger.warning(f"Video stream ended for {udid}")
                    break
                
                # Enviar frame H.264 cru (bytes binários)
                try:
                    await websocket.send_bytes(frame_data)
                except RuntimeError:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Relay video error for {udid}: {e}")
        finally:
            await self.disconnect(udid)

screen_stream_manager = ScreenStreamManager()
