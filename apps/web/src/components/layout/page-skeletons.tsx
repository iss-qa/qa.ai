import { Skeleton } from '@/components/ui/skeleton';

/**
 * Reusable route-level skeletons rendered via Next.js loading.tsx Suspense
 * boundaries. Their only job is to commit the navigation instantly (so the
 * sidebar highlight + page header swap immediately) while the client page
 * fetches its data. See CLAUDE.md "Navegação" rules.
 */

function CardSkeleton({ className = '' }: { className?: string }) {
    return <Skeleton className={`rounded-2xl border border-border bg-card ${className}`} />;
}

export function DashboardSkeleton() {
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-6 lg:gap-8">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-[140px]" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <CardSkeleton className="lg:col-span-2 h-[350px]" />
                <CardSkeleton className="h-[350px]" />
            </div>
            <CardSkeleton className="h-64" />
        </div>
    );
}

export function ListPageSkeleton() {
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-44" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} className="h-40" />)}
            </div>
        </div>
    );
}

export function MapPageSkeleton() {
    return (
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-8 w-56" />
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-48 rounded-lg" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
            </div>
            <Skeleton className="flex-1 min-h-[600px] rounded-2xl border border-border bg-card" />
        </div>
    );
}
