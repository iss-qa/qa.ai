import { FastifyInstance } from 'fastify';

// Mocking Stripe for the MVP
export default async function billingRoutes(fastify: FastifyInstance) {

    // Create Checkout Session
    fastify.post('/billing/checkout', async (request, reply) => {
        const { planId, organizationId } = request.body as { planId: string, organizationId: string };

        if (!planId || !organizationId) {
            return reply.status(400).send({ error: 'Missing planId or organizationId' });
        }

        // Simulating Stripe Checkout URL generation
        return reply.send({
            checkoutUrl: `https://mock-stripe.com/checkout/${planId}?org=${organizationId}`
        });
    });

    // Mock Webhook receiver
    fastify.post('/billing/webhook', async (request, reply) => {
        const event = request.body as any;

        // In a real app we verify the Stripe signature
        // const signature = request.headers['stripe-signature'];

        fastify.log.info(`Received mock Stripe webhook: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
            const orgId = event.data.object.client_reference_id;
            // Upgrade organization in Supabase
            fastify.log.info(`Upgrading org ${orgId} to Pro Plan`);
        }

        return reply.send({ received: true });
    });
}
