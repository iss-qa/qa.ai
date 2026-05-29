'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, FileText, GitBranch, Link2, X } from 'lucide-react';
import { AUTOMATION_STATUS_OPTIONS, PRIORITY_OPTIONS, RUN_STATUS_OPTIONS } from '@/lib/qa-journey/constants';
import type { QAJourney, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

interface SubflowDrawerProps {
    journey: QAJourney;
    subflow: QAJourneySubflow;
    cases: QAJourneyCase[];
    onClose: () => void;
}

// Drawer lateral mostrado quando o usuario clica em um sub-fluxo no mapa.
// Niveis 3 e 4 do prompt: resumo executivo + tabela de casos (collapsible).
export function SubflowDrawer({ journey, subflow, cases, onClose }: SubflowDrawerProps) {
    const [showCases, setShowCases] = useState(false);
    const statusOpt = AUTOMATION_STATUS_OPTIONS.find(o => o.value === subflow.automation_status);

    return (
        <motion.div
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-card border-l border-border shadow-2xl z-40 flex flex-col"
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

                <div className="bg-foreground/[0.02] border border-border rounded-xl overflow-hidden">
                    <button
                        onClick={() => setShowCases(s => !s)}
                        className="w-full px-4 py-3 flex items-center justify-between text-sm font-bold text-foreground hover:bg-accent"
                    >
                        <span className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-brand" />
                            Especificações completas ({cases.length})
                        </span>
                        {showCases ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    <AnimatePresence initial={false}>
                        {showCases && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="border-t border-border overflow-hidden"
                            >
                                {cases.length === 0 ? (
                                    <div className="p-4 text-xs text-muted-foreground text-center">
                                        Nenhum caso cadastrado neste sub-fluxo.
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-border">
                                        {cases.map((c, i) => (
                                            <motion.li
                                                key={c.id}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.04, duration: 0.18 }}
                                                className="px-4 py-3 flex flex-col gap-1.5"
                                            >
                                                <CaseRowContent case_={c} />
                                            </motion.li>
                                        ))}
                                    </ul>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
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
                    <span className="text-[10px] font-mono text-muted-foreground">{case_.external_id}</span>
                )}
                <span className="text-xs font-bold text-foreground flex-1 truncate">{case_.title}</span>
                {prio && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${prio.color}`}>
                        {prio.label}
                    </span>
                )}
            </div>
            {case_.steps_summary && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">{case_.steps_summary}</p>
            )}
            {run && (
                <span className={`self-start inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${run.color}`}>
                    {run.label}
                </span>
            )}
        </>
    );
}
