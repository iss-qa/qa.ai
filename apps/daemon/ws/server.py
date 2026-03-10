import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from models.run_event import RunEvent

logger = logging.getLogger("ws_server")

class WebSocketServer:
    def __init__(self):
        # Map connection ID to WebSocket instance
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client disconnected: {client_id}")

    async def broadcast(self, event: RunEvent):
        """Send event to all connected clients."""
        if not self.active_connections:
            return
            
        message = event.to_json()
        disconnected_clients = []
        
        for client_id, connection in self.active_connections.items():
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {e}")
                disconnected_clients.append(client_id)
                
        # Clean up dead connections
        for client_id in disconnected_clients:
            self.disconnect(client_id)

ws_server = WebSocketServer()
