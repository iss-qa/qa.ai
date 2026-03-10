import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
    await fastify.register(cors, {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    });
});
