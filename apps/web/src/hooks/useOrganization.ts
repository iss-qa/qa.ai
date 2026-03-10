// Placeholder hook for MVP until Supabase Auth is strictly mapped.
export function useOrganization() {
    return {
        org: {
            id: 'mock-org-123',
            name: 'Acme Corp',
            plan: 'pro',
            plan_limits: { max_devices: -1, max_executions_per_month: 3000 },
            executions_this_month: 250,
            devices_count: 2
        }
    };
}
