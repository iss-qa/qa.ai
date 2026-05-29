'use client';

import { useState } from 'react';
import { StepSelectSheet } from './StepSelectSheet';
import { StepHeaderRow } from './StepHeaderRow';
import { StepColumnMap } from './StepColumnMap';
import { StepTransforms } from './StepTransforms';
import { StepPreview } from './StepPreview';
import type { WizardState } from './types';

interface Props {
    projectId: string;
}

const STEPS = [
    { n: 1, label: 'Planilha' },
    { n: 2, label: 'Cabeçalho' },
    { n: 3, label: 'Colunas' },
    { n: 4, label: 'Valores' },
    { n: 5, label: 'Confirmar' },
];

export function SheetWizard({ projectId }: Props) {
    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [state, setState] = useState<WizardState>({
        projectId,
        spreadsheetUrl: '',
        spreadsheetId: null,
        tabs: [],
        sheetName: '',
        headerRow: 1,
        dataStartRow: 2,
        preview: null,
        columnMap: {},
        defaults: {},
        transforms: {},
    });

    const update = (patch: Partial<WizardState>) => setState(s => ({ ...s, ...patch }));

    return (
        <div className="flex flex-col gap-6">
            {/* Stepper */}
            <div className="flex items-center justify-between gap-2">
                {STEPS.map((s, i) => {
                    const active = step === s.n;
                    const done = step > s.n;
                    return (
                        <div key={s.n} className="flex items-center gap-2 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                done ? 'bg-success/20 text-success border border-success/30'
                                : active ? 'bg-brand text-white border border-brand'
                                : 'bg-foreground/5 text-muted-foreground border border-border'
                            }`}>{s.n}</div>
                            <span className={`text-xs ${active ? 'text-foreground font-bold' : done ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 h-px ${done ? 'bg-success/30' : 'bg-foreground/10'}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Body */}
            <div className="bg-card border border-border rounded-2xl p-6">
                {step === 1 && (
                    <StepSelectSheet
                        state={state}
                        update={update}
                        onNext={() => setStep(2)}
                    />
                )}
                {step === 2 && (
                    <StepHeaderRow
                        state={state}
                        update={update}
                        onNext={() => setStep(3)}
                        onBack={() => setStep(1)}
                    />
                )}
                {step === 3 && (
                    <StepColumnMap
                        state={state}
                        update={update}
                        onNext={() => setStep(4)}
                        onBack={() => setStep(2)}
                    />
                )}
                {step === 4 && (
                    <StepTransforms
                        state={state}
                        update={update}
                        onNext={() => setStep(5)}
                        onBack={() => setStep(3)}
                    />
                )}
                {step === 5 && (
                    <StepPreview
                        state={state}
                        onBack={() => setStep(4)}
                    />
                )}
            </div>
        </div>
    );
}
