'use client';

import { useTestEditor } from '@/store/testEditor';
import { useExecutionSocket } from '@/hooks/useExecutionSocket';
import { DevicePreview } from '@/components/runner/DevicePreview';
import { ExecutionLog } from '@/components/runner/ExecutionLog';
import { StepCard } from '@/components/editor/StepCard';
import { StepAction } from '@qamind/shared';
import { ChevronLeft, Play, Square, Pause } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';

export default function TestPlayerPage({ params }: { params: { id: string } }) {
    const testCase = useTestEditor(state => state.testCase);
    const { screenshotUrl, currentStepNum, stepStatuses, logEntries, runStatus, bugReport } = useExecutionSocket(params.id);

    const [activeRunId, setActiveRunId] = useState<string | null>(null);

    const handleStart = async () => {
        if (!testCase) return;
        try {
            const response = await fetchApi('/runs', {
                method: 'POST',
                body: JSON.stringify({
                    test_case_id: testCase.id,
                    project_id: testCase.project_id,
                    target_device: 'android', // Or from a dropdown later
                    steps: testCase.steps
                })
            });
            setActiveRunId(response.run_id);
        } catch (err) {
            console.error("Failed to start run", err);
        }
    };

    const handleStop = async () => {
        if (!activeRunId) return;
        try {
            await fetchApi(`/runs/${activeRunId}/cancel`, { method: 'POST' });
        } catch (err) {
            console.error("Failed to cancel run", err);
        }
    };

    if (!testCase) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-textSecondary">
                <p>Carregando dados do teste ou redirecionando...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

            {/* Header */}
            <div className="flex-none bg-bgSecondary border-b border-white/5 p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                    <Link href={`/tests/${params.id}/edit`} className="p-2 -ml-2 text-textSecondary hover:text-white rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Live Run: {testCase.name}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-semibold uppercase tracking-wider ${runStatus === 'running' ? 'text-brand' :
                                runStatus === 'passed' ? 'text-green-400' :
                                    runStatus === 'failed' ? 'text-red-400' :
                                        'text-textSecondary'
                                }`}>
                                ● {runStatus}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Playback Controls */}
                <div className="flex bg-black/50 rounded-lg p-1 border border-white/10">
                    {(runStatus === 'pending' || runStatus === 'cancelled' || runStatus === 'passed' || runStatus === 'failed') ? (
                        <button
                            onClick={handleStart}
                            className="flex items-center gap-2 bg-brand text-white font-medium text-sm px-6 py-2 rounded-md hover:bg-brandDark transition-colors shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Start
                        </button>
                    ) : (
                        <button
                            onClick={handleStop}
                            className="flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 font-medium text-sm px-6 py-2 rounded-md transition-colors"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Main Execution View */}
            <div className="flex-1 flex overflow-hidden">

                {/* Device Stream (Center stage) */}
                <div className="flex-[3] bg-bgPrimary relative border-r border-white/5 flex flex-col">
                    <DevicePreview screenshotUrl={screenshotUrl} status={runStatus} />
                </div>

                {/* Info Panel (Right Sidebar) */}
                <div className="flex-[2] flex flex-col min-w-[320px] max-w-[500px] bg-bgSecondary">

                    {/* Top Half: Step List locked to current execution */}
                    <div className="flex-1 overflow-y-auto p-4 border-b border-white/5 custom-scrollbar bg-bgPrimary">
                        <h3 className="text-sm font-semibold text-textSecondary mb-4">Progresso ({testCase.steps.length} Steps)</h3>
                        <div className="space-y-2 opacity-90 pointer-events-none">
                            {testCase.steps.map((step, index) => {
                                // For the StepCard props
                                const status = stepStatuses[index + 1] || ((currentStepNum && (index + 1) < currentStepNum) ? 'passed' : 'pending');

                                return (
                                    <StepCard
                                        key={step.id}
                                        step={step}
                                        index={index}
                                        isSelected={currentStepNum === index + 1}
                                        status={status}
                                        onSelect={() => { }}
                                        onDelete={() => { }}
                                        onDuplicate={() => { }}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Bottom Half: Logs & Bug Report */}
                    <div className="flex-[0.8] flex flex-col p-4 bg-bgSecondary">
                        {bugReport && (
                            <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex flex-col gap-2">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                                        <span>🐛 Report Gerado pela IA</span>
                                    </div>
                                    <span className="uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                        {bugReport.severity}
                                    </span>
                                </div>
                                <h4 className="text-white text-sm font-medium leading-tight">{bugReport.title}</h4>
                                <div className="mt-2 flex items-center gap-3">
                                    <a href={bugReport.pdf_url} target="_blank" rel="noreferrer" className="text-xs bg-bgPrimary hover:bg-white/5 border border-white/10 text-white px-3 py-1.5 rounded transition-colors w-max">
                                        Baixar PDF
                                    </a>
                                </div>
                            </div>
                        )}
                        <ExecutionLog logs={logEntries} />
                    </div>

                </div>

            </div>
        </div>
    );
}
