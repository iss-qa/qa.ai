'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, Check, Trash2, X, CalendarClock, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNotificationStore, type AppNotification } from '@/store/notificationStore';

function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h`;
    return new Date(ms).toLocaleDateString('pt-BR');
}

function iconFor(type: AppNotification['type']) {
    switch (type) {
        case 'schedule_upcoming': return <CalendarClock className="w-4 h-4 text-brand" />;
        case 'automation_due': return <BellRing className="w-4 h-4 text-warning" />;
        case 'success': return <CheckCircle2 className="w-4 h-4 text-success" />;
        case 'error': return <AlertCircle className="w-4 h-4 text-danger" />;
        default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
}

export function NotificationBell() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    // Evita hydration mismatch: o store é reidratado do localStorage só no
    // cliente, então no 1º render (SSR) mostramos o sino "vazio".
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const ref = useRef<HTMLDivElement>(null);

    const notifications = useNotificationStore((s) => s.notifications);
    const markAllRead = useNotificationStore((s) => s.markAllRead);
    const markRead = useNotificationStore((s) => s.markRead);
    const removeNotification = useNotificationStore((s) => s.removeNotification);
    const clearAll = useNotificationStore((s) => s.clearAll);

    // Clicar numa notificação com rota: marca lida, fecha o painel e navega.
    const handleOpenNotification = (n: AppNotification) => {
        if (!n.href) return;
        markRead(n.id);
        setOpen(false);
        router.push(n.href);
    };

    const unread = mounted ? notifications.filter((n) => !n.read).length : 0;

    // Fecha ao clicar fora.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && unread > 0) markAllRead();
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={handleToggle}
                aria-label="Notificações"
                title="Notificações"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer"
            >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 h-11 border-b border-border">
                        <span className="text-sm font-bold text-foreground">Notificações</span>
                        <div className="flex items-center gap-1">
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    title="Limpar todas"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                title="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                                <Check className="w-7 h-7 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`group flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0 ${n.read ? '' : 'bg-brand/5'} ${n.href ? 'cursor-pointer hover:bg-accent' : ''}`}
                                    onClick={n.href ? () => handleOpenNotification(n) : undefined}
                                    role={n.href ? 'button' : undefined}
                                >
                                    <div className="mt-0.5 shrink-0">{iconFor(n.type)}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground truncate">{n.title}</p>
                                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                                            {timeAgo(n.createdAt)}{n.href ? ' · clique para abrir' : ''}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-danger hover:bg-accent transition-all shrink-0"
                                        title="Remover"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
