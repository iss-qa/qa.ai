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

export async function setJourneyPublished(id: string, isPublished: boolean): Promise<void> {
    const { error } = await supabase
        .from('qa_journeys')
        .update({ is_published: isPublished })
        .eq('id', id);
    if (error) throw error;
}

function sanitizeJourneyPayload(draft: QAJourneyDraft): Record<string, unknown> {
    return {
        project_id: draft.project_id,
        slug: draft.slug,
        title: draft.title,
        description: draft.description ?? null,
        icon: draft.icon ?? null,
        color: draft.color ?? null,
        sequence: typeof draft.sequence === 'number' ? draft.sequence : 0,
        is_published: Boolean(draft.is_published),
    };
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
    return {
        journey_id: draft.journey_id,
        title: draft.title,
        description: draft.description ?? null,
        sequence: typeof draft.sequence === 'number' ? draft.sequence : 0,
        automation_status: draft.automation_status || 'manual',
        test_case_id: draft.test_case_id ?? null,
        jira_query: draft.jira_query ?? null,
    };
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
    return {
        subflow_id: draft.subflow_id,
        external_id: draft.external_id ?? null,
        title: draft.title,
        steps_summary: draft.steps_summary ?? null,
        expected_result: draft.expected_result ?? null,
        priority: draft.priority || 'medium',
        last_run_status: draft.last_run_status ?? null,
        last_run_at: draft.last_run_at ?? null,
    };
}
