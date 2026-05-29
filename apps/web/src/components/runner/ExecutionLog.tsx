'use client';

import { LogEntry } from '@/hooks/useExecutionSocket';
import { Terminal, Bot, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useRef } from 'react';

const ICONS = {
    info: <Info className="w-4 h-4 text-brand" />,
    success: <CheckCircle className="w-4 h-4 text-success" />,
    warning: <AlertTriangle className="w-4 h-4 text-warning" />,
    error: <XCircle className="w-4 h-4 text-danger" />,
    ai: <Bot className="w-4 h-4 text-purple-400" />,
};

const COLORS = {
    info: 'text-textSecondary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-danger',
    ai: 'text-purple-400 font-medium',
};

export function ExecutionLog({ logs }: { logs: LogEntry[] }) {
    const EndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        EndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="flex-1 overflow-y-auto bg-card p-4 font-mono text-xs rounded-lg border border-border shadow-inner">
            <div className="sticky top-0 bg-card pb-2 mb-4 border-b border-border flex items-center gap-2 text-textSecondary font-sans font-medium text-sm">
                <Terminal className="w-4 h-4" />
                Syslog Output
            </div>

            <div className="space-y-3">
                {logs.length === 0 ? (
                    <p className="text-textSecondary/50 italic py-4 text-center">Nenhum log gerado ainda...</p>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 hover:bg-accent p-1 -mx-1 rounded transition-colors break-words">
                            <span className="text-foreground/30 shrink-0">[{log.timestamp}]</span>
                            <div className="shrink-0 mt-0.5">{ICONS[log.type]}</div>
                            <span className={`flex-1 ${COLORS[log.type]}`}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
                <div ref={EndRef} />
            </div>
        </div>
    );
}
