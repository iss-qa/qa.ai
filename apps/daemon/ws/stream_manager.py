import asyncio
import json
import logging
import time
from fastapi import WebSocket, WebSocketDisconnect
from android.scrcpy_client import ScrcpyClient
from log_manager import log_manager

logger = logging.getLogger("stream_manager")

# Watchdog do encoder: sem frames por mais que STALL_S segundos, pede um
# keyframe novo (RESET_VIDEO). Transições de surface (pm clear, splash →
# primeira tela, diálogo de permissão do sistema) congelam o H.264 no último
# frame — um único reset no launch não basta porque o stall se repete a cada
# transição. Em tela parada o custo é um keyframe a cada ~RESET_COOLDOWN_S,
# irrelevante em localhost.
WATCHDOG_INTERVAL_S = 1.0
STALL_S = 2.0
RESET_COOLDOWN_S = 3.0


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
        self.watchdog_tasks: dict[str, asyncio.Task] = {}
    
    async def connect(self, udid: str, websocket: WebSocket):
        await websocket.accept()
        self.active_streams[udid] = websocket
        
        # Iniciar scrcpy client se ainda não existir para esse device
        if udid not in self.scrcpy_clients:
            client = ScrcpyClient(udid, max_fps=30, max_width=1080)
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
        # Watchdog anti-congelamento: destrava o encoder após pm clear /
        # splash / diálogos de permissão sem depender de reset manual.
        self.watchdog_tasks[udid] = asyncio.create_task(self._video_watchdog(udid, client))
        logger.info(f"Stream WebSocket connected for device {udid} (Scrcpy)")
        log_manager.device(f"Stream espelhamento iniciado | WebSocket conectado", udid=udid)
        
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
                    elif msg_type == "text":
                        text = msg.get("text", "")
                        if text:
                            await client.send_text(text=text)
                    elif msg_type == "backspace":
                        await client.send_backspace()
                except json.JSONDecodeError as e:
                    logger.warning(f"JSON inválido recebido do browser para {udid}: {e}")
                    log_manager.device(f"JSON inválido recebido do browser: {e}", udid=udid, level="WARN")
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

        if udid in self.watchdog_tasks:
            self.watchdog_tasks[udid].cancel()
            self.watchdog_tasks.pop(udid)
            
        if udid in self.scrcpy_clients:
            try:
                client = self.scrcpy_clients.pop(udid)
                await client.stop()
            except Exception as e:
                logger.error(f"Error stopping ScrcpyClient for {udid}: {e}")
            
        logger.info(f"Stream WebSocket disconnected and Scrcpy stopped for device {udid}")
        log_manager.device(f"Stream espelhamento finalizado | WebSocket desconectado", udid=udid)

    async def _relay_video(self, udid: str, client: ScrcpyClient, websocket: WebSocket):
        """Lê frames binários NAL H.264 do scrcpy e repassa ao browser.

        Auto-recuperação: `pm clear` do app em foreground (launch de gravação
        com clearState) MATA o processo do scrcpy server no device — o socket
        de vídeo fecha com EOF. Antes isso derrubava o WebSocket do browser e
        o preview congelava no último frame. Agora o relay reinicia o scrcpy
        in-place (mesmo WS) e segue transmitindo.
        """
        try:
            while udid in self.active_streams:
                frame_data = await client.read_video_frame()
                if frame_data is None:
                    logger.warning(f"Video stream ended for {udid} — tentando restart do scrcpy")
                    log_manager.device("Scrcpy caiu (pm clear?) — reiniciando server", udid=udid, level="WARN")
                    client = await self._restart_client(udid, websocket)
                    if client is None:
                        break
                    continue

                try:
                    await websocket.send_bytes(frame_data)
                except RuntimeError as e:
                    logger.warning(f"WebSocket runtime error ao enviar frame para {udid}: {e}")
                    log_manager.device(f"WebSocket runtime error no envio de frame: {e}", udid=udid, level="WARN")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Relay video error for {udid}: {e}")
            log_manager.device(f"Erro no relay de vídeo: {e}", udid=udid, level="ERROR")
        finally:
            await self.disconnect(udid)

    async def _restart_client(self, udid: str, websocket: WebSocket) -> ScrcpyClient | None:
        """Recria o ScrcpyClient após morte do server no device.

        Retorna o novo client (já registrado em scrcpy_clients e com o
        watchdog reapontado), ou None se todas as tentativas falharem.
        """
        old = self.scrcpy_clients.pop(udid, None)
        if old:
            try:
                await old.stop()
            except Exception:
                pass

        for attempt in range(3):
            if udid not in self.active_streams:
                return None
            # pm clear + am start ainda podem estar em andamento — dá um
            # respiro antes de subir o server de novo.
            await asyncio.sleep(0.8 * (attempt + 1))
            client = ScrcpyClient(udid, max_fps=30, max_width=1080)
            try:
                await client.start()
            except Exception as e:
                logger.warning(f"[RESTART] scrcpy attempt {attempt + 1}/3 falhou para {udid}: {e}")
                try:
                    await client.stop()
                except Exception:
                    pass
                continue

            self.scrcpy_clients[udid] = client
            # Reaponta o watchdog para o client novo
            if udid in self.watchdog_tasks:
                self.watchdog_tasks[udid].cancel()
            self.watchdog_tasks[udid] = asyncio.create_task(self._video_watchdog(udid, client))

            # Browser precisa das dimensões novas (resolução pode mudar)
            try:
                await websocket.send_text(json.dumps({
                    "type": "device_info",
                    "width": client.frame_width,
                    "height": client.frame_height,
                    "device_name": client.device_name,
                }))
            except Exception:
                pass
            logger.info(f"[RESTART] scrcpy recuperado para {udid} (tentativa {attempt + 1})")
            log_manager.device("Scrcpy reiniciado — espelhamento recuperado", udid=udid)
            return client

        logger.error(f"[RESTART] scrcpy não recuperou para {udid} após 3 tentativas")
        return None

    async def _video_watchdog(self, udid: str, client: ScrcpyClient):
        """Pede RESET_VIDEO quando o encoder estagna APÓS uma atividade.

        Condição de disparo: houve input (toque/tecla/gravação física/launch)
        DEPOIS do último frame e o stream ficou STALL_S sem frames — ou seja,
        a tela deveria ter mudado e nada chegou. Em tela ociosa (sem
        atividade) o watchdog nunca dispara: resetar em idle reiniciava o
        encoder à toa e causava a "piscada" preta periódica no preview.
        """
        last_reset = 0.0
        try:
            while udid in self.active_streams:
                await asyncio.sleep(WATCHDOG_INTERVAL_S)
                now = time.monotonic()
                expecting_frames = client.last_activity_at > client.last_frame_at
                stalled = (now - client.last_frame_at) > STALL_S
                cooled = (now - last_reset) > RESET_COOLDOWN_S
                if expecting_frames and stalled and cooled:
                    last_reset = now
                    logger.info(
                        f"[WATCHDOG] {udid}: atividade sem frames há "
                        f"{now - client.last_frame_at:.1f}s — RESET_VIDEO"
                    )
                    await client.reset_video()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"[WATCHDOG] {udid}: encerrado com erro: {e}")

screen_stream_manager = ScreenStreamManager()
