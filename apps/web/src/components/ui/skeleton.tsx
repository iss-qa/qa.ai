import { cn } from '@/lib/utils';

/** Themed shimmer placeholder. Uses tokens so it works in light & dark. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('animate-pulse rounded-md bg-surface-muted', className)}
            {...props}
        />
    );
}
