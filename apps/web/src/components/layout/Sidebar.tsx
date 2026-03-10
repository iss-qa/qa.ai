'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Folder, FlaskConical, Smartphone, Bug } from 'lucide-react';

export function Sidebar() {
    const pathname = usePathname();

    const links = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/projects', label: 'Projetos', icon: Folder },
        { href: '/dashboard/tests', label: 'Testes', icon: FlaskConical },
        { href: '/dashboard/devices', label: 'Dispositivos', icon: Smartphone },
        { href: '/dashboard/bugs', label: 'Relatórios', icon: Bug },
    ];

    return (
        <aside className="w-64 bg-[#0A0C14] border-r border-white/5 text-white min-h-screen p-4 flex flex-col gap-4 hidden md:flex">
            <div className="flex items-center gap-2 px-2 py-4 border-b border-white/5">
                <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-black">Q</div>
                <span className="font-bold text-xl tracking-tight">QAMind</span>
            </div>
            <nav className="flex flex-col gap-1 flex-1 mt-4">
                {links.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname?.startsWith(link.href));
                    const Icon = link.icon;
                    return (
                        <Link 
                            key={link.href}
                            href={link.href} 
                            prefetch={true} 
                            className={`px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors text-sm font-medium ${
                                isActive 
                                ? 'bg-brand/10 text-brand' 
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {link.label}
                        </Link>
                    )
                })}
            </nav>
            <div className="pt-4 border-t border-white/5">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full bg-brand/20 border border-brand/20 flex items-center justify-center text-brand font-bold text-xs">IS</div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">Isaias Admin</span>
                        <span className="text-[10px] text-brand uppercase font-bold tracking-wider">Plano Pro</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
