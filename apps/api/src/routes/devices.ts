import { FastifyPluginAsync } from 'fastify';

const deviceRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/devices', async () => {
        return { devices: [] };
    });
};

export default deviceRoutes;
