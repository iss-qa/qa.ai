import { FastifyPluginAsync } from 'fastify';

const projectRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/projects', async () => {
        return { projects: [] };
    });
};

export default projectRoutes;
