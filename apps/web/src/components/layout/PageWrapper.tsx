import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function PageWrapper({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen bg-[#07090E] text-white">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
