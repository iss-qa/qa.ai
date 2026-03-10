import asyncio
import socket
import struct
import os
import httpx
import logging
import secrets

logger = logging.getLogger("scrcpy_client")

SCRCPY_SERVER_VERSION = "2.7"
SCRCPY_SERVER_PATH = f"/tmp/scrcpy-server-v{SCRCPY_SERVER_VERSION}.jar"
SCRCPY_SERVER_URL = f"https://github.com/Genymobile/scrcpy/releases/download/v{SCRCPY_SERVER_VERSION}/scrcpy-server-v{SCRCPY_SERVER_VERSION}"

class ScrcpyClient:
    """
    Conecta ao scrcpy-server rodando no device Android.
    Expõe stream H.264 para relay via WebSocket.
    
    Protocolo scrcpy:
    - Porta padrão: 27183
    - 3 conexões TCP são estabelecidas:
      1. video  — stream H.264 (leitura)
      2. audio  — stream opus (ignorar por ora)
      3. control — enviar eventos de input (escrita)
    """
    
    VIDEO_SOCKET_NAME = "scrcpy_video"
    LOCAL_PORT_BASE = 27183
    
    def __init__(self, udid: str, max_fps: int = 60, max_width: int = 1080):
        self.udid = udid
        self.max_fps = max_fps
        self.max_width = max_width  # limitar resolução para reduzir bandwidth
        self._video_socket = None
        self._control_socket = None
        self._process = None
        self.scid_hex = f"{secrets.randbelow(0x7FFFFFFF):08x}"
        # Use a unique port per device based on a hash of udid to avoid conflicts
        self.local_port = self.LOCAL_PORT_BASE + (hash(udid) % 1000)
    
    async def start(self):
        """
        1. Garantir que o scrcpy-server.jar existe localmente
        2. Push do JAR para o device
        3. Iniciar o server no device via adb shell
        4. Configurar adb forward
        5. Conectar sockets
        """
        logger.info("[scrcpy_client] 1. _ensure_server_jar()")
        await self._ensure_server_jar()
        logger.info("[scrcpy_client] 2. _push_server_to_device()")
        await self._push_server_to_device()
        logger.info("[scrcpy_client] 3. _start_server_on_device()")
        await self._start_server_on_device()
        logger.info("[scrcpy_client] Aguardando server iniciar...")
        await asyncio.sleep(0.5)  # aguardar server iniciar
        logger.info("[scrcpy_client] 4. _setup_forward()")
        await self._setup_forward()
        logger.info("[scrcpy_client] 5. _connect_sockets()")
        await self._connect_sockets()
        logger.info("[scrcpy_client] start() completo")
    
    async def _ensure_server_jar(self):
        """Baixar o scrcpy-server.jar se não existir."""
        if os.path.exists(SCRCPY_SERVER_PATH):
            return
        
        logger.info(f"Downloading scrcpy-server v{SCRCPY_SERVER_VERSION}...")
        async with httpx.AsyncClient() as client:
            response = await client.get(SCRCPY_SERVER_URL, follow_redirects=True)
            with open(SCRCPY_SERVER_PATH, 'wb') as f:
                f.write(response.content)
        logger.info(f"scrcpy-server v{SCRCPY_SERVER_VERSION} baixado")
    
    async def _push_server_to_device(self):
        """Push do JAR para /data/local/tmp/ no device."""
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', self.udid,
            'push', SCRCPY_SERVER_PATH,
            '/data/local/tmp/scrcpy-server.jar',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
    
    async def _start_server_on_device(self):
        """
        Iniciar o scrcpy-server no device.
        """
        cmd = (
            f"CLASSPATH=/data/local/tmp/scrcpy-server.jar "
            f"app_process / com.genymobile.scrcpy.Server "
            f"{SCRCPY_SERVER_VERSION} "
            f"scid={self.scid_hex} "
            f"tunnel_forward=true "
            f"video_codec=h264 "
            f"max_fps={self.max_fps} "
            f"max_size={self.max_width} "
            f"audio=false "
            f"control=true "
            f"cleanup=false"
        )
        
        # Rodar em background (o processo fica vivo enquanto capturamos)
        self._process = await asyncio.create_subprocess_exec(
            'adb', '-s', self.udid, 'shell', cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
    
    async def _setup_forward(self):
        """Configurar adb forward para acessar o socket do device localmente."""
        # Limpar forward anterior se existir
        await asyncio.create_subprocess_exec(
            'adb', '-s', self.udid,
            'forward', '--remove', f'tcp:{self.local_port}',
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        
        proc = await asyncio.create_subprocess_exec(
            'adb', '-s', self.udid,
            'forward', f'tcp:{self.local_port}',
            f'localabstract:scrcpy_{self.scid_hex}',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
    
    async def _connect_sockets(self):
        """
        Conectar ao video socket e ao control socket.
        """
        # Timeout loop for connection
        for _ in range(10):
            try:
                # Video socket
                reader_v, writer_v = await asyncio.open_connection('127.0.0.1', self.local_port)
                
                # Control socket (segunda conexão na mesma porta)
                reader_c, writer_c = await asyncio.open_connection('127.0.0.1', self.local_port)
                
                # Consumir dummy byte do video socket
                _dummy = await reader_v.readexactly(1)
                
                # Ler device info do header (64 bytes)
                device_name_bytes = await reader_v.readexactly(64)   # device name
                
                # Let's read 4 bytes for codec
                codec_id = await reader_v.readexactly(4)
                
                width_bytes = await reader_v.readexactly(4)
                height_bytes = await reader_v.readexactly(4)
                
                self.device_name = device_name_bytes.decode('utf-8', errors='ignore').rstrip('\x00')
                self.codec_id = codec_id.decode('utf-8', errors='ignore')
                self.frame_width = struct.unpack('>I', width_bytes)[0]
                self.frame_height = struct.unpack('>I', height_bytes)[0]
                
                self._video_reader = reader_v
                self._video_writer = writer_v
                self._control_writer = writer_c
                
                logger.info(f"Conectado ao espelhamento: {self.device_name} ({self.codec_id}) {self.frame_width}dx{self.frame_height}")
                return
            except (ConnectionRefusedError, asyncio.IncompleteReadError) as e:
                logger.warning(f"Tentativa de conexão falhou ({e}), tentando novamente...")
                await asyncio.sleep(0.5)
                
        raise ConnectionError(f"Falha ao conectar ao servidor scrcpy no device {self.udid} após várias tentativas")
    
    async def read_video_frame(self) -> bytes | None:
        """
        Lê um NAL unit do stream H.264.
        """
        try:
            # Ler header: pts (8 bytes) + size (4 bytes)
            header = await self._video_reader.readexactly(12)
            pts = struct.unpack('>Q', header[:8])[0]
            size = struct.unpack('>I', header[8:12])[0]
            
            # Ler dados do frame
            data = await self._video_reader.readexactly(size)
            return data
        except (asyncio.IncompleteReadError, ConnectionResetError) as e:
            logger.error(f"Error reading video frame: {e}")
            return None
    
    async def send_touch(self, action: str, x: int, y: int, pressure: float = 1.0):
        """
        Enviar evento de toque para o device.
        action: "down" | "up" | "move"
        """
        action_code = {"down": 0, "up": 1, "move": 2}[action]
        pressure_int = int(pressure * 0xffff)
        
        msg = struct.pack(
            '>BBqIIHHHII',
            0x02,           # type: INJECT_TOUCH_EVENT
            action_code,
            0,              # pointer_id (q = 8 bytes in v2+)
            x, y,
            self.frame_width, self.frame_height,
            pressure_int,
            0, 0            # action_button, buttons
        )
        self._control_writer.write(msg)
        await self._control_writer.drain()
    
    async def send_keyevent(self, keycode: int, action: str = "down_up"):
        """
        Enviar keyevent (back, home, recents, etc).
        """
        actions = [0] if action == "down" else [1] if action == "up" else [0, 1]
        
        for act in actions:
            msg = struct.pack(
                '>BBiII',
                0x00,      # type: INJECT_KEYCODE
                act,       # action
                keycode,   # keycode
                0,         # repeat
                0          # metaState
            )
            self._control_writer.write(msg)
        
        await self._control_writer.drain()
    
    async def stop(self):
        """Parar o client e limpar recursos."""
        if self._process:
            try:
                self._process.terminate()
            except Exception as e:
                logger.error(f"Error terminating scrcpy process: {e}")
        
        # Remover adb forward
        try:
            proc = await asyncio.create_subprocess_exec(
                'adb', '-s', self.udid,
                'forward', '--remove', f'tcp:{self.local_port}',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.wait()
            
            # Kill the spawned app_process on the device
            kill_proc = await asyncio.create_subprocess_exec(
                'adb', '-s', self.udid,
                'shell', 'pkill', 'app_process',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await kill_proc.wait()
        except Exception as e:
            logger.error(f"Error removing adb forward: {e}")
