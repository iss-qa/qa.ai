'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from 'react';

/**
 * Shell-wide UI state shared between the Sidebar, Header and the top progress
 * bar: optimistic navigation (immediate active highlight + pending route) and
 * the mobile sidebar drawer open/close state.
 */
type ShellContextValue = {
    /** Navigate with optimistic feedback. Highlights the target instantly. */
    navigate: (href: string) => void;
    /** Href of the route currently being navigated to, or null when idle. */
    pendingHref: string | null;
    /** True while a navigation transition is in flight. */
    isNavigating: boolean;
    mobileSidebarOpen: boolean;
    setMobileSidebarOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // Clear the optimistic target once the route actually commits.
    useEffect(() => {
        setPendingHref(null);
    }, [pathname]);

    // Close the mobile drawer whenever the route changes.
    useEffect(() => {
        setMobileSidebarOpen(false);
    }, [pathname]);

    const navigate = useCallback(
        (href: string) => {
            if (href === pathname) {
                setMobileSidebarOpen(false);
                return;
            }
            setPendingHref(href);
            setMobileSidebarOpen(false);
            startTransition(() => {
                router.push(href);
            });
        },
        [pathname, router],
    );

    return (
        <ShellContext.Provider
            value={{
                navigate,
                pendingHref: isPending ? pendingHref : null,
                isNavigating: isPending,
                mobileSidebarOpen,
                setMobileSidebarOpen,
            }}
        >
            {children}
            <NavProgressBar active={isPending} />
        </ShellContext.Provider>
    );
}

export function useShell(): ShellContextValue {
    const ctx = useContext(ShellContext);
    if (!ctx) {
        return {
            navigate: () => {},
            pendingHref: null,
            isNavigating: false,
            mobileSidebarOpen: false,
            setMobileSidebarOpen: () => {},
        };
    }
    return ctx;
}

/**
 * Slim top progress bar shown during route transitions. Animates to ~90% while
 * pending, then completes and fades out — classic perceived-performance cue.
 */
function NavProgressBar({ active }: { active: boolean }) {
    const [width, setWidth] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let raf = 0;
        let timeout: ReturnType<typeof setTimeout>;
        if (active) {
            setVisible(true);
            setWidth(8);
            // Creep toward 90% to signal ongoing work without ever "finishing".
            raf = window.requestAnimationFrame(() => setWidth(90));
        } else if (visible) {
            setWidth(100);
            timeout = setTimeout(() => {
                setVisible(false);
                setWidth(0);
            }, 280);
        }
        return () => {
            window.cancelAnimationFrame(raf);
            clearTimeout(timeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    if (!visible) return null;

    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
            <div
                className="h-full bg-brand shadow-[0_0_8px_rgba(74,144,217,0.6)] transition-[width] duration-300 ease-out"
                style={{ width: `${width}%` }}
            />
        </div>
    );
}
