// Wrappers tipados para queries Supabase da feature Jornada do QA.
// Mantem os componentes de UI livres da sintaxe do supabase-js e
// concentra o tratamento de erro de migration ausente em um lugar.

import { supabase } from '@/lib/supabase';
import type {
    QAJourney,
    QAJourneySubflow,
    QAJourneyCase,
    QAJourneyDraft,
    QAJourneySubflowDraft,
    QAJourneyCaseDraft,
} from '@/types/qa-journey';
import { QA_JOURNEY_MIGRATION_MISSING_CODE } from '@/types/qa-journey';

export type ProjectOption = { id: string; name: string };
export type TestCaseOption = { id: string; name: string; project_id: string | null };

export interface QAJourneyListResult {
    journeys: QAJourney[];
    migrationMissing: boolean;
}

export interface QAJourneyDetailResult {
    journey: QAJourney | null;
    subflows: QAJourneySubflow[];
    cases: QAJourneyCase[];
    migrationMissing: boolean;
}

function isMigrationMissing(error: unknown): boolean {
    return Boolean(error && (error as { code?: string }).code === QA_JOURNEY_MIGRATION_MISSING_CODE);
}

// Mensagem legível para qualquer erro (Error, PostgrestError ou desconhecido).
// Erros de coluna/tabela ausente ganham instrução de migration acionável.
export function errorMessage(e: unknown): string {
    let msg: string | null = null;
    let code: string | undefined;
    if (e instanceof Error) {
        msg = e.message;
    } else if (e && typeof e === 'object') {
        const obj = e as { message?: string; code?: string };
        msg = obj.message ?? null;
        code = obj.code;
    }
    if (!msg) return String(e);
    if (code === 'PGRST204' || code === '42703' || code === QA_JOURNEY_MIGRATION_MISSING_CODE || /schema cache|does not exist/i.test(msg)) {
        return `${msg}\n\nProvável migration pendente: rode os arquivos .sql mais recentes de supabase/migrations/ no SQL Editor do Supabase e tente de novo.`;
    }
    return msg;
}

// ============================================================
// Evidência de execução manual (Supabase Storage, bucket qa-evidence)
// ============================================================

export async function uploadCaseEvidence(
    caseId: string,
    file: File,
): Promise<{ url: string; type: 'image' | 'video' }> {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const ext = (file.name.split('.').pop() || (type === 'video' ? 'mp4' : 'png')).toLowerCase();
    const path = `${caseId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
        .from('qa-evidence')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from('qa-evidence').getPublicUrl(path);
    return { url: data.publicUrl, type };
}

// ============================================================
// Último projeto usado (localStorage) — permite começar a carregar
// as jornadas no mount, sem esperar a lista de projetos chegar.
// ============================================================

const LAST_PROJECT_KEY = 'qa-journey:last-project';

export function getLastProjectId(): string | null {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}

export function setLastProjectId(id: string): void {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* storage indisponível */ }
}

// ============================================================
// Projects + Test Cases (auxiliares para selectors nos forms)
// ============================================================

export async function loadProjectOptions(): Promise<ProjectOption[]> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });
    if (error) {
        console.error('loadProjectOptions failed:', error);
        return [];
    }
    return (data || []) as ProjectOption[];
}

export async function loadTestCaseOptions(projectId?: string | null): Promise<TestCaseOption[]> {
    let query = supabase
        .from('test_cases')
        .select('id, name, project_id')
        .order('name', { ascending: true });
    if (projectId) {
        query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('loadTestCaseOptions failed:', error);
        return [];
    }
    return (data || []) as TestCaseOption[];
}

// ============================================================
// Journeys
// ============================================================

export async function loadJourneys(projectId: string): Promise<QAJourneyListResult> {
    const { data, error } = await supabase
        .from('qa_journeys')
        .select('*')
        .eq('project_id', projectId)
        .order('sequence', { ascending: true })
        .order('created_at', { ascending: true });
    if (error) {
        if (isMigrationMissing(error)) return { journeys: [], migrationMissing: true };
        console.error('loadJourneys failed:', error);
        return { journeys: [], migrationMissing: false };
    }
    return { journeys: (data || []) as QAJourney[], migrationMissing: false };
}

export interface QAJourneyMapData {
    journeys: QAJourney[];
    subflows: QAJourneySubflow[];
    cases: QAJourneyCase[];
    migrationMissing: boolean;
}

// Carrega tudo que o mapa público precisa em 2 roundtrips:
// 1) jornadas publicadas do projeto; 2) subflows + cases em paralelo
// (cases filtrados por journey_id via inner join, sem esperar os subflows).
export async function loadJourneyMapData(projectId: string): Promise<QAJourneyMapData> {
    const { journeys, migrationMissing } = await loadJourneys(projectId);
    if (migrationMissing) {
        return { journeys: [], subflows: [], cases: [], migrationMissing: true };
    }
    const published = journeys.filter(j => j.is_published);
    if (published.length === 0) {
        return { journeys: published, subflows: [], cases: [], migrationMissing: false };
    }

    const journeyIds = published.map(j => j.id);
    const [subRes, caseRes] = await Promise.all([
        supabase
            .from('qa_journey_subflows')
            .select('*')
            .in('journey_id', journeyIds)
            .order('sequence', { ascending: true })
            .order('created_at', { ascending: true }),
        supabase
            .from('qa_journey_cases')
            .select('*, qa_journey_subflows!inner(journey_id)')
            .in('qa_journey_subflows.journey_id', journeyIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true }),
    ]);

    if (subRes.error) {
        if (isMigrationMissing(subRes.error)) {
            return { journeys: [], subflows: [], cases: [], migrationMissing: true };
        }
        console.error('loadJourneyMapData subflows failed:', subRes.error);
    }
    if (caseRes.error) console.error('loadJourneyMapData cases failed:', caseRes.error);

    // Remove o objeto embutido do join antes de devolver
    const cases = ((caseRes.data || []) as (QAJourneyCase & { qa_journey_subflows?: unknown })[])
        .map(row => {
            const c = { ...row };
            delete c.qa_journey_subflows;
            return c as QAJourneyCase;
        });

    return {
        journeys: published,
        subflows: (subRes.data || []) as QAJourneySubflow[],
        cases,
        migrationMissing: false,
    };
}

export async function loadJourneyDetail(journeyId: string): Promise<QAJourneyDetailResult> {
    const [journeyRes, subflowsRes] = await Promise.all([
        supabase.from('qa_journeys').select('*').eq('id', journeyId).maybeSingle(),
        supabase.from('qa_journey_subflows').select('*').eq('journey_id', journeyId).order('sequence', { ascending: true }).order('created_at', { ascending: true }),
    ]);

    if (journeyRes.error && isMigrationMissing(journeyRes.error)) {
        return { journey: null, subflows: [], cases: [], migrationMissing: true };
    }
    if (journeyRes.error) console.error('loadJourneyDetail journey failed:', journeyRes.error);
    if (subflowsRes.error) console.error('loadJourneyDetail subflows failed:', subflowsRes.error);

    const subflows = (subflowsRes.data || []) as QAJourneySubflow[];
    const subflowIds = subflows.map(s => s.id);

    let cases: QAJourneyCase[] = [];
    if (subflowIds.length > 0) {
        const casesRes = await supabase
            .from('qa_journey_cases')
            .select('*')
            .in('subflow_id', subflowIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true });
        if (casesRes.error) console.error('loadJourneyDetail cases failed:', casesRes.error);
        cases = (casesRes.data || []) as QAJourneyCase[];
    }

    return {
        journey: (journeyRes.data as QAJourney | null) || null,
        subflows,
        cases,
        migrationMissing: false,
    };
}

export async function createJourney(draft: QAJourneyDraft): Promise<QAJourney> {
    const payload = sanitizeJourneyPayload(draft);
    const { data, error } = await supabase
        .from('qa_journeys')
        .insert(payload)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourney;
}

export async function updateJourney(id: string, draft: QAJourneyDraft): Promise<QAJourney> {
    const payload = sanitizeJourneyPayload(draft);
    const { data, error } = await supabase
        .from('qa_journeys')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourney;
}

export async function deleteJourney(id: string): Promise<void> {
    const { error } = await supabase.from('qa_journeys').delete().eq('id', id);
    if (error) throw error;
}

export async function deleteJourneys(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from('qa_journeys').delete().in('id', ids);
    if (error) throw error;
}

export async function setJourneyPublished(id: string, isPublished: boolean): Promise<void> {
    const { error } = await supabase
        .from('qa_journeys')
        .update({ is_published: isPublished })
        .eq('id', id);
    if (error) throw error;
}

function sanitizeJourneyPayload(draft: QAJourneyDraft): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        project_id: draft.project_id,
        slug: draft.slug,
        title: draft.title,
        description: draft.description ?? null,
        icon: draft.icon ?? null,
        color: draft.color ?? null,
        sequence: typeof draft.sequence === 'number' ? draft.sequence : 0,
        is_published: Boolean(draft.is_published),
    };
    // Só envia html_doc quando o form mexeu no campo — evita erro de coluna
    // inexistente em instalações que ainda não aplicaram a migration 008.
    if (draft.html_doc !== undefined) payload.html_doc = draft.html_doc;
    return payload;
}

// ============================================================
// Subflows
// ============================================================

export async function createSubflow(draft: QAJourneySubflowDraft): Promise<QAJourneySubflow> {
    const payload = sanitizeSubflowPayload(draft);
    const { data, error } = await supabase
        .from('qa_journey_subflows')
        .insert(payload)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourneySubflow;
}

export async function updateSubflow(id: string, draft: QAJourneySubflowDraft): Promise<QAJourneySubflow> {
    const payload = sanitizeSubflowPayload(draft);
    const { data, error } = await supabase
        .from('qa_journey_subflows')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourneySubflow;
}

export async function deleteSubflow(id: string): Promise<void> {
    const { error } = await supabase.from('qa_journey_subflows').delete().eq('id', id);
    if (error) throw error;
}

function sanitizeSubflowPayload(draft: QAJourneySubflowDraft): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        journey_id: draft.journey_id,
        title: draft.title,
        description: draft.description ?? null,
        sequence: typeof draft.sequence === 'number' ? draft.sequence : 0,
        automation_status: draft.automation_status || 'manual',
        test_case_id: draft.test_case_id ?? null,
        jira_query: draft.jira_query ?? null,
    };
    // Só envia html_doc quando o form mexeu no campo — evita erro de coluna
    // inexistente em instalações que ainda não adicionaram html_doc ao subflow.
    if (draft.html_doc !== undefined) payload.html_doc = draft.html_doc;
    return payload;
}

// ============================================================
// Cases
// ============================================================

export async function createCase(draft: QAJourneyCaseDraft): Promise<QAJourneyCase> {
    const payload = sanitizeCasePayload(draft);
    const { data, error } = await supabase
        .from('qa_journey_cases')
        .insert(payload)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourneyCase;
}

export async function updateCase(id: string, draft: QAJourneyCaseDraft): Promise<QAJourneyCase> {
    const payload = sanitizeCasePayload(draft);
    const { data, error } = await supabase
        .from('qa_journey_cases')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
    if (error) throw error;
    return data as QAJourneyCase;
}

export async function deleteCase(id: string): Promise<void> {
    const { error } = await supabase.from('qa_journey_cases').delete().eq('id', id);
    if (error) throw error;
}

function sanitizeCasePayload(draft: QAJourneyCaseDraft): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        subflow_id: draft.subflow_id,
        external_id: draft.external_id ?? null,
        title: draft.title,
        steps_summary: draft.steps_summary ?? null,
        expected_result: draft.expected_result ?? null,
        priority: draft.priority || 'medium',
        last_run_status: draft.last_run_status ?? null,
        last_run_at: draft.last_run_at ?? null,
    };
    // Campos de migrations recentes só entram no payload quando o form/import
    // mexeu neles — evita erro de coluna inexistente em bancos desatualizados.
    if (draft.platform !== undefined) payload.platform = draft.platform ?? null;          // 009
    if (draft.evidence_url !== undefined) payload.evidence_url = draft.evidence_url ?? null;    // 010
    if (draft.evidence_type !== undefined) payload.evidence_type = draft.evidence_type ?? null; // 010
    return payload;
}
