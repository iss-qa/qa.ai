'use client';

// Ranking de fluxos com mais falhas no período — evidência visual que ancora
// o relatório descritivo (cadastro, KYC, onboarding, envio de documentos…).

import { AlertTriangle } from 'lucide-react';
import { platformLabel, type ProjectReport } from '@/lib/reports/api';

export function FlowFailuresCard({ report }: { report: ProjectReport }) {
    const flows = report.failuresByFlow;
    const maxFailed = Math.max(1, ...flows.map(f => f.failed));

    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Fluxos com mais falhas
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cenários que concentram as falhas no período — base do relatório descritivo.
                </p>
            </div>

            {flows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum fluxo com falhas no período. ✅
                </div>
            ) : (
                <div className="p-5 flex flex-col gap-3">
                    {flows.map((f, i) => {
                        const plat = platformLabel(f.platform);
                        const accent = f.failRate >= 50 ? 'bg-danger' : f.failRate >= 25 ? 'bg-warning' : 'bg-brand';
                        return (
                            <div key={`${f.flow}-${f.platform}-${i}`} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground truncate">
                                        {f.flow}
                                        {plat && <span className="text-muted-foreground font-normal"> · {plat}</span>}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                        <span className="text-danger font-bold">{f.failed}</span> {f.failed === 1 ? 'falha' : 'falhas'}
                                        {' · '}{f.failRate}%{' · '}{f.failingTests} {f.failingTests === 1 ? 'caso' : 'casos'}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${accent}`}
                                        style={{ width: `${Math.round((f.failed / maxFailed) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
