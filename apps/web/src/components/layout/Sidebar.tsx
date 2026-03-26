'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Folder, FlaskConical, Smartphone, Bug, BookOpen, ScrollText, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { DAEMON_URL } from '@/lib/constants';

export function Sidebar() {
    const pathname = usePathname();
    const [errorCount, setErrorCount] = useState(0);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        // Restore collapsed state
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

    const links = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/projects', label: 'Projetos', icon: Folder },
        { href: '/dashboard/tests', label: 'Testes', icon: FlaskConical },
        { href: '/dashboard/devices', label: 'Dispositivos', icon: Smartphone },
        { href: '/dashboard/bugs', label: 'Bug Tracker', icon: Bug },
        { href: '/dashboard/logs', label: 'Logs', icon: ScrollText, badge: errorCount > 0 ? errorCount : undefined },
        { href: '/docs', label: 'Docs', icon: BookOpen },
    ];

    return (
        <aside className={`bg-[#0A0C14] border-r border-white/5 text-white min-h-screen flex flex-col transition-all duration-300 hidden md:flex ${collapsed ? 'w-[60px]' : 'w-60'}`}>
            {/* Header */}
            <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} py-5 border-b border-white/5`}>
                <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-black text-sm shrink-0">Q</div>
                    {!collapsed && <span className="font-bold text-lg tracking-tight truncate">QAMind</span>}
                </Link>
                {!collapsed && (
                    <button onClick={toggleCollapse} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0">
                        <PanelLeftClose className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Collapse button when collapsed */}
            {collapsed && (
                <button onClick={toggleCollapse} className="mx-auto mt-2 p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <PanelLeftOpen className="w-4 h-4" />
                </button>
            )}

            {/* Nav */}
            <nav className={`flex flex-col gap-0.5 flex-1 mt-3 ${collapsed ? 'px-1.5' : 'px-2'}`}>
                {links.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname?.startsWith(link.href));
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            prefetch={true}
                            title={collapsed ? link.label : undefined}
                            className={`relative rounded-lg flex items-center transition-all text-sm font-medium ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} ${
                                isActive
                                ? 'bg-brand/10 text-brand'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            <Icon className="w-[18px] h-[18px] shrink-0" />
                            {!collapsed && link.label}
                            {'badge' in link && link.badge !== undefined && (
                                <span className={`bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full min-w-[18px] text-center ${collapsed ? 'absolute -top-1 -right-1 px-1 py-0' : 'ml-auto px-1.5 py-0.5'}`}>
                                    {link.badge > 99 ? '99+' : link.badge}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className={`py-4 border-t border-white/5 ${collapsed ? 'px-1.5' : 'px-3'}`}>
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                    <div className="w-8 h-8 rounded-full bg-brand/20 border border-brand/20 flex items-center justify-center text-brand font-bold text-[10px] shrink-0">IS</div>
                    {!collapsed && (
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold truncate">Isaias Admin</span>
                            <span className="text-[9px] text-brand uppercase font-bold tracking-wider">Pro</span>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
