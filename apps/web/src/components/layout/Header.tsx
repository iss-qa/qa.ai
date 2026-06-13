'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { UserMenu } from './UserMenu';
import { useShell } from './shell-context';

function titleForPath(pathname: string): string {
    if (pathname.startsWith('/dashboard/projects')) return 'Projetos';
    if (pathname.startsWith('/dashboard/profile')) return 'Meu Perfil';
    if (pathname.startsWith('/dashboard/admin')) return 'Administração';
    if (pathname.startsWith('/dashboard/tests')) return 'Testes';
    if (pathname.startsWith('/dashboard/devices')) return 'Dispositivos';
    if (pathname.startsWith('/dashboard/logs')) return 'Logs';
    if (pathname.startsWith('/dashboard/bugs')) return 'Bugs';
    if (pathname.startsWith('/dashboard/qa-journey')) return 'Jornadas';
    if (pathname.startsWith('/dashboard/reports')) return 'Relatórios';
    if (pathname.startsWith('/dashboard/settings')) return 'Configurações';
    if (pathname.startsWith('/dashboard/runs')) return 'Execuções';
    if (pathname.startsWith('/docs')) return 'Docs';
    return 'Dashboard';
}

export function Header() {
    const pathname = usePathname();
    const { setMobileSidebarOpen, headerSlot } = useShell();
    const title = titleForPath(pathname);

    return (
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between gap-3 px-4 sm:px-6 sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0 shrink-0">
                <button
                    onClick={() => setMobileSidebarOpen(true)}
                    aria-label="Abrir menu"
                    className="md:hidden -ml-1 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <div className="font-semibold text-foreground/90 text-sm tracking-wide uppercase truncate">
                    {title}
                </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {/* Controles injetados pela página corrente (useShell().setHeaderSlot) */}
                {headerSlot && (
                    <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                        {headerSlot}
                    </div>
                )}
                <ThemeToggle />
                <UserMenu />
            </div>
        </header>
    );
}
