'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Bell, FileText, FlaskConical, Loader2, Sparkles, ListChecks, FileCode2, ChevronDown } from 'lucide-react';
import { listAllWebConfigs, listWebSpecs } from '@/app/dashboard/projects/[id]/_components/web/web-api';
import type { RepoSpec, WebConfigSummary } from '@/app/dashboard/projects/[id]/_components/web/web-types';
import { ModalShell } from './ModalShell';
import { GherkinEditor } from './GherkinEditor';
import { TestTreePicker } from './TestTreePicker';
import { AUTOMATION_ALERT_DAYS, PRIORITY_OPTIONS, RUN_STATUS_OPTIONS, toSlug } from '@/lib/qa-journey/constants';
import type { TestCaseOption } from '@/lib/qa-journey/api';
import type {
    QAJourneyCase, QAJourneyCaseDraft, CasePriority, CaseRunStatus, CaseWritingMode, AutomationEngine,
} from '@/types/qa-journey';

interface CaseFormModalProps {
    subflowId: string;
    subflowTitle?: string;   // nome do sub-fluxo pai, exibido no título do modal
    initial?: QAJourneyCase | null;
    // Testes Maestro do projeto, para vincular quando o caso for automatizado.
    testCases?: TestCaseOption[];
    // Nº de casos já existentes no sub-fluxo — usado para gerar o ID externo
    // automático no modo Gherkin (tc_<funcionalidade>_NNN).
    siblingCount?: number;
    // ID do projeto — necessário para carregar specs Playwright (web).
    projectId?: string;
    onClose: () => void;
    onSave: (draft: QAJourneyCaseDraft) => Promise<void>;
}

const PLATFORM_OPTIONS = ['Web', 'Mobile', 'API'];
const GHERKIN_PLACEHOLDER = `# language: pt
@login @regression
Funcionalidade: Login no aplicativo
  Como usuário cadastrado
  Quero realizar login
  Para acessar minha conta

  @smoke @positive
  Cenário: Login com sucesso
    Dado que estou na tela inicial
    Quando preencho o campo "E-mail" com "user@foxbit.com.br"
    E preencho o campo "Senha" com "********"
    E clico no botão "Entrar"
    Então devo ver a mensagem "Olá!"`;

export function CaseFormModal({
    subflowId, subflowTitle, initial, testCases = [], siblingCount = 0, projectId, onClose, onSave,
}: CaseFormModalProps) {
    const [draft, setDraft] = useState<QAJourneyCaseDraft>(() => ({
        subflow_id: subflowId,
        external_id: initial?.external_id ?? '',
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        steps_summary: initial?.steps_summary ?? '',
        expected_result: initial?.expected_result ?? '',
        gherkin: initial?.gherkin ?? '',
        priority: initial?.priority ?? 'medium',
        last_run_status: initial?.last_run_status ?? null,
        test_case_id: initial?.test_case_id ?? null,
        // Sem opção "Não definida" — sempre uma das três (Web/Mobile/API).
        // Novo caso abre em Web por padrão; edição respeita o valor salvo.
        platform: initial?.platform ?? PLATFORM_OPTIONS[0],
        // Alerta de automação + refs Playwright (migration 022). undefined =
        // não tocado; só vai ao payload quando o usuário mexer.
        automation_alert_days: initial?.automation_alert_days ?? undefined,
        playwright_path: initial?.playwright_path ?? undefined,
        playwright_repo: initial?.playwright_repo ?? undefined,
        playwright_spec: initial?.playwright_spec ?? undefined,
    }));
    // Modo de escrita: tradicional (step-by-step) ou gherkin.
    // Caso NOVO abre em Gherkin por padrão; ao editar, respeita o modo salvo
    // (casos legados sem writing_mode caem em tradicional).
    const [mode, setMode] = useState<CaseWritingMode>(
        initial ? (initial.writing_mode ?? 'traditional') : 'gherkin',
    );
    // Tipo do caso: automatizado = tem teste vinculado (Maestro OU Playwright).
    const initiallyAutomated = Boolean(initial?.test_case_id)
        || (initial?.automation_engine === 'playwright' && Boolean(initial?.playwright_path || initial?.playwright_repo));
    const [tipo, setTipo] = useState<'manual' | 'automated'>(initiallyAutomated ? 'automated' : 'manual');
    // Painel do "alerta de automação" (sino) — aberto se já há prazo definido.
    const [alertOpen, setAlertOpen] = useState(Boolean(initial?.automation_alert_days));
    const [saving, setSaving] = useState(false);

    // Plataforma Web não usa Maestro — usa referência Playwright.
    const isWeb = (draft.platform || '').trim().toLowerCase() === 'web';

    // Projetos web com repositório configurado (picker de projeto).
    const [webProjects, setWebProjects] = useState<WebConfigSummary[]>([]);
    const [webProjectsLoading, setWebProjectsLoading] = useState(false);
    useEffect(() => {
        if (!isWeb || tipo !== 'automated') return;
        setWebProjectsLoading(true);
        listAllWebConfigs()
            .then(({ configs }) => setWebProjects(configs))
            .catch(() => setWebProjects([]))
            .finally(() => setWebProjectsLoading(false));
    }, [isWeb, tipo]);

    // Projeto selecionado no picker — inicializa com o projeto atual (se tiver config).
    // Usamos playwright_repo para armazenar "owner/repo" do projeto selecionado.
    const [selectedWebProjectId, setSelectedWebProjectId] = useState<string>(() => projectId || '');

    // Quando os projetos carregam, garante que o projeto atual seja selecionado (se disponível).
    useEffect(() => {
        if (!projectId || webProjects.length === 0) return;
        const found = webProjects.find(p => p.project_id === projectId);
        if (found) setSelectedWebProjectId(found.project_id);
        else if (!selectedWebProjectId) setSelectedWebProjectId(webProjects[0].project_id);
    }, [webProjects, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectedProject = webProjects.find(p => p.project_id === selectedWebProjectId) ?? null;

    // Specs do projeto selecionado.
    const [specs, setSpecs] = useState<RepoSpec[]>([]);
    const [specsLoading, setSpecsLoading] = useState(false);
    useEffect(() => {
        if (!isWeb || tipo !== 'automated' || !selectedWebProjectId) return;
        setSpecs([]);
        setSpecsLoading(true);
        listWebSpecs(selectedWebProjectId)
            .then(({ specs }) => setSpecs(specs))
            .catch(() => setSpecs([]))
            .finally(() => setSpecsLoading(false));
    }, [isWeb, tipo, selectedWebProjectId]);

    const isEdit = Boolean(initial?.id);
    const canSave = (draft.title || '').trim().length > 0 && !saving;

    // ID externo gerado automaticamente: tc_<funcionalidade>_NNN (contador do
    // subfluxo). Usado nos dois modos; o campo é somente-leitura.
    const autoExternalId = useMemo(() => {
        const base = (toSlug(draft.title || '') || 'caso').replace(/-/g, '_');
        const seq = String((siblingCount ?? 0) + 1).padStart(3, '0');
        return `tc_${base}_${seq}`;
    }, [draft.title, siblingCount]);
    // Ao editar, preserva o ID já existente; ao criar, usa o gerado.
    const effectiveExternalId = (draft.external_id || '').trim() || autoExternalId;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            const automated = tipo === 'automated';
            // Guard (padrão das migrations recentes): só envia o campo quando há
            // valor novo OU quando se está limpando um valor que existia.
            const guard = <T,>(val: T | null, had: unknown): T | null | undefined =>
                val != null ? val : (had != null && had !== '' ? null : undefined);

            // Maestro (Mobile/API): vínculo só quando automatizado e NÃO-Web.
            const maestroId = automated && !isWeb ? (draft.test_case_id || null) : null;
            const test_case_id = guard(maestroId, initial?.test_case_id);

            // Playwright (Web): refs só quando automatizado e Web.
            const pw = automated && isWeb;
            const playwright_path = guard(pw ? ((draft.playwright_path || '').trim() || null) : null, initial?.playwright_path);
            const playwright_repo = guard(pw ? ((draft.playwright_repo || '').trim() || null) : null, initial?.playwright_repo);
            const playwright_spec = guard(pw ? ((draft.playwright_spec || '').trim() || null) : null, initial?.playwright_spec);

            // Motor: playwright (Web) | maestro (demais) | null (manual).
            const engineVal: AutomationEngine | null = automated ? (isWeb ? 'playwright' : 'maestro') : null;
            const automation_engine = guard<AutomationEngine>(engineVal, initial?.automation_engine);

            const common = {
                ...draft,
                title: (draft.title || '').trim(),
                writing_mode: mode,
                // ID externo é sempre o gerado automaticamente (campo somente-leitura).
                external_id: effectiveExternalId,
                test_case_id,
                automation_engine,
                playwright_path,
                playwright_repo,
                playwright_spec,
                platform: draft.platform !== undefined ? ((draft.platform || '').trim() || null) : undefined,
            };

            if (mode === 'gherkin') {
                await onSave({
                    ...common,
                    gherkin: (draft.gherkin || '').trim() || null,
                    // Gherkin não usa estes campos — limpa para não “sobrar” do modo tradicional.
                    description: null,
                    steps_summary: null,
                    expected_result: null,
                });
            } else {
                await onSave({
                    ...common,
                    description: (draft.description || '').trim() || null,
                    steps_summary: (draft.steps_summary || '').trim() || null,
                    expected_result: (draft.expected_result || '').trim() || null,
                    gherkin: null,
                });
            }
        } catch {
            // O pai já alertou o erro — só não fecha o modal.
        } finally {
            setSaving(false);
        }
    };

    // ── Blocos compartilhados pelos dois modos ────────────────────────────
    const tipoTesteBlock = (
        <div className="flex flex-col gap-1.5">
            <Label>Tipo de teste</Label>
            <div className="inline-flex bg-foreground/5 border border-border rounded-lg p-1 gap-1 self-start">
                <button
                    type="button"
                    onClick={() => { setTipo('manual'); setDraft(d => ({ ...d, test_case_id: null })); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        tipo === 'manual' ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Manual
                </button>
                <button
                    type="button"
                    onClick={() => setTipo('automated')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors ${
                        tipo === 'automated' ? 'bg-green-500/20 text-green-500' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Automatizado
                </button>
            </div>
        </div>
    );

    // Vínculo do teste automatizado — depende da plataforma:
    //   Web   → referência Playwright (pasta do projeto e/ou git + spec)
    //   demais → seletor do teste Maestro (atual)
    const linkBlock = tipo === 'automated' && (
        isWeb ? (
            <div className="flex flex-col gap-1.5">
                <Label>Teste Automatizado vinculado (Playwright)</Label>
                <div className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-foreground/[0.02]">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand">
                        <FlaskConical className="w-3.5 h-3.5" /> Playwright (Web)
                    </div>

                    {/* 1. Selecionar projeto */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground font-medium">Projeto</span>
                        {webProjectsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando projetos…
                            </div>
                        ) : webProjects.length === 0 ? (
                            <p className="text-[11px] text-warning">Nenhum projeto Web com repositório configurado. Configure em Configurar → Conectar Repositório.</p>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedWebProjectId}
                                    onChange={e => {
                                        setSelectedWebProjectId(e.target.value);
                                        setDraft(d => ({ ...d, playwright_spec: null }));
                                    }}
                                    className={`${inputClass} w-full appearance-none pr-8`}
                                >
                                    <option value="">— Selecionar projeto —</option>
                                    {webProjects.map(p => (
                                        <option key={p.project_id} value={p.project_id}>
                                            {p.project_name} · {p.repo_owner}/{p.repo_name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                            </div>
                        )}
                    </div>

                    {/* 2. Selecionar spec (apenas quando projeto selecionado) */}
                    {selectedWebProjectId && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground font-medium">Spec</span>
                            {specsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando specs…
                                </div>
                            ) : specs.length > 0 ? (
                                <div className="relative">
                                    <select
                                        value={draft.playwright_spec || ''}
                                        onChange={e => {
                                            const spec = e.target.value || null;
                                            const repo = selectedProject
                                                ? `${selectedProject.repo_owner}/${selectedProject.repo_name}`
                                                : null;
                                            setDraft(d => ({ ...d, playwright_spec: spec, playwright_repo: repo }));
                                        }}
                                        className={`${inputClass} w-full appearance-none pr-8`}
                                    >
                                        <option value="">— Selecionar spec —</option>
                                        {specs.map(s => (
                                            <option key={s.path} value={s.path}>{s.name} · {s.path}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">
                                    Nenhum spec encontrado neste repositório. Verifique a pasta configurada ou rode os testes ao menos uma vez.
                                </p>
                            )}
                            {draft.playwright_spec && (
                                <p className="text-[10px] text-success font-mono">✓ {draft.playwright_spec}</p>
                            )}
                        </div>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Selecione o projeto e a spec Playwright para vincular. Os resultados do CI atualizarão este caso automaticamente.
                </p>
            </div>
        ) : (
            <div className="flex flex-col gap-1.5">
                <Label>Teste Automatizado vinculado</Label>
                <TestTreePicker
                    testCases={testCases}
                    value={draft.test_case_id || null}
                    onChange={id => setDraft({ ...draft, test_case_id: id })}
                />
                <p className="text-[10px] text-muted-foreground">
                    Selecione na árvore do projeto o teste automatizado do Maestro. Sem vínculo, o caso conta como manual.
                </p>
            </div>
        )
    );

    // Alerta de automação (sino): conta a partir da criação do caso.
    const alertDays = draft.automation_alert_days ?? null;
    const automationAlertBlock = (
        <div className="border border-border rounded-xl p-4 flex flex-col gap-3">
            <button
                type="button"
                onClick={() => setAlertOpen(v => !v)}
                className="flex items-start gap-3 text-left"
            >
                <span className={`relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors ${alertDays ? 'bg-brand' : 'bg-foreground/15'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${alertDays ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
                <span className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-brand" /> Alerta de automação
                        {alertDays && <span className="text-brand">· {alertDays} dias</span>}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                        Conta a partir da criação do caso. Ao atingir o prazo (e ainda manual), surge um alerta no sino: o título do caso + “deve ser automatizado, inclua na sprint”.
                    </span>
                </span>
            </button>

            {alertOpen && (
                <div className="flex flex-wrap items-center gap-2 pl-12">
                    {AUTOMATION_ALERT_DAYS.map(d => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDraft({ ...draft, automation_alert_days: alertDays === d ? null : d })}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                                alertDays === d ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:border-brand/40'
                            }`}
                        >
                            {d} dias
                        </button>
                    ))}
                    {alertDays != null && (
                        <button
                            type="button"
                            onClick={() => setDraft({ ...draft, automation_alert_days: null })}
                            className="text-[11px] text-danger hover:underline ml-1"
                        >
                            Desativar
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    // Plataforma: sem opção "Não definida" — sempre uma das três.
    const platformValue = draft.platform || PLATFORM_OPTIONS[0];
    const hasCustomPlatform = Boolean(draft.platform) && !PLATFORM_OPTIONS.includes(draft.platform!);
    const metaGridBlock = (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
                <Label>Plataforma</Label>
                <select
                    value={platformValue}
                    onChange={e => setDraft({ ...draft, platform: e.target.value })}
                    className={inputClass}
                >
                    {PLATFORM_OPTIONS.map(p => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                    {hasCustomPlatform && <option value={draft.platform!}>{draft.platform}</option>}
                </select>
            </div>
            <div className="flex flex-col gap-1.5">
                <Label>Prioridade</Label>
                <select
                    value={draft.priority || 'medium'}
                    onChange={e => setDraft({ ...draft, priority: e.target.value as CasePriority })}
                    className={inputClass}
                >
                    {PRIORITY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col gap-1.5">
                <Label>Última execução</Label>
                <select
                    value={draft.last_run_status || ''}
                    onChange={e => setDraft({ ...draft, last_run_status: (e.target.value || null) as CaseRunStatus | null })}
                    className={inputClass}
                >
                    <option value="">— Não definido —</option>
                    {RUN_STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );

    return (
        <ModalShell
            title={
                <>
                    <FileText className="w-5 h-5 text-brand" />
                    <span className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                        {isEdit ? 'Editar Caso' : 'Novo Caso'}
                        {subflowTitle && (
                            <span className="text-muted-foreground font-normal truncate">
                                em <span className="text-brand font-bold">{subflowTitle}</span>
                            </span>
                        )}
                    </span>
                </>
            }
            onClose={onClose}
            maxWidth="max-w-4xl"
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSave}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEdit ? 'Salvar alterações' : 'Criar Caso'}
                    </button>
                </>
            }
        >
            {/* ── Linha 1: escrita do teste (abas) + título/funcionalidade ── */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex flex-col gap-1.5 shrink-0">
                    <Label>Escrita do teste</Label>
                    <div className="inline-flex bg-foreground/5 border border-border rounded-lg p-1 gap-1 self-start">
                        <ModeTab active={mode === 'traditional'} onClick={() => setMode('traditional')} icon={ListChecks}>
                            Tradicional · step by step
                        </ModeTab>
                        <ModeTab active={mode === 'gherkin'} onClick={() => setMode('gherkin')} icon={FileCode2}>
                            Gherkin
                        </ModeTab>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <Label>{mode === 'gherkin' ? 'Funcionalidade (título) *' : 'Título *'}</Label>
                    <input
                        type="text"
                        value={draft.title || ''}
                        onChange={e => setDraft({ ...draft, title: e.target.value })}
                        placeholder={mode === 'gherkin' ? 'ex: Login no aplicativo Foxbit' : 'ex: Login com email e senha válidos'}
                        className={`${inputClass} w-full`}
                        autoFocus
                    />
                </div>
            </div>

            {mode === 'traditional' ? (
                <>
                    <div className="flex flex-col gap-1.5">
                        <Label>Descrição</Label>
                        <textarea
                            value={draft.description || ''}
                            onChange={e => setDraft({ ...draft, description: e.target.value })}
                            placeholder="Contexto e objetivo do caso — em linguagem de negócio."
                            rows={3}
                            className={`${inputClass} resize-y min-h-[80px]`}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label>Resumo dos passos</Label>
                        <textarea
                            value={draft.steps_summary || ''}
                            onChange={e => setDraft({ ...draft, steps_summary: e.target.value })}
                            placeholder="Passos em linguagem de negócio (não técnico)."
                            rows={6}
                            className={`${inputClass} resize-y min-h-[130px]`}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label>Resultado esperado</Label>
                        <textarea
                            value={draft.expected_result || ''}
                            onChange={e => setDraft({ ...draft, expected_result: e.target.value })}
                            placeholder="O que precisa acontecer para considerar o caso aprovado."
                            rows={4}
                            className={`${inputClass} resize-y min-h-[90px]`}
                        />
                    </div>
                </>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <Label>Cenário Gherkin</Label>
                    <GherkinEditor
                        value={draft.gherkin || ''}
                        onChange={v => setDraft({ ...draft, gherkin: v })}
                        placeholder={GHERKIN_PLACEHOLDER}
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Cole o cenário em Gherkin (Funcionalidade, Cenário, Dado/Quando/Então). O realce é automático.
                    </p>
                </div>
            )}

            {/* Plataforma/Prioridade/Execução primeiro — a plataforma decide se o
                vínculo abaixo é Maestro (Mobile) ou Playwright (Web). */}
            {metaGridBlock}

            {/* Tipo de teste + vínculo (Maestro/Playwright) lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {tipoTesteBlock}
                {linkBlock}
            </div>

            {automationAlertBlock}
        </ModalShell>
    );
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{children}</label>;
}

function ModeTab({
    active, onClick, icon: Icon, children,
}: {
    active: boolean;
    onClick: () => void;
    icon: ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors ${
                active ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:text-foreground'
            }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {children}
        </button>
    );
}
