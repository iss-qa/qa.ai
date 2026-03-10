import { FastifyPluginAsync } from 'fastify';

const testRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/tests', async () => {
        return { tests: [] };
    });
};

export default testRoutes;
