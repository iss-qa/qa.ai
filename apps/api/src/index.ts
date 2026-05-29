// IMPORTANTE: dotenv/config TEM que ser a primeira coisa importada.
// Qualquer modulo que leia process.env no top-level (ex: plugins/supabase.ts)
// precisa do .env ja carregado, e os imports sao executados em ordem.
import 'dotenv/config';

import Fastify from 'fastify';
import corsPlugin from './plugins/cors';
import websocketPlugin from './plugins/websocket';
import healthRoutes from './routes/health';
import billingRoutes from './routes/billing';
import runRoutes from './routes/runs';
import integrationsRoutes from './routes/integrations';
import qaJourneyRoutes from './routes/qa-journey';
import { registerCronJobs } from './services/cron';

const server = Fastify({ logger: true });

async function main() {
    await server.register(corsPlugin);
    await server.register(websocketPlugin);

    // Register routes
    await server.register(healthRoutes);
    await server.register(billingRoutes);
    await server.register(runRoutes);
    await server.register(integrationsRoutes);
    await server.register(qaJourneyRoutes);

    try {
        const port = Number(process.env.PORT) || 3001;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on port ${port}`);
        registerCronJobs();
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

main();
