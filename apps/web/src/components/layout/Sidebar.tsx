'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import {
    LayoutDashboard, Folder, FlaskConical, Smartphone, Bug, BookOpen, ScrollText,
    FileBarChart, Map, Settings, PanelLeftClose, PanelLeftOpen, Loader2, X,
} from 'lucide-react';
import { DAEMON_URL } from '@/lib/constants';
import { useShell } from './shell-context';

type NavLink = {
    href: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    badge?: number;
};

export function Sidebar() {
    const pathname = usePathname();
    const { navigate, pendingHref, mobileSidebarOpen, setMobileSidebarOpen } = useShell();
    const [errorCount, setErrorCount] = useState(0);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved === 'true') setCollapsed(true);
    }, []);

    const toggleCollapse = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('sidebar-collapsed', String(next));
    };

    useEffect(() => {
        const fetchErrorCount = async () => {
            try {
                const res = await fetch(`${DAEMON_URL}/api/logs/error-count`);
                if (res.ok) {
                    const data = await res.json();
                    setErrorCount(data.count || 0);
                }
            } catch { /* ignore */ }
        };
        fetchErrorCount();
        const interval = setInterval(fetchErrorCount, 30000);
        return () => clearInterval(interval);
    }, []);

    const links: NavLink[] = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/projects', label: 'Projetos', icon: Folder },
        { href: '/dashboard/tests', label: 'Testes', icon: FlaskConical },
        { href: '/dashboard/bugs', label: 'Bug Tracker', icon: Bug },
        { href: '/dashboard/qa-journey', label: 'Jornadas', icon: Map },
        { href: '/dashboard/reports', label: 'Relatórios', icon: FileBarChart },
        { href: '/dashboard/devices', label: 'Dispositivos', icon: Smartphone },
        { href: '/dashboard/logs', label: 'Logs', icon: ScrollText, badge: errorCount > 0 ? errorCount : undefined },
        { href: '/dashboard/settings', label: 'Configurações', icon: Settings },
        { href: '/docs', label: 'Docs', icon: BookOpen },
    ];

    // Optimistic active route: prefer the pending target so the highlight moves
    // on click, before the new page finishes rendering.
    const activeHref = pendingHref ?? pathname;
    const isLinkActive = (href: string) =>
        activeHref === href || (href !== '/dashboard' && activeHref?.startsWith(href));

    const renderNav = (isMobile: boolean) => {
        const isCollapsed = collapsed && !isMobile;
        return (
            <>
                {/* Header */}
                <div className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-5 border-b border-sidebar-border`}>
                    <Link
                        href="/dashboard"
                        onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}
                        className="flex items-center gap-2.5 min-w-0"
                    >
                        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white text-sm shrink-0">Q</div>
                        {!isCollapsed && <span className="font-bold text-lg tracking-tight truncate">QAMind</span>}
                    </Link>
                    {isMobile ? (
                        <button onClick={() => setMobileSidebarOpen(false)} aria-label="Fechar menu" className="p-1.5 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors shrink-0 cursor-pointer">
                            <X className="w-4 h-4" />
                        </button>
                    ) : !isCollapsed && (
                        <button onClick={toggleCollapse} aria-label="Recolher menu" className="p-1.5 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors shrink-0 cursor-pointer">
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {isCollapsed && (
                    <button onClick={toggleCollapse} aria-label="Expandir menu" className="mx-auto mt-2 p-1.5 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors cursor-pointer">
                        <PanelLeftOpen className="w-4 h-4" />
                    </button>
                )}

                {/* Nav */}
                <nav className={`flex flex-col gap-0.5 flex-1 mt-3 overflow-y-auto custom-scrollbar ${isCollapsed ? 'px-1.5' : 'px-2'}`}>
                    {links.map((link) => {
                        const isActive = isLinkActive(link.href);
                        const isPending = pendingHref === link.href;
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                prefetch
                                onClick={(e) => { e.preventDefault(); navigate(link.href); }}
                                title={isCollapsed ? link.label : undefined}
                                aria-current={isActive ? 'page' : undefined}
                                className={`relative rounded-lg flex items-center transition-colors text-sm font-medium cursor-pointer ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} ${
                                    isActive
                                        ? 'bg-brand/10 text-brand'
                                        : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                }`}
                            >
                                {/* Active rail accent for instant visual anchor */}
                                {isActive && !isCollapsed && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-brand" />
                                )}
                                {isPending
                                    ? <Loader2 className="w-[18px] h-[18px] shrink-0 animate-spin" />
                                    : <Icon className="w-[18px] h-[18px] shrink-0" />}
                                {!isCollapsed && link.label}
                                {link.badge !== undefined && (
                                    <span className={`bg-danger/20 text-danger text-[10px] font-bold rounded-full min-w-[18px] text-center ${isCollapsed ? 'absolute -top-1 -right-1 px-1 py-0' : 'ml-auto px-1.5 py-0.5'}`}>
                                        {link.badge > 99 ? '99+' : link.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className={`py-4 border-t border-sidebar-border ${isCollapsed ? 'px-1.5' : 'px-3'}`}>
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                        <div className="w-8 h-8 rounded-full bg-brand/20 border border-brand/20 flex items-center justify-center text-brand font-bold text-[10px] shrink-0">IS</div>
                        {!isCollapsed && (
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold truncate">Isaias Admin</span>
                                <span className="text-[9px] text-brand uppercase font-bold tracking-wider">Pro</span>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    return (
        <>
            {/* Desktop sidebar */}
            <aside className={`bg-sidebar text-sidebar-foreground border-r border-sidebar-border min-h-screen flex-col transition-all duration-300 hidden md:flex ${collapsed ? 'w-[60px]' : 'w-60'}`}>
                {renderNav(false)}
            </aside>

            {/* Mobile drawer + overlay */}
            <div className={`md:hidden ${mobileSidebarOpen ? '' : 'pointer-events-none'}`}>
                <div
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${mobileSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden
                />
                <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    {renderNav(true)}
                </aside>
            </div>
        </>
    );
}
