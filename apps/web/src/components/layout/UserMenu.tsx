'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useShell } from './shell-context';
import { LogOut, ShieldCheck, UserCircle2 } from 'lucide-react';

type ProfileSummary = {
    full_name: string;
    email: string;
    avatar_url: string | null;
    is_master_admin: boolean;
};

export function initialsOf(name: string, email: string): string {
    const source = name.trim() || email;
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
    const [profile, setProfile] = useState<ProfileSummary | null>(null);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const { navigate } = useShell();
    const supabase = createClient();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || cancelled) return;
            const { data } = await supabase
                .from('profiles')
                .select('full_name, email, avatar_url, is_master_admin')
                .eq('id', user.id)
                .maybeSingle();
            if (cancelled) return;
            setProfile(
                data ?? {
                    full_name: (user.user_metadata?.full_name as string) ?? '',
                    email: user.email ?? '',
                    avatar_url: null,
                    is_master_admin: false,
                }
            );
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const goTo = (href: string) => {
        setOpen(false);
        navigate(href);
    };

    const initials = profile ? initialsOf(profile.full_name, profile.email) : '··';

    return (
        <div ref={containerRef} className="relative shrink-0">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu do usuário"
                className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center text-xs font-bold text-brand hover:bg-accent transition-colors cursor-pointer overflow-hidden"
            >
                {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    initials
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-popover border border-border shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-semibold text-foreground truncate">
                            {profile?.full_name || 'Usuário'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                    </div>
                    <div className="p-1.5">
                        <button
                            onClick={() => goTo('/dashboard/profile')}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                        >
                            <UserCircle2 className="w-4 h-4 text-muted-foreground" />
                            Meu Perfil
                        </button>
                        {profile?.is_master_admin && (
                            <button
                                onClick={() => goTo('/dashboard/admin')}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                            >
                                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                                Administração
                            </button>
                        )}
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                            Sair
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
