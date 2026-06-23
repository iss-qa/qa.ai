'use client';

// Relatório descritivo: texto pronto para colar na thread do Slack.
// Seleciona o tom e o formato, mostra o preview e copia com um clique.

import { useMemo, useState } from 'react';
import { Check, Copy, MessageSquareText } from 'lucide-react';

import type { ProjectReport, ReportPeriodDays } from '@/lib/reports/api';
import {
    buildNarrative,
    NARRATIVE_TONES,
    type NarrativeFormat,
    type NarrativeTone,
} from '@/lib/reports/narrative';

interface Props {
    report: ProjectReport;
    projectName: string;
    days: ReportPeriodDays;
}

export function NarrativeReportCard({ report, projectName, days }: Props) {
    const [tone, setTone] = useState<NarrativeTone>('alerta');
    const [format, setFormat] = useState<NarrativeFormat>('slack');
    const [copied, setCopied] = useState(false);

    const text = useMemo(
        () => buildNarrative({ projectName, days, report, tone, format }),
        [projectName, days, report, tone, format],
    );

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback p/ contextos sem Clipboard API (http, permissão negada)
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
            document.body.removeChild(ta);
        }
    };

    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden print:hidden">
            <div className="px-5 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <MessageSquareText className="w-4 h-4 text-brand" />
                        Relatório descritivo (copiar para o Slack)
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Texto pronto com base nos dados do período — copie e cole na thread.
                    </p>
                </div>
                <button
                    onClick={copy}
                    className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand/90 flex items-center gap-2 shrink-0 self-start sm:self-auto"
                >
                    {copied ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar texto</>}
                </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
                {/* Tom */}
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Tipo de relatório</span>
                    <div className="flex flex-wrap gap-2">
                        {NARRATIVE_TONES.map(t => (
                            <button
                                key={t.value}
                                onClick={() => setTone(t.value)}
                                title={t.hint}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    tone === t.value
                                        ? 'bg-brand text-white border-brand'
                                        : 'bg-surface-muted text-muted-foreground border-border hover:bg-accent'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {NARRATIVE_TONES.find(t => t.value === tone)?.hint}
                    </p>
                </div>

                {/* Formato */}
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Formato</span>
                    <div className="flex gap-2">
                        {([
                            { value: 'slack', label: 'Slack (com emojis)' },
                            { value: 'plain', label: 'Texto simples' },
                        ] as const).map(f => (
                            <button
                                key={f.value}
                                onClick={() => setFormat(f.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    format === f.value
                                        ? 'bg-brand text-white border-brand'
                                        : 'bg-surface-muted text-muted-foreground border-border hover:bg-accent'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview */}
                <div className="relative">
                    <pre className="bg-surface-muted border border-border rounded-xl p-4 text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[420px] overflow-y-auto custom-scrollbar">
                        {text}
                    </pre>
                </div>
            </div>
        </div>
    );
}
