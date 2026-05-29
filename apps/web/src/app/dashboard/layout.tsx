import { PageWrapper } from '@/components/layout/PageWrapper';

// Dashboard pages are auth-gated and read live/search-param state (nuqs,
// useSearchParams), so they cannot be statically prerendered. Forcing the
// whole segment to dynamic avoids the "useSearchParams should be wrapped in a
// suspense boundary" prerender bailout during `next build`.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <PageWrapper>{children}</PageWrapper>;
}
