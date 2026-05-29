'use client';

import { useEffect, useState } from 'react';
import {
    CheckCircle2,
    ExternalLink,
    FileSpreadsheet,
    Loader2,
    Plug,
    RefreshCcw,
    Trash2,
    Workflow,
    XCircle,
} from 'lucide-react';

import { GoogleSheetsIntegrationModal } from '@/components/settings/GoogleSheetsIntegrationModal';
import { JiraIntegrationModal } from '@/components/settings/JiraIntegrationModal';
import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';
import {
    deleteIntegration,
    listIntegrations,
    testIntegration,
} from '@/lib/integrations/api';
import type {
    GoogleSheetsMetadata,
    IntegrationProvider,
    IntegrationRecord,
    IntegrationTestResult,
    JiraMetadata,
} from '@/types/integrations';

export default function IntegrationsSettingsPage() {
    const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [editingGoogle, setEditingGoogle] = useState(false);
    const [editingJira, setEditingJira] = useState(false);

    const [deleting, setDeleting] = useState<IntegrationProvider | null>(null);
    const [testing, setTesting] = useState<IntegrationProvider | null>(null);
    const [testResult, setTestResult] = useState<Record<string, IntegrationTestResult>>({});

    const reload = async () => {
        setLoadError(null);
        try {
            const list = await listIntegrations();
            setIntegrations(list);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); }, []);

    const google = integrations.find(i => i.provider === 'google_sheets') || null;
    const jira = integrations.find(i => i.provider === 'jira') || null;

    const handleTest = async (provider: IntegrationProvider) => {
        setTesting(provider);
        setTestResult(prev => ({ ...prev }));
        try {
            const result = await testIntegration(provider);
            setTestResult(prev => ({ ...prev, [provider]: result }));
            await reload();
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            setTestResult(prev => ({ ...prev, [provider]: { ok: false, detail } }));
        } finally {
            setTesting(null);
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        const p = deleting;
        setDeleting(null);
        try {
            await deleteIntegration(p);
            setIntegrations(prev => prev.filter(i => i.provider !== p));
        } catch (e) {
            alert('Erro ao remover: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="p-8 max-w-[1100px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Plug className="w-6 h-6 text-brand" />
                    Integrações
                </h1>
                <p className="text-textSecondary mt-1">
                    Configure as credenciais que o QAMind usa para sincronizar com ferramentas externas.
                    As credenciais são criptografadas (AES-256-GCM) antes de serem armazenadas.
                </p>
            </div>

            {loadError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">
                    Falha ao carregar integrações: {loadError}
                    <div className="text-[11px] text-slate-400 mt-1">
                        Verifique se o backend Fastify está rodando ({process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}) e se a migration <code className="font-mono">supabase_migration_organizations.sql</code> foi aplicada.
                    </div>
                </div>
            )}

            {loading && !loadError && (
                <div className="bg-white rounded-2xl p-8 text-center text-textSecondary text-sm border border-black/5">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando integrações…
                </div>
            )}

            {!loading && !loadError && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <IntegrationCard
                        icon={<FileSpreadsheet className="w-5 h-5 text-green-500" />}
                        title="Google Sheets"
                        description="Sincroniza planilhas de casos de teste para a Jornada do QA."
                        record={google}
                        metadataView={google ? renderGoogleMetadata(google.metadata as GoogleSheetsMetadata) : null}
                        testResult={testResult['google_sheets']}
                        onConfigure={() => setEditingGoogle(true)}
                        onTest={() => handleTest('google_sheets')}
                        onDelete={() => setDeleting('google_sheets')}
                        isTesting={testing === 'google_sheets'}
                        docsHref="https://console.cloud.google.com/iam-admin/serviceaccounts"
                    />

                    <IntegrationCard
                        icon={<Workflow className="w-5 h-5 text-blue-500" />}
                        title="Jira (Atlassian)"
                        description="Read-only: puxa bugs e tasks dos projetos Jira vinculados às Jornadas."
                        record={jira}
                        metadataView={jira ? renderJiraMetadata(jira.metadata as JiraMetadata) : null}
                        testResult={testResult['jira']}
                        onConfigure={() => setEditingJira(true)}
                        onTest={() => handleTest('jira')}
                        onDelete={() => setDeleting('jira')}
                        isTesting={testing === 'jira'}
                        docsHref="https://id.atlassian.com/manage-profile/security/api-tokens"
                    />
                </div>
            )}

            {editingGoogle && (
                <GoogleSheetsIntegrationModal
                    onClose={() => setEditingGoogle(false)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertIn(prev, rec));
                        setEditingGoogle(false);
                    }}
                />
            )}

            {editingJira && (
                <JiraIntegrationModal
                    initial={jira ? { host: (jira.metadata as JiraMetadata).host, email: (jira.metadata as JiraMetadata).email } : undefined}
                    onClose={() => setEditingJira(false)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertIn(prev, rec));
                        setEditingJira(false);
                    }}
                />
            )}

            {deleting && (
                <DeleteConfirmModal
                    title="Remover integração?"
                    message={`As credenciais de ${deleting === 'google_sheets' ? 'Google Sheets' : 'Jira'} serão apagadas. Syncs e dashboards que dependem dessa integração vão parar até você reconfigurar.`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={handleDelete}
                    confirmLabel="Remover"
                />
            )}
        </div>
    );
}

function upsertIn(list: IntegrationRecord[], rec: IntegrationRecord): IntegrationRecord[] {
    const idx = list.findIndex(i => i.provider === rec.provider);
    if (idx >= 0) {
        const next = [...list]; next[idx] = rec; return next;
    }
    return [...list, rec];
}

function renderGoogleMetadata(m: GoogleSheetsMetadata) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            {m.client_email && (
                <div><span className="text-slate-500">Service account:</span> <span className="font-mono text-slate-300 break-all">{m.client_email}</span></div>
            )}
            {m.project_id && (
                <div><span className="text-slate-500">Projeto GCP:</span> <span className="font-mono text-slate-300">{m.project_id}</span></div>
            )}
        </div>
    );
}

function renderJiraMetadata(m: JiraMetadata) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            {m.host && (<div><span className="text-slate-500">Host:</span> <span className="font-mono text-slate-300">{m.host}</span></div>)}
            {m.email && (<div><span className="text-slate-500">E-mail:</span> <span className="text-slate-300">{m.email}</span></div>)}
        </div>
    );
}

// ============================================================
// IntegrationCard
// ============================================================

interface CardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    record: IntegrationRecord | null;
    metadataView: React.ReactNode;
    testResult?: IntegrationTestResult;
    onConfigure: () => void;
    onTest: () => void;
    onDelete: () => void;
    isTesting: boolean;
    docsHref?: string;
}

function IntegrationCard({
    icon, title, description, record, metadataView, testResult,
    onConfigure, onTest, onDelete, isTesting, docsHref,
}: CardProps) {
    const isConfigured = Boolean(record);
    const lastStatus = record?.last_test_status;
    const lastTested = record?.last_tested_at;

    return (
        <div className="bg-white rounded-2xl border border-black/5 p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900">{title}</h3>
                        <p className="text-xs text-textSecondary max-w-md">{description}</p>
                    </div>
                </div>
                {docsHref && (
                    <a href={docsHref} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-slate-400 hover:text-brand inline-flex items-center gap-1">
                        Docs <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            <div className="border-t border-black/5 pt-4">
                {isConfigured ? (
                    <div className="flex flex-col gap-3">
                        <StatusPill status={lastStatus} lastTested={lastTested} />
                        {metadataView}
                        {testResult && (
                            <div className={`text-xs rounded-md px-3 py-2 ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                {testResult.detail}
                            </div>
                        )}
                        {record?.last_test_error && !testResult && (
                            <div className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">
                                Último erro: {record.last_test_error}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Nenhuma credencial configurada.</p>
                )}
            </div>

            <div className="flex items-center gap-2 pt-2">
                <button
                    onClick={onConfigure}
                    className="bg-brand text-black px-4 py-2 rounded-lg text-xs font-bold hover:bg-brand/90"
                >
                    {isConfigured ? 'Atualizar credenciais' : 'Configurar'}
                </button>
                {isConfigured && (
                    <>
                        <button
                            onClick={onTest}
                            disabled={isTesting}
                            className="border border-black/10 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                        >
                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                            Testar conexão
                        </button>
                        <button
                            onClick={onDelete}
                            className="ml-auto text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50"
                            title="Remover integração"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function StatusPill({ status, lastTested }: { status?: 'ok' | 'error' | null; lastTested?: string | null }) {
    const tested = lastTested ? new Date(lastTested) : null;
    const testedLabel = tested ? tested.toLocaleString('pt-BR') : 'nunca testada';
    if (status === 'ok') {
        return (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-green-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectada · <span className="font-normal text-slate-500">testada em {testedLabel}</span>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                <XCircle className="w-3.5 h-3.5" /> Erro no último teste · <span className="font-normal text-slate-500">{testedLabel}</span>
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600">
            <RefreshCcw className="w-3.5 h-3.5" /> Configurada · ainda não testada
        </div>
    );
}
