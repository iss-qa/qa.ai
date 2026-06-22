'use client';

import { CalendarClock, Smartphone } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';

// Modal bloqueante exibido quando um agendamento está prestes a disparar.
// Mostra um alerta por vez (fila `pendingAlerts`); ao clicar OK, ele sai da fila
// mas permanece no sino de notificações. Renderizado globalmente no PageWrapper.
export function ScheduleAlertModal() {
    const alert = useNotificationStore((s) => s.pendingAlerts[0] ?? null);
    const dismissAlert = useNotificationStore((s) => s.dismissAlert);
    const markRead = useNotificationStore((s) => s.markRead);

    if (!alert) return null;

    const handleOk = () => {
        // Mantém no sino, mas já como lida (o usuário acabou de vê-la).
        markRead(alert.id);
        dismissAlert(alert.id);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
                <div className="flex items-start gap-3 p-5 border-b border-border">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-5 h-5 text-brand" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-foreground">{alert.title}</h2>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {alert.message}
                        </p>
                    </div>
                </div>

                {/* Orientação destacada */}
                <div className="p-5">
                    <div className="rounded-xl bg-warning/10 border border-warning/20 p-4">
                        <div className="flex items-center gap-2 text-warning font-semibold text-sm">
                            <Smartphone className="w-4 h-4" />
                            Para o teste agendado rodar com sucesso
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-foreground/80 list-disc pl-5">
                            <li>Mantenha o dispositivo conectado.</li>
                            <li>Não execute testes manualmente nem inicie gravação até o lote terminar.</li>
                        </ul>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 pb-5">
                    <button
                        onClick={handleOk}
                        className="px-5 h-9 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 active:scale-95 transition-all"
                    >
                        OK, entendi
                    </button>
                </div>
            </div>
        </div>
    );
}
