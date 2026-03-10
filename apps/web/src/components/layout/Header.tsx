import Link from 'next/link';

export function Header() {
    return (
        <header className="h-16 border-b border-white/5 bg-[#0A0C14]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="font-semibold text-white/90 text-sm tracking-wide">
                DASHBOARD
            </div>
            <div className="flex items-center gap-4">
                <Link href="/dashboard/tests/editor" prefetch={true} className="bg-brand text-black px-4 py-2 rounded-lg font-bold text-xs hover:bg-brand/90 transition-all shadow-[0_0_15px_rgba(74,144,217,0.2)]">
                    NOVO TESTE
                </Link>
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-brand">
                    IS
                </div>
            </div>
        </header>
    );
}
