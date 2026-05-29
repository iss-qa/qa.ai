import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SessionLogProvider } from '@/components/SessionLogProvider';
import { ShellProvider } from './shell-context';

export function PageWrapper({ children }: { children: React.ReactNode }) {
    return (
        <SessionLogProvider>
            <ShellProvider>
                <div className="flex min-h-screen bg-background text-foreground">
                    <Sidebar />
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                        <Header />
                        <main className="flex-1 overflow-y-auto custom-scrollbar">
                            {children}
                        </main>
                    </div>
                </div>
            </ShellProvider>
        </SessionLogProvider>
    );
}
