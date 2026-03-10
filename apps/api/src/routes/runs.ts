import { FastifyPluginAsync } from 'fastify';

const runRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/runs', async () => {
        return { runs: [] };
    });

    // Trigger run from CI/CD
    fastify.post('/runs/trigger', async (request, reply) => {
        const payload = request.body as { testCaseId: string, environment?: string };
        const apiKey = request.headers['x-api-key'];

        if (!apiKey) {
            return reply.status(401).send({ error: 'Missing x-api-key header' });
        }

        fastify.log.info(`Triggering test ${payload.testCaseId} via external API`);

        return reply.send({
            success: true,
            message: 'Run queued successfully',
            runId: `ext-${Date.now()}`
        });
    });
};

export default runRoutes;
