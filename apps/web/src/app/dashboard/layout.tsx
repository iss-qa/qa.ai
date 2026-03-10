import { PageWrapper } from '@/components/layout/PageWrapper';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <PageWrapper>{children}</PageWrapper>;
}
