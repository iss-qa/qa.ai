'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from './theme-provider';

/**
 * Theme switch button. Renders a stable placeholder until mounted so SSR and the
 * first client render match (the actual theme is set pre-paint by the inline
 * script), then shows the correct icon.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={isDark ? 'Modo claro' : 'Modo escuro'}
            className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer ${className}`}
        >
            {mounted ? (
                isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
            ) : (
                <Moon className="h-4 w-4" />
            )}
        </button>
    );
}
