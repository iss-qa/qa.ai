'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { sessionLogger } from '@/lib/session-logger';

/**
 * Invisible component that initializes session logging
 * and tracks page navigation.
 */
export function SessionLogProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const prevPathRef = useRef<string | null>(null);
    const startedRef = useRef(false);

    // Start session logger once
    useEffect(() => {
        if (!startedRef.current) {
            sessionLogger.start();
            startedRef.current = true;
        }
        return () => {
            sessionLogger.stop();
        };
    }, []);

    // Track navigation
    useEffect(() => {
        if (prevPathRef.current && prevPathRef.current !== pathname) {
            sessionLogger.logNavigation(prevPathRef.current, pathname || '/');
        }
        prevPathRef.current = pathname;
    }, [pathname]);

    return <>{children}</>;
}
