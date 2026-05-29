'use client';

import { useTheme } from '@/components/theme/theme-provider';

/**
 * Theme-aware colors for Recharts. Recharts takes concrete color strings as
 * props (it can't read CSS variables), so we resolve them per theme here. Series
 * colors (passed/failed/severity) stay semantically stable across themes; only
 * the chrome (grid, axis, tooltip) flips.
 */
export type ChartTheme = {
    grid: string;
    axis: string;
    tooltip: {
        backgroundColor: string;
        border: string;
        borderRadius: string;
        boxShadow: string;
        color: string;
    };
    tooltipItem: { fontSize: string; color: string };
    /** Stroke applied to chart dots so they read on the card surface. */
    dotStroke: string;
    series: {
        passed: string;
        failed: string;
        running: string;
        critical: string;
        high: string;
        medium: string;
        low: string;
        brand: string;
        muted: string;
    };
};

const DARK: ChartTheme = {
    grid: '#1e2533',
    axis: '#64748b',
    tooltip: {
        backgroundColor: '#0f131c',
        border: '1px solid #1e2533',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        color: '#e6e9f0',
    },
    tooltipItem: { fontSize: '13px', color: '#e6e9f0' },
    dotStroke: '#0f131c',
    series: {
        passed: '#22c55e',
        failed: '#ef4444',
        running: '#4a90d9',
        critical: '#e74c3c',
        high: '#e67e22',
        medium: '#f0a500',
        low: '#27ae60',
        brand: '#4a90d9',
        muted: '#8b94a7',
    },
};

const LIGHT: ChartTheme = {
    grid: '#e8edf3',
    axis: '#94a3b8',
    tooltip: {
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
        color: '#0f172a',
    },
    tooltipItem: { fontSize: '13px', color: '#1e293b' },
    dotStroke: '#ffffff',
    series: {
        passed: '#16a34a',
        failed: '#dc2626',
        running: '#2f7bc7',
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#d97706',
        low: '#16a34a',
        brand: '#2f7bc7',
        muted: '#64748b',
    },
};

export function useChartTheme(): ChartTheme {
    const { theme } = useTheme();
    return theme === 'light' ? LIGHT : DARK;
}
