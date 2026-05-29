'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'qamind-theme';

type ThemeContextValue = {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script string injected into <head> BEFORE first paint to set the theme
 * class on <html>, avoiding a flash of the wrong theme (FOUC). Default is dark;
 * the OS preference is honored only on the very first visit (no stored choice).
 * Keep this logic in sync with resolveInitialTheme() below.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var el = document.documentElement;
    el.classList.toggle('dark', theme === 'dark');
    el.style.colorScheme = theme;
  } catch (e) {}
})();
`;

function resolveInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

function applyTheme(theme: Theme) {
    const el = document.documentElement;
    el.classList.toggle('dark', theme === 'dark');
    el.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Start with 'dark' to match SSR markup, then reconcile on mount. The inline
    // script already set the real class so there's no visual flash.
    const [theme, setThemeState] = useState<Theme>('dark');

    useEffect(() => {
        setThemeState(resolveInitialTheme());
    }, []);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        applyTheme(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch { /* ignore */ }
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }, [theme, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        // Defensive default so charts/components don't crash if rendered
        // outside the provider (e.g. isolated tests).
        return { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };
    }
    return ctx;
}
