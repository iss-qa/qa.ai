import Fastify from 'fastify';
import corsPlugin from './plugins/cors';
import websocketPlugin from './plugins/websocket';
import healthRoutes from './routes/health';
import billingRoutes from './routes/billing';
import runRoutes from './routes/runs';
import 'dotenv/config';

const server = Fastify({ logger: true });

async function main() {
    await server.register(corsPlugin);
    await server.register(websocketPlugin);

    // Register routes
    await server.register(healthRoutes);
    await server.register(billingRoutes);
    await server.register(runRoutes);

    try {
        const port = Number(process.env.PORT) || 3001;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

main();
