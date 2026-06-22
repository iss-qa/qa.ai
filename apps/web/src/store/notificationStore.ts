import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Centro de notificações global (sino no Header). Guarda o histórico de alertas
// (persistido em localStorage) e uma fila transitória de modais a exibir.
//
// `alertedKeys` evita re-alertar a MESMA ocorrência de um agendamento — a chave
// é `scheduleId@next_run_at`, então cada disparo programado alerta uma única vez,
// mesmo com o watcher rodando a cada minuto e mesmo após reload da página.

export type NotificationType = 'schedule_upcoming' | 'automation_due' | 'info' | 'success' | 'error';

export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    createdAt: number; // epoch ms
    read: boolean;
    // Rota a abrir ao clicar na notificação (ex.: a jornada do caso a automatizar).
    href?: string;
}

const genId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface NotificationState {
    notifications: AppNotification[];
    alertedKeys: string[];
    // Fila de modais a exibir (NÃO persistida — modal não deve sobreviver a reload).
    pendingAlerts: AppNotification[];

    // Adiciona uma notificação genérica ao sino. `modal: true` também a enfileira
    // para exibição imediata em modal bloqueante.
    addNotification: (
        n: Pick<AppNotification, 'type' | 'title' | 'message'> & { modal?: boolean }
    ) => string;

    // Alerta de agendamento prestes a executar — idempotente por `key`.
    notifyScheduleUpcoming: (args: { key: string; title: string; message: string }) => void;

    // Alerta "caso/sub-fluxo deve ser automatizado" — só no sino (sem modal),
    // idempotente por `key` (ex.: `autocase:<id>:<dias>`).
    notifyAutomationDue: (args: { key: string; title: string; message: string; href?: string }) => void;

    dismissAlert: (id: string) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    removeNotification: (id: string) => void;
    clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            notifications: [],
            alertedKeys: [],
            pendingAlerts: [],

            addNotification: ({ type, title, message, modal }) => {
                const notif: AppNotification = {
                    id: genId(),
                    type,
                    title,
                    message,
                    createdAt: Date.now(),
                    read: false,
                };
                set((s) => ({
                    notifications: [notif, ...s.notifications].slice(0, 100),
                    pendingAlerts: modal ? [...s.pendingAlerts, notif] : s.pendingAlerts,
                }));
                return notif.id;
            },

            notifyScheduleUpcoming: ({ key, title, message }) => {
                if (get().alertedKeys.includes(key)) return;
                const notif: AppNotification = {
                    id: genId(),
                    type: 'schedule_upcoming',
                    title,
                    message,
                    createdAt: Date.now(),
                    read: false,
                };
                set((s) => ({
                    notifications: [notif, ...s.notifications].slice(0, 100),
                    pendingAlerts: [...s.pendingAlerts, notif],
                    alertedKeys: [...s.alertedKeys, key].slice(-200),
                }));
            },

            notifyAutomationDue: ({ key, title, message, href }) => {
                if (get().alertedKeys.includes(key)) return;
                const notif: AppNotification = {
                    id: genId(),
                    type: 'automation_due',
                    title,
                    message,
                    href,
                    createdAt: Date.now(),
                    read: false,
                };
                set((s) => ({
                    notifications: [notif, ...s.notifications].slice(0, 100),
                    alertedKeys: [...s.alertedKeys, key].slice(-200),
                }));
            },

            dismissAlert: (id) =>
                set((s) => ({ pendingAlerts: s.pendingAlerts.filter((a) => a.id !== id) })),

            markRead: (id) =>
                set((s) => ({
                    notifications: s.notifications.map((n) =>
                        n.id === id ? { ...n, read: true } : n
                    ),
                })),

            markAllRead: () =>
                set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

            removeNotification: (id) =>
                set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

            clearAll: () => set({ notifications: [] }),
        }),
        {
            name: 'qamind-notifications',
            // pendingAlerts fica de fora — é estado de UI transitório.
            partialize: (s) => ({ notifications: s.notifications, alertedKeys: s.alertedKeys }),
        }
    )
);
