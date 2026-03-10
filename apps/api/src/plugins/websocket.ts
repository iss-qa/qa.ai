import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import { FastifyInstance, FastifyRequest } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
    await fastify.register(websocket);

    fastify.get('/ws', { websocket: true }, (connection: any, req: FastifyRequest) => {
        connection.socket.on('message', (message: Buffer) => {
            connection.socket.send(`Received: ${message}`);
        });
    });
});
