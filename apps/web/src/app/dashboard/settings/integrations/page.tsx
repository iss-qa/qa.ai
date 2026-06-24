'use client';

import { useEffect, useState } from 'react';
import {
    CheckCircle2,
    ExternalLink,
    FileSpreadsheet,
    Github,
    Loader2,
    MessageSquare,
    Plug,
    Plus,
    Power,
    RefreshCcw,
    Trash2,
    Workflow,
    XCircle,
} from 'lucide-react';

import { GoogleSheetsIntegrationModal } from '@/components/settings/GoogleSheetsIntegrationModal';
import { JiraIntegrationModal } from '@/components/settings/JiraIntegrationModal';
import { SlackIntegrationModal } from '@/components/settings/SlackIntegrationModal';
import { GitHubIntegrationModal } from '@/components/settings/GitHubIntegrationModal';
import { DeleteConfirmModal } from '@/components/qa-journey/DeleteConfirmModal';
import {
    deleteIntegration,
    deleteIntegrationById,
    listIntegrations,
    testIntegration,
    testIntegrationById,
    toggleIntegrationActive,
} from '@/lib/integrations/api';
import type {
    GoogleSheetsMetadata,
    GitHubMetadata,
    IntegrationProvider,
    IntegrationRecord,
    IntegrationTestResult,
    JiraMetadata,
    SlackMetadata,
} from '@/types/integrations';

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
    google_sheets: 'Google Sheets',
    jira: 'Jira',
    slack: 'Slack',
    github: 'GitHub',
};

export default function IntegrationsSettingsPage() {
    const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [editingGoogle, setEditingGoogle] = useState(false);
    const [editingJira, setEditingJira] = useState(false);
    const [editingSlack, setEditingSlack] = useState(false);

    // GitHub: null = modal fechado, '' = nova conta, 'Pessoal' = editando conta existente
    const [editingGitHubName, setEditingGitHubName] = useState<string | null>(null);

    const [deleting, setDeleting] = useState<IntegrationProvider | null>(null);
    const [deletingGitHubId, setDeletingGitHubId] = useState<string | null>(null);
    const [testing, setTesting] = useState<string | null>(null); // provider ou integration id
    const [toggling, setToggling] = useState<string | null>(null); // integration id
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
    const slack = integrations.find(i => i.provider === 'slack') || null;
    const githubs = integrations.filter(i => i.provider === 'github');

    const handleTest = async (provider: IntegrationProvider) => {
        setTesting(provider);
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

    const handleTestGitHub = async (id: string) => {
        setTesting(id);
        try {
            const result = await testIntegrationById(id);
            setTestResult(prev => ({ ...prev, [id]: result }));
            await reload();
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            setTestResult(prev => ({ ...prev, [id]: { ok: false, detail } }));
        } finally {
            setTesting(null);
        }
    };

    const handleToggleActive = async (id: string, isActive: boolean) => {
        setToggling(id);
        try {
            await toggleIntegrationActive(id, isActive);
            setIntegrations(prev => prev.map(i => i.id === id ? { ...i, is_active: isActive } : i));
        } catch (e) {
            alert((isActive ? 'Erro ao reconectar: ' : 'Erro ao desconectar: ') + (e instanceof Error ? e.message : String(e)));
        } finally {
            setToggling(null);
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

    const handleDeleteGitHub = async () => {
        if (!deletingGitHubId) return;
        const id = deletingGitHubId;
        setDeletingGitHubId(null);
        try {
            await deleteIntegrationById(id);
            setIntegrations(prev => prev.filter(i => i.id !== id));
        } catch (e) {
            alert('Erro ao remover: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Plug className="w-6 h-6 text-brand" />
                    Integrações
                </h1>
                <p className="text-textSecondary mt-1">
                    Configure as credenciais que o QAMind usa para sincronizar com ferramentas externas.
                    As credenciais são criptografadas (AES-256-GCM) antes de serem armazenadas.
                </p>
            </div>

            {loadError && (
                <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 text-sm text-danger">
                    Falha ao carregar integrações: {loadError}
                    <div className="text-[11px] text-muted-foreground mt-1">
                        Verifique se o backend Fastify está rodando ({process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}) e se a migration <code className="font-mono">supabase/migrations/007_organizations.sql</code> foi aplicada.
                    </div>
                </div>
            )}

            {loading && !loadError && (
                <div className="bg-card rounded-2xl p-8 text-center text-textSecondary text-sm border border-border">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando integrações…
                </div>
            )}

            {!loading && !loadError && (
                <div className="flex flex-col gap-6">
                    {/* Providers de conta única */}
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

                        <IntegrationCard
                            icon={<MessageSquare className="w-5 h-5 text-emerald-500" />}
                            title="Slack"
                            description="Envia notificações do QAMind (syncs, falhas, relatórios) para um canal via Incoming Webhook."
                            record={slack}
                            metadataView={slack ? renderSlackMetadata(slack.metadata as SlackMetadata) : null}
                            testResult={testResult['slack']}
                            onConfigure={() => setEditingSlack(true)}
                            onTest={() => handleTest('slack')}
                            onDelete={() => setDeleting('slack')}
                            isTesting={testing === 'slack'}
                            docsHref="https://api.slack.com/messaging/webhooks"
                        />
                    </div>

                    {/* GitHub — multi-conta */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-surface-muted flex items-center justify-center">
                                    <Github className="w-5 h-5 text-foreground" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-foreground">GitHub</h2>
                                    <p className="text-xs text-textSecondary">
                                        Dispara testes Playwright (projetos Web) via GitHub Actions e lista os specs do repositório.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
                                   className="text-[10px] text-muted-foreground hover:text-brand inline-flex items-center gap-1">
                                    Docs <ExternalLink className="w-3 h-3" />
                                </a>
                                <button
                                    onClick={() => setEditingGitHubName('')}
                                    className="inline-flex items-center gap-1.5 bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Adicionar conta
                                </button>
                            </div>
                        </div>

                        {githubs.length === 0 ? (
                            <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
                                Nenhuma conta GitHub conectada. Clique em <strong>Adicionar conta</strong> para começar.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {githubs.map(gh => (
                                    <GitHubAccountCard
                                        key={gh.id}
                                        record={gh}
                                        testResult={testResult[gh.id]}
                                        isTesting={testing === gh.id}
                                        isToggling={toggling === gh.id}
                                        onUpdateToken={() => setEditingGitHubName(gh.name)}
                                        onTest={() => handleTestGitHub(gh.id)}
                                        onToggleActive={(isActive) => handleToggleActive(gh.id, isActive)}
                                        onDelete={() => setDeletingGitHubId(gh.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modals — providers de conta única */}
            {editingGoogle && (
                <GoogleSheetsIntegrationModal
                    onClose={() => setEditingGoogle(false)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertById(prev, rec));
                        setEditingGoogle(false);
                    }}
                />
            )}

            {editingJira && (
                <JiraIntegrationModal
                    initial={jira ? { host: (jira.metadata as JiraMetadata).host, email: (jira.metadata as JiraMetadata).email } : undefined}
                    onClose={() => setEditingJira(false)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertById(prev, rec));
                        setEditingJira(false);
                    }}
                />
            )}

            {editingSlack && (
                <SlackIntegrationModal
                    initial={slack ? { default_channel: (slack.metadata as SlackMetadata).default_channel } : undefined}
                    onClose={() => setEditingSlack(false)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertById(prev, rec));
                        setEditingSlack(false);
                    }}
                />
            )}

            {/* Modal GitHub multi-conta */}
            {editingGitHubName !== null && (
                <GitHubIntegrationModal
                    initialName={editingGitHubName === '' ? undefined : editingGitHubName}
                    onClose={() => setEditingGitHubName(null)}
                    onSaved={(rec) => {
                        setIntegrations(prev => upsertById(prev, rec));
                        setEditingGitHubName(null);
                    }}
                />
            )}

            {/* Confirm modals */}
            {deleting && (
                <DeleteConfirmModal
                    title="Remover integração?"
                    message={`As credenciais de ${PROVIDER_LABELS[deleting]} serão apagadas. Syncs e dashboards que dependem dessa integração vão parar até você reconfigurar.`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={handleDelete}
                    confirmLabel="Remover"
                />
            )}

            {deletingGitHubId && (
                <DeleteConfirmModal
                    title="Remover conta GitHub?"
                    message="As credenciais dessa conta GitHub serão apagadas. Projetos Web que usam essa conta precisarão ser reconfigurados."
                    onCancel={() => setDeletingGitHubId(null)}
                    onConfirm={handleDeleteGitHub}
                    confirmLabel="Remover"
                />
            )}
        </div>
    );
}

function upsertById(list: IntegrationRecord[], rec: IntegrationRecord): IntegrationRecord[] {
    const idx = list.findIndex(i => i.id === rec.id);
    if (idx >= 0) {
        const next = [...list]; next[idx] = rec; return next;
    }
    return [...list, rec];
}

function renderGoogleMetadata(m: GoogleSheetsMetadata) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            {m.client_email && (
                <div><span className="text-muted-foreground">Service account:</span> <span className="font-mono text-foreground break-all">{m.client_email}</span></div>
            )}
            {m.project_id && (
                <div><span className="text-muted-foreground">Projeto GCP:</span> <span className="font-mono text-foreground">{m.project_id}</span></div>
            )}
        </div>
    );
}

function renderJiraMetadata(m: JiraMetadata) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            {m.host && (<div><span className="text-muted-foreground">Host:</span> <span className="font-mono text-foreground">{m.host}</span></div>)}
            {m.email && (<div><span className="text-muted-foreground">E-mail:</span> <span className="text-foreground">{m.email}</span></div>)}
        </div>
    );
}

function renderSlackMetadata(m: SlackMetadata) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            {m.webhook_masked && (
                <div><span className="text-muted-foreground">Webhook:</span> <span className="font-mono text-foreground">{m.webhook_masked}</span></div>
            )}
            {m.default_channel && (
                <div><span className="text-muted-foreground">Canal:</span> <span className="font-mono text-foreground">#{m.default_channel}</span></div>
            )}
        </div>
    );
}

// ============================================================
// IntegrationCard (providers de conta única)
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
        <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-muted flex items-center justify-center">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-bold text-foreground">{title}</h3>
                        <p className="text-xs text-textSecondary max-w-md">{description}</p>
                    </div>
                </div>
                {docsHref && (
                    <a href={docsHref} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-muted-foreground hover:text-brand inline-flex items-center gap-1">
                        Docs <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            <div className="border-t border-border pt-4">
                {isConfigured ? (
                    <div className="flex flex-col gap-3">
                        <StatusPill status={lastStatus} lastTested={lastTested} />
                        {metadataView}
                        {testResult && (
                            <div className={`text-xs rounded-md px-3 py-2 ${testResult.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
                                {testResult.detail}
                            </div>
                        )}
                        {record?.last_test_error && !testResult && (
                            <div className="text-[10px] text-danger bg-danger/10 border border-danger/20 rounded-md px-2 py-1">
                                Último erro: {record.last_test_error}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma credencial configurada.</p>
                )}
            </div>

            <div className="flex items-center gap-2 pt-2">
                <button
                    onClick={onConfigure}
                    className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-brand/90"
                >
                    {isConfigured ? 'Atualizar credenciais' : 'Configurar'}
                </button>
                {isConfigured && (
                    <>
                        <button
                            onClick={onTest}
                            disabled={isTesting}
                            className="border border-border text-foreground px-3 py-2 rounded-lg text-xs font-bold hover:bg-accent disabled:opacity-50 flex items-center gap-1"
                        >
                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                            Testar conexão
                        </button>
                        <button
                            onClick={onDelete}
                            className="ml-auto text-muted-foreground hover:text-danger p-2 rounded-lg hover:bg-danger/10"
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

// ============================================================
// GitHubAccountCard (multi-conta)
// ============================================================

interface GitHubAccountCardProps {
    record: IntegrationRecord;
    testResult?: IntegrationTestResult;
    isTesting: boolean;
    isToggling: boolean;
    onUpdateToken: () => void;
    onTest: () => void;
    onToggleActive: (isActive: boolean) => void;
    onDelete: () => void;
}

function GitHubAccountCard({
    record, testResult, isTesting, isToggling,
    onUpdateToken, onTest, onToggleActive, onDelete,
}: GitHubAccountCardProps) {
    const meta = record.metadata as GitHubMetadata;
    const label = record.name || meta.login || 'Conta GitHub';
    const isActive = record.is_active;

    return (
        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 transition-opacity ${isActive ? 'border-border' : 'border-border opacity-60'}`}>
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Github className="w-4 h-4 text-foreground shrink-0" />
                    <span className="font-bold text-foreground text-sm truncate">{label}</span>
                    {!isActive && (
                        <span className="shrink-0 text-[10px] font-bold text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded">
                            Desconectada
                        </span>
                    )}
                </div>
                <button
                    onClick={onDelete}
                    className="shrink-0 text-muted-foreground hover:text-danger p-1.5 rounded-lg hover:bg-danger/10"
                    title="Remover conta"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Status + metadata */}
            <div className="flex flex-col gap-2">
                {isActive && (
                    <StatusPill status={record.last_test_status} lastTested={record.last_tested_at} />
                )}
                <div className="flex flex-col gap-1 text-xs">
                    {meta.login && (
                        <div><span className="text-muted-foreground">Conta:</span> <span className="font-mono text-foreground">{meta.login}</span></div>
                    )}
                    {meta.token_masked && (
                        <div><span className="text-muted-foreground">Token:</span> <span className="font-mono text-foreground">{meta.token_masked}</span></div>
                    )}
                    {meta.scopes && (
                        <div><span className="text-muted-foreground">Escopos:</span> <span className="font-mono text-foreground break-all">{meta.scopes}</span></div>
                    )}
                </div>
                {testResult && (
                    <div className={`text-xs rounded-md px-3 py-2 ${testResult.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
                        {testResult.detail}
                    </div>
                )}
                {record.last_test_error && !testResult && isActive && (
                    <div className="text-[10px] text-danger bg-danger/10 border border-danger/20 rounded-md px-2 py-1">
                        Último erro: {record.last_test_error}
                    </div>
                )}
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                {isActive ? (
                    <>
                        <button
                            onClick={onUpdateToken}
                            className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand/90"
                        >
                            Atualizar token
                        </button>
                        <button
                            onClick={onTest}
                            disabled={isTesting}
                            className="border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent disabled:opacity-50 flex items-center gap-1"
                        >
                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                            Testar
                        </button>
                        <button
                            onClick={() => onToggleActive(false)}
                            disabled={isToggling}
                            className="ml-auto border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent hover:text-warning disabled:opacity-50 flex items-center gap-1"
                            title="Desconectar sem excluir"
                        >
                            {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                            Desconectar
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => onToggleActive(true)}
                        disabled={isToggling}
                        className="border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent disabled:opacity-50 flex items-center gap-1"
                    >
                        {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                        Reconectar
                    </button>
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
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectada · <span className="font-normal text-muted-foreground">testada em {testedLabel}</span>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-danger">
                <XCircle className="w-3.5 h-3.5" /> Erro no último teste · <span className="font-normal text-muted-foreground">{testedLabel}</span>
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-warning">
            <RefreshCcw className="w-3.5 h-3.5" /> Configurada · ainda não testada
        </div>
    );
}
