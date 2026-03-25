'use client';

import { usePathname } from 'next/navigation';

export function Header() {
    const pathname = usePathname();

    // Find best matching title
    let title = 'Dashboard';
    if (pathname.startsWith('/dashboard/projects')) title = 'Projetos';
    else if (pathname.startsWith('/dashboard/tests')) title = 'Testes';
    else if (pathname.startsWith('/dashboard/devices')) title = 'Dispositivos';
    else if (pathname.startsWith('/dashboard/logs')) title = 'Logs';
    else if (pathname.startsWith('/dashboard/bugs')) title = 'Bugs';
    else if (pathname.startsWith('/dashboard/runs')) title = 'Execucoes';

    return (
        <header className="h-16 border-b border-white/5 bg-[#0A0C14]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="font-semibold text-white/90 text-sm tracking-wide uppercase">
                {title}
            </div>
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-brand">
                    IS
                </div>
            </div>
        </header>
    );
}
