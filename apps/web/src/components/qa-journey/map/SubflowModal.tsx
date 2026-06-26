'use client';

// Modal central mostrado quando o usuário clica em um sub-fluxo no mapa.
// Resumo executivo + lista de casos (filhos) já visível — sem cobrir o mapa
// nem os filtros, como acontecia com o drawer lateral.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Clapperboard, FileCode2, FileText, GitBranch, Link2, X } from 'lucide-react';
import { AUTOMATION_STATUS_OPTIONS, PRIORITY_OPTIONS, RUN_STATUS_DISPLAY, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import { HtmlDocModal } from './HtmlDocModal';
import { ImageLightbox } from './ImageLightbox';
import { formatExternalId } from '@/components/qa-journey/columns/helpers';
import type { QAJourney, QAJourneyCase, QAJourneySubflow, VideoStep } from '@/types/qa-journey';

interface SubflowModalProps {
    journey: QAJourney;
    subflow: QAJourneySubflow;
    cases: QAJourneyCase[];
    onSelectCase: (caseId: string) => void;
    onClose: () => void;
}

export function SubflowModal({ journey, subflow, cases, onSelectCase, onClose }: SubflowModalProps) {
    const statusOpt = AUTOMATION_STATUS_OPTIONS.find(o => o.value === subflow.automation_status);
    const [docOpen, setDocOpen] = useState(false);
    const [zoom, setZoom] = useState<{ step: VideoStep; index: number } | null>(null);
    // Storyboard de vídeo: telas em sequência (passo a passo) — tem prioridade
    // sobre os outros modos de exibição.
    const steps = (subflow.video_steps || []).slice().sort((a, b) => a.order - b.order);
    const isVideo = steps.length > 0;
    // Sub-fluxo de documento (HTML anexado) não tem comportamento de casos de
    // teste: escondemos automação / total de casos / lista de casos e
    // destacamos o documento.
    const isDoc = !isVideo && Boolean(subflow.html_doc);

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            >
                <div className="p-5 border-b border-border flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                            <GitBranch className="w-3 h-3" /> Sub-fluxo de {journey.title}
                        </div>
                        <h2 className="text-lg font-bold text-foreground mt-1">{subflow.title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent shrink-0"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
                    {subflow.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{subflow.description}</p>
                    )}

                    {isVideo ? (
                        // Modo storyboard: passo a passo das telas do vídeo.
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <Clapperboard className="w-4 h-4 text-brand" />
                                <h3 className="text-sm font-bold text-foreground">
                                    Storyboard ({steps.length} {steps.length === 1 ? 'tela' : 'telas'})
                                </h3>
                            </div>
                            <ol className="flex flex-col gap-3">
                                {steps.map((step, i) => (
                                    <li key={step.id} className="flex gap-3 items-start">
                                        <button
                                            type="button"
                                            onClick={() => setZoom({ step, index: i + 1 })}
                                            className="relative shrink-0 rounded-lg border border-border overflow-hidden bg-foreground/5 hover:border-brand/50 transition-colors"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={step.image_url} alt={`Tela ${i + 1}`} className="w-24 h-32 object-contain" />
                                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-popover/90 border border-border text-[9px] font-bold text-foreground">
                                                {i + 1}
                                            </span>
                                        </button>
                                        <p className="text-xs text-foreground leading-relaxed flex-1 pt-1">
                                            {step.caption || <span className="text-muted-foreground/60 italic">Sem descrição</span>}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : isDoc ? (
                        // Modo documento: card de destaque que abre o HTML.
                        <button
                            type="button"
                            onClick={() => setDocOpen(true)}
                            className="flex items-center justify-between gap-3 w-full bg-brand/5 border border-brand/20 rounded-xl p-4 text-left hover:border-brand/50 transition-colors group"
                        >
                            <span className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                                    <FileCode2 className="w-4 h-4 text-brand" />
                                </span>
                                <span className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold text-foreground">Documento HTML</span>
                                    <span className="text-[11px] text-muted-foreground">
                                        Especificação deste sub-fluxo em documento.
                                    </span>
                                </span>
                            </span>
                            <span className="text-xs font-semibold text-brand group-hover:underline flex items-center gap-1 shrink-0">
                                Ver documento <ChevronRight className="w-4 h-4" />
                            </span>
                        </button>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Stat
                                    label="Automação"
                                    value={statusOpt?.label || subflow.automation_status}
                                    color={statusOpt?.color}
                                />
                                <Stat
                                    label="Total de casos"
                                    value={String(cases.length)}
                                />
                            </div>

                            {subflow.test_case_id && (
                                <div className="bg-brand/5 border border-brand/20 rounded-lg p-3 flex items-center gap-2 text-xs text-brand">
                                    <Link2 className="w-3.5 h-3.5" />
                                    Vinculado a um teste Maestro
                                </div>
                            )}

                            {/* Casos (filhos) — visíveis de cara */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-brand" />
                                    <h3 className="text-sm font-bold text-foreground">
                                        Casos de teste ({cases.length})
                                    </h3>
                                </div>

                                {cases.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">
                                        Nenhum caso cadastrado neste sub-fluxo.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-foreground/[0.02]">
                                        {cases.map((c, i) => (
                                            <motion.li
                                                key={c.id}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.18 }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectCase(c.id)}
                                                    className="w-full px-4 py-3 flex flex-col gap-1.5 text-left hover:bg-accent transition-colors group"
                                                >
                                                    <CaseRowContent case_={c} />
                                                </button>
                                            </motion.li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>

            {docOpen && subflow.html_doc && (
                <HtmlDocModal
                    title={subflow.title}
                    subtitle={`Documento do sub-fluxo · ${journey.title}`}
                    html={subflow.html_doc}
                    accentColor={journey.color || undefined}
                    onClose={() => setDocOpen(false)}
                />
            )}

            {zoom && (
                <ImageLightbox step={zoom.step} index={zoom.index} onClose={() => setZoom(null)} />
            )}
        </div>
    );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div className="bg-foreground/[0.02] border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
            <div className={`text-sm font-bold mt-0.5 ${color || 'text-foreground'}`}>
                {color ? (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${color}`}>
                        {value}
                    </span>
                ) : value}
            </div>
        </div>
    );
}

function CaseRowContent({ case_ }: { case_: QAJourneyCase }) {
    const prio = PRIORITY_OPTIONS.find(o => o.value === case_.priority);
    const run = case_.last_run_status ? RUN_STATUS_OPTIONS.find(o => o.value === case_.last_run_status) : null;
    return (
        <>
            <div className="flex items-center gap-2">
                {case_.external_id && (
                    <span className="text-[10px] font-mono text-muted-foreground" title={case_.external_id}>{formatExternalId(case_.external_id)}</span>
                )}
                <span className="text-xs font-bold text-foreground flex-1 truncate">{case_.title}</span>
                {case_.platform && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-brand/15 text-brand">
                        {case_.platform}
                    </span>
                )}
                {prio && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${prio.color}`}>
                        {prio.label}
                    </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-brand shrink-0 transition-colors" />
            </div>
            {case_.steps_summary && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">{case_.steps_summary}</p>
            )}
            {run && (
                <span className={`self-start inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${run.color}`}>
                    {RUN_STATUS_DISPLAY[run.value]}
                </span>
            )}
        </>
    );
}
