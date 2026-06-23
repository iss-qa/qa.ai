// Gera o texto descritivo do relatório (pronto para colar na thread do Slack).
// Sem UI aqui — só transforma o ProjectReport em frases, em variações de tom e formato.

import { formatDurationMs, platformLabel, type FailingTestAgg, type ProjectReport, type ReportPeriodDays } from './api';

export type NarrativeTone = 'executivo' | 'alerta' | 'status';
export type NarrativeFormat = 'slack' | 'plain';

export const NARRATIVE_TONES: { value: NarrativeTone; label: string; hint: string }[] = [
    { value: 'executivo', label: 'Resumo executivo', hint: 'Visão geral de números e qualidade — para liderança.' },
    { value: 'alerta', label: 'Pontos de atenção', hint: 'Foca nos fluxos e casos com mais falhas no período.' },
    { value: 'status', label: 'Status do período', hint: 'Atualização equilibrada — avanços e pendências.' },
];

export interface NarrativeInput {
    projectName: string;
    days: ReportPeriodDays;
    report: ProjectReport;
    tone: NarrativeTone;
    format: NarrativeFormat;
}

// ---- helpers de formatação ----

const bold = (s: string, fmt: NarrativeFormat) => (fmt === 'slack' ? `*${s}*` : s);
const emoji = (e: string, fmt: NarrativeFormat) => (fmt === 'slack' ? `${e} ` : '');
const bullet = (fmt: NarrativeFormat) => (fmt === 'slack' ? '• ' : '- ');

function periodPhrase(days: number): string {
    return `nos últimos ${days} dias`;
}

function shortDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Descreve um caso com falha: "Cadastro de PF (Mobile) — 4 falhas em 6 execuções (67%)"
function describeTest(t: FailingTestAgg, fmt: NarrativeFormat): string {
    const plat = platformLabel(t.platform);
    const platTxt = plat ? ` (${plat})` : '';
    const last = t.lastFailureAt ? `, última em ${shortDate(t.lastFailureAt)}` : '';
    let line = `${bold(t.name, fmt)}${platTxt} — ${t.failed} ${t.failed === 1 ? 'falha' : 'falhas'} em ${t.runs} ${t.runs === 1 ? 'execução' : 'execuções'} (${t.failRate}% de falha)${last}`;
    if (t.topError) line += `\n${fmt === 'slack' ? '   ' : '  '}↳ erro recorrente: "${t.topError}"`;
    return line;
}

// Agrupa os casos com falha por fluxo+plataforma para a narrativa de alerta.
function groupByFlow(tests: FailingTestAgg[]): { flow: string; platform: string | null; tests: FailingTestAgg[] }[] {
    const map = new Map<string, { flow: string; platform: string | null; tests: FailingTestAgg[] }>();
    for (const t of tests) {
        const key = `${t.flow || 'Sem fluxo'}::${t.platform || ''}`;
        let g = map.get(key);
        if (!g) { g = { flow: t.flow || 'Sem fluxo', platform: t.platform, tests: [] }; map.set(key, g); }
        g.tests.push(t);
    }
    return Array.from(map.values()).sort(
        (a, b) => b.tests.reduce((s, t) => s + t.failed, 0) - a.tests.reduce((s, t) => s + t.failed, 0),
    );
}

// ---- narrativas por tom ----

function buildExecutivo({ projectName, days, report, format: fmt }: NarrativeInput): string {
    const L: string[] = [];
    L.push(`${emoji('📊', fmt)}${bold(`Relatório de QA — ${projectName}`, fmt)} (${periodPhrase(days)})`);
    L.push('');

    const passTxt = report.passRate == null ? 'sem execuções concluídas' : `taxa de sucesso de ${bold(`${report.passRate}%`, fmt)}`;
    L.push(
        `Executamos ${bold(String(report.totalRuns), fmt)} ${report.totalRuns === 1 ? 'teste' : 'testes'} no período, com ${passTxt} ` +
        `(${report.passedRuns} ${report.passedRuns === 1 ? 'passou' : 'passaram'}, ${report.failedRuns} ${report.failedRuns === 1 ? 'falhou' : 'falharam'}). ` +
        `Duração média por execução: ${formatDurationMs(report.avgDurationMs)}.`,
    );

    L.push(
        `Qualidade: ${bold(String(report.openBugs), fmt)} ${report.openBugs === 1 ? 'bug em aberto' : 'bugs em aberto'} ` +
        `(${report.bugsBySeverity.critical} ${report.bugsBySeverity.critical === 1 ? 'crítico' : 'críticos'}, ${report.bugsBySeverity.high} ${report.bugsBySeverity.high === 1 ? 'alto' : 'altos'}) ` +
        `e ${report.resolvedInPeriod} ${report.resolvedInPeriod === 1 ? 'resolvido' : 'resolvidos'} no período.`,
    );

    const j = report.journeys;
    L.push(
        `Cobertura das jornadas: ${bold(`${j.automation_pct}% automatizado`, fmt)} ` +
        `(${j.automated_subflows}/${j.total_subflows} sub-fluxos), ${j.total_cases} casos mapeados.`,
    );

    const flow = report.topFailingTests[0];
    if (flow) {
        const plat = platformLabel(flow.platform);
        L.push('');
        L.push(
            `${emoji('⚠️', fmt)}Atenção: o fluxo ${bold(flow.flow || 'Sem fluxo', fmt)}${plat ? ` (${plat})` : ''} concentra as falhas — ` +
            `${flow.name} falhou ${flow.failed}x (${flow.failRate}%).`,
        );
    }
    return L.join('\n');
}

function buildAlerta({ projectName, days, report, format: fmt }: NarrativeInput): string {
    const L: string[] = [];
    L.push(`${emoji('🚨', fmt)}${bold(`Pontos de atenção — QA ${projectName}`, fmt)} (${periodPhrase(days)})`);
    L.push('');

    if (report.topFailingTests.length === 0) {
        L.push(`Boa notícia: ${periodPhrase(days)} não identificamos falhas recorrentes nos fluxos automatizados. ${fmt === 'slack' ? '✅' : ''}`.trim());
        return L.join('\n');
    }

    const groups = groupByFlow(report.topFailingTests);
    const lead = groups[0];
    const leadPlat = platformLabel(lead.platform);
    L.push(
        `${capitalize(periodPhrase(days))}, identificamos que o fluxo ${bold(lead.flow, fmt)}${leadPlat ? ` no ${leadPlat.toLowerCase()}` : ''} ` +
        `tem apresentado falhas com frequência nos seguintes casos de teste:`,
    );
    L.push('');

    for (const g of groups) {
        const plat = platformLabel(g.platform);
        if (groups.length > 1) L.push(bold(`▸ ${g.flow}${plat ? ` · ${plat}` : ''}`, fmt));
        for (const t of g.tests) L.push(`${bullet(fmt)}${describeTest(t, fmt)}`);
        if (groups.length > 1) L.push('');
    }

    if (report.openBugs > 0) {
        L.push('');
        L.push(
            `Em aberto: ${bold(String(report.openBugs), fmt)} ${report.openBugs === 1 ? 'bug' : 'bugs'} ` +
            `(${report.bugsBySeverity.critical} ${report.bugsBySeverity.critical === 1 ? 'crítico' : 'críticos'}, ${report.bugsBySeverity.high} ${report.bugsBySeverity.high === 1 ? 'alto' : 'altos'}).`,
        );
    }
    L.push('');
    L.push(`${emoji('👉', fmt)}Sugestão: priorizar a investigação desses cenários antes da próxima release.`);
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildStatus({ projectName, days, report, format: fmt }: NarrativeInput): string {
    const L: string[] = [];
    L.push(`${emoji('🟢', fmt)}${bold(`Status de QA — ${projectName}`, fmt)} (${periodPhrase(days)})`);
    L.push('');

    const passTxt = report.passRate == null ? '—' : `${report.passRate}%`;
    L.push(`${bullet(fmt)}Execuções: ${bold(String(report.totalRuns), fmt)} · sucesso ${bold(passTxt, fmt)} · ${report.failedRuns} ${report.failedRuns === 1 ? 'falha' : 'falhas'}`);
    L.push(`${bullet(fmt)}Bugs: ${report.openBugs} em aberto · ${report.resolvedInPeriod} resolvidos no período`);
    L.push(`${bullet(fmt)}Automação das jornadas: ${report.journeys.automation_pct}% (${report.journeys.automated_subflows}/${report.journeys.total_subflows} sub-fluxos)`);
    L.push(`${bullet(fmt)}Testes ativos: ${report.activeTestCases} de ${report.totalTestCases} cadastrados`);

    if (report.failuresByFlow.length > 0) {
        L.push('');
        L.push(bold('Fluxos para acompanhar:', fmt));
        for (const f of report.failuresByFlow.slice(0, 3)) {
            const plat = platformLabel(f.platform);
            L.push(`${bullet(fmt)}${f.flow}${plat ? ` (${plat})` : ''}: ${f.failed} ${f.failed === 1 ? 'falha' : 'falhas'} (${f.failRate}%) em ${f.failingTests} ${f.failingTests === 1 ? 'caso' : 'casos'}`);
        }
    } else {
        L.push('');
        L.push(`${emoji('✅', fmt)}Sem fluxos com falhas recorrentes no período.`);
    }
    return L.join('\n');
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildNarrative(input: NarrativeInput): string {
    switch (input.tone) {
        case 'alerta': return buildAlerta(input);
        case 'status': return buildStatus(input);
        case 'executivo':
        default: return buildExecutivo(input);
    }
}
