'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
    CheckCircle2, XCircle, AlertTriangle, Clock, Copy, Printer,
    TrendingUp, TrendingDown, Minus, Zap, Calendar, BarChart3,
    Check, Loader2, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useChartTheme } from '@/lib/chart-theme';
import { formatDuration, formatRelative } from './web-utils';
import type { WebRun } from './web-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 7 | 15 | 30;

interface RawResult {
    run_id: string;
    spec_file: string | null;
    title: string | null;
    status: string | null;
    duration_ms: number | null;
    qa_journey_case_id: string | null;
}

interface JourneyCase {
    id: string;
    title: string;
}

interface TestMetrics {
    title: string;
    shortTitle: string;
    specFile: string;
    executions: number;
    passed: number;
    failed: number;
    flaky: number;
    passRate: number;
    avgDuration: number | null;
    lastStatus: string | null;
    lastRunAt: string | null;
    recentFailed24h: number;
    consecutivePassStreak: number;
    journeyCaseTitle: string | null;
}

interface ProjectMetrics {
    totalRuns: number;
    completedRuns: number;
    passedRuns: number;
    failedRuns: number;
    overallPassRate: number;
    totalExecutions: number;
    totalPassed: number;
    totalFailed: number;
    uniqueTests: number;
    testsAt100: number;
    avgRunDuration: number | null;
    scheduledRuns: number;
    scheduledAllPassed: boolean;
    trend: 'improving' | 'declining' | 'stable';
}

interface TimelinePoint {
    date: string;
    label: string;
    passed: number;
    failed: number;
}

interface Insight {
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    text: string;
}

// ─── Computation ──────────────────────────────────────────────────────────────

function computeAll(
    runs: WebRun[],
    results: RawResult[],
    cases: Map<string, JourneyCase>,
    periodDays: Period,
    now: Date,
) {
    const MS = periodDays * 86_400_000;
    const cutoff = new Date(now.getTime() - MS);
    const cutoff24h = new Date(now.getTime() - 86_400_000);
    const mid = new Date(now.getTime() - MS / 2);

    const periodRuns = runs.filter(r => new Date(r.ended_at || r.created_at) >= cutoff);
    const runMap = new Map(runs.map(r => [r.id, r]));
    const periodRunIds = new Set(periodRuns.map(r => r.id));
    const periodResults = results.filter(r => periodRunIds.has(r.run_id));

    // Group results by test title
    const testMap = new Map<string, {
        results: { status: string | null; duration_ms: number | null; runDate: string }[];
        specFile: string;
        qa_journey_case_id: string | null;
    }>();
    for (const res of periodResults) {
        const run = runMap.get(res.run_id);
        if (!run) continue;
        const key = res.title || res.spec_file || 'unknown';
        if (!testMap.has(key)) testMap.set(key, { results: [], specFile: res.spec_file || '', qa_journey_case_id: res.qa_journey_case_id });
        testMap.get(key)!.results.push({ status: res.status, duration_ms: res.duration_ms, runDate: run.ended_at || run.created_at });
    }

    const testMetrics: TestMetrics[] = Array.from(testMap.entries()).map(([title, data]) => {
        const sorted = [...data.results].sort((a, b) => new Date(b.runDate).getTime() - new Date(a.runDate).getTime());
        const executions = sorted.length;
        const isFailure = (s: string | null) => s === 'failed' || s === 'timedOut' || s === 'interrupted';
        const passed = sorted.filter(r => r.status === 'passed').length;
        const failed = sorted.filter(r => isFailure(r.status)).length;
        const flaky = sorted.filter(r => r.status === 'flaky').length;
        const passRate = executions > 0 ? passed / executions : 0;
        const durations = sorted.map(r => r.duration_ms).filter((d): d is number => d !== null);
        const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
        const recentFailed24h = sorted.filter(r => new Date(r.runDate) >= cutoff24h && isFailure(r.status)).length;
        let streak = 0;
        for (const r of sorted) { if (r.status === 'passed') streak++; else break; }
        // Playwright usa ' › ' (U+203A) como separador; fallback para ' > '
        const parts = title.split(/\s[›>]\s/);
        return {
            title, shortTitle: parts[parts.length - 1] || title,
            specFile: data.specFile, executions, passed, failed, flaky,
            passRate, avgDuration, lastStatus: sorted[0]?.status || null,
            lastRunAt: sorted[0]?.runDate || null, recentFailed24h,
            consecutivePassStreak: streak,
            journeyCaseTitle: data.qa_journey_case_id ? (cases.get(data.qa_journey_case_id)?.title || null) : null,
        };
    }).sort((a, b) => a.passRate - b.passRate);

    const completedRuns = periodRuns.filter(r => r.status === 'passed' || r.status === 'failed');
    const passedRuns = periodRuns.filter(r => r.status === 'passed').length;
    const failedRuns = periodRuns.filter(r => r.status === 'failed').length;
    const overallPassRate = completedRuns.length > 0 ? passedRuns / completedRuns.length : 0;
    const totalExecutions = testMetrics.reduce((s, t) => s + t.executions, 0);
    const totalPassed = testMetrics.reduce((s, t) => s + t.passed, 0);
    const totalFailed = testMetrics.reduce((s, t) => s + t.failed, 0);
    const durations = periodRuns.filter(r => r.duration_ms).map(r => r.duration_ms!);
    const avgRunDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const scheduledRuns = periodRuns.filter(r => r.trigger === 'cron');
    const firstHalf = completedRuns.filter(r => new Date(r.ended_at || r.created_at) < mid);
    const secondHalf = completedRuns.filter(r => new Date(r.ended_at || r.created_at) >= mid);
    const r1 = firstHalf.length > 0 ? firstHalf.filter(r => r.status === 'passed').length / firstHalf.length : null;
    const r2 = secondHalf.length > 0 ? secondHalf.filter(r => r.status === 'passed').length / secondHalf.length : null;
    const trend: ProjectMetrics['trend'] = r1 === null || r2 === null ? 'stable' : r2 > r1 + 0.1 ? 'improving' : r2 < r1 - 0.1 ? 'declining' : 'stable';

    const projectMetrics: ProjectMetrics = {
        totalRuns: periodRuns.length, completedRuns: completedRuns.length,
        passedRuns, failedRuns, overallPassRate, totalExecutions, totalPassed, totalFailed,
        uniqueTests: testMetrics.length, testsAt100: testMetrics.filter(t => t.passRate === 1 && t.executions > 0).length,
        avgRunDuration, scheduledRuns: scheduledRuns.length,
        scheduledAllPassed: scheduledRuns.length > 0 && scheduledRuns.every(r => r.status === 'passed'),
        trend,
    };

    // Timeline
    const dayMap = new Map<string, { passed: number; failed: number }>();
    for (const run of periodRuns) {
        if (run.status !== 'passed' && run.status !== 'failed') continue;
        const d = new Date(run.ended_at || run.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dayMap.has(key)) dayMap.set(key, { passed: 0, failed: 0 });
        const e = dayMap.get(key)!;
        if (run.status === 'passed') e.passed++; else e.failed++;
    }
    const timeline: TimelinePoint[] = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, c]) => {
            const [, mm, dd] = date.split('-');
            return { date, label: `${dd}/${mm}`, passed: c.passed, failed: c.failed };
        });

    return { projectMetrics, testMetrics, timeline };
}

function generateInsights(testMetrics: TestMetrics[], projectMetrics: ProjectMetrics, periodDays: number): Insight[] {
    const ins: Insight[] = [];
    const pl = `últimos ${periodDays} dias`;
    if (projectMetrics.scheduledRuns > 0 && projectMetrics.scheduledAllPassed) {
        ins.push({ type: 'success', title: 'Execuções agendadas', text: `todas as ${projectMetrics.scheduledRuns} execuções programadas ${pl} passaram com sucesso.` });
    }
    for (const t of testMetrics) {
        if (t.executions === 0) continue;
        if (t.passRate === 1 && t.executions >= 3)
            ins.push({ type: 'success', title: t.shortTitle, text: `foi executado ${t.executions}x nos ${pl} e passou em todas as execuções sem apresentar falhas.` });
        if (t.recentFailed24h > 0)
            ins.push({ type: 'warning', title: t.shortTitle, text: `falhou ${t.recentFailed24h}x nas últimas 24h. Tente reproduzir manualmente para confirmar.` });
        if (t.passRate < 0.5 && t.executions >= 3)
            ins.push({ type: 'danger', title: t.shortTitle, text: `instável — falhou em ${t.failed} de ${t.executions} execuções (${Math.round((1 - t.passRate) * 100)}% de falha ${pl}).` });
        else if (t.passRate < 0.8 && t.passRate >= 0.5 && t.executions >= 3)
            ins.push({ type: 'warning', title: t.shortTitle, text: `apresentou falhas em ${t.failed} de ${t.executions} execuções ${pl}. Atenção recomendada.` });
        if (t.consecutivePassStreak >= 10 && t.passRate < 1)
            ins.push({ type: 'info', title: t.shortTitle, text: `em sequência de ${t.consecutivePassStreak} passes consecutivos após instabilidade anterior — tendência de estabilização.` });
    }
    if (projectMetrics.overallPassRate >= 0.95 && projectMetrics.completedRuns >= 3)
        ins.push({ type: 'success', title: 'Saúde geral', text: `suíte altamente estável: ${Math.round(projectMetrics.overallPassRate * 100)}% de taxa de sucesso nos ${pl}.` });
    return ins;
}

function buildSlackSummary(projectName: string, periodDays: number, pm: ProjectMetrics, tests: TestMetrics[], insights: Insight[]): string {
    const pct = Math.round(pm.overallPassRate * 100);
    const emoji = pct >= 90 ? '🟢' : pct >= 70 ? '🟡' : '🔴';
    const today = new Date().toLocaleDateString('pt-BR');
    const lines = [
        `${emoji} *Relatório de Testes Web — ${projectName}*`,
        `Período: últimos ${periodDays} dias | ${today}`,
        '',
        `• Taxa de sucesso: *${pct}%* (${pm.passedRuns}/${pm.completedRuns} runs)`,
        `• Testes únicos: *${pm.uniqueTests}* | Execuções totais: *${pm.totalExecutions}*`,
        pm.avgRunDuration ? `• Duração média por run: *${formatDuration(pm.avgRunDuration)}*` : null,
        '',
    ].filter(l => l !== null) as string[];

    const successes = insights.filter(i => i.type === 'success');
    const warnings = insights.filter(i => i.type === 'warning' || i.type === 'danger');
    if (successes.length) {
        lines.push('✅ *Destaques positivos:*');
        successes.slice(0, 3).forEach(i => lines.push(`  • _${i.title}_ — ${i.text}`));
        lines.push('');
    }
    if (warnings.length) {
        lines.push('⚠️ *Pontos de atenção:*');
        warnings.slice(0, 3).forEach(i => lines.push(`  • _${i.title}_ — ${i.text}`));
        lines.push('');
    }
    const problematic = tests.filter(t => t.passRate < 1 && t.executions > 0).map(t => t.shortTitle);
    const conclusion = pct >= 90 && !warnings.length
        ? 'Suíte estável. Nenhuma ação imediata necessária.'
        : pct >= 70
        ? `Instabilidade moderada. Investigar: ${problematic.slice(0, 3).join(', ')}.`
        : `Suíte com falhas críticas. Ação urgente em ${pm.failedRuns} run(s) falhado(s).`;
    lines.push(`🏁 *Conclusão:* ${conclusion}`);
    return lines.join('\n');
}

function buildPrintHTML(
    projectName: string,
    periodDays: number,
    pm: ProjectMetrics,
    tests: TestMetrics[],
    insights: Insight[],
    timeline: TimelinePoint[],
): string {
    const pct = Math.round(pm.overallPassRate * 100);
    const today = new Date().toLocaleDateString('pt-BR');
    const rateColor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';
    const rateBg   = pct >= 90 ? '#f0fdf4' : pct >= 70 ? '#fffbeb' : '#fef2f2';
    const trendLabel = pm.trend === 'improving' ? '↑ Melhorando' : pm.trend === 'declining' ? '↓ Declinando' : '→ Estável';
    const trendColor = pm.trend === 'improving' ? '#16a34a' : pm.trend === 'declining' ? '#dc2626' : '#64748b';

    // KPI cards
    const kpiCards = [
        { val: `${pct}%`, lbl: 'Taxa de sucesso', sub: `${pm.passedRuns}/${pm.completedRuns} runs`, valColor: rateColor },
        { val: String(pm.totalRuns), lbl: 'Runs no período', sub: `${pm.failedRuns} falhados` },
        { val: String(pm.uniqueTests), lbl: 'Testes únicos', sub: `${pm.testsAt100} com 100%` },
        { val: String(pm.totalExecutions), lbl: 'Execuções totais', sub: `${pm.totalFailed} falhas` },
        { val: formatDuration(pm.avgRunDuration), lbl: 'Duração média', sub: 'por run' },
        { val: trendLabel, lbl: 'Tendência', sub: `${periodDays} dias`, valColor: trendColor },
    ].map(c => `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;min-width:110px;flex:1">
          <div style="font-size:22px;font-weight:700;color:${c.valColor || '#0f172a'};margin-bottom:2px">${c.val}</div>
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600">${c.lbl}</div>
          ${c.sub ? `<div style="font-size:11px;color:#94a3b8;margin-top:1px">${c.sub}</div>` : ''}
        </div>`).join('');

    // Insights
    const insightColors: Record<string, { bg: string; border: string; title: string }> = {
        success: { bg: '#f0fdf4', border: '#22c55e', title: '#16a34a' },
        warning: { bg: '#fffbeb', border: '#f59e0b', title: '#d97706' },
        danger:  { bg: '#fef2f2', border: '#ef4444', title: '#dc2626' },
        info:    { bg: '#eff6ff', border: '#3b82f6', title: '#2563eb' },
    };
    const insightCards = insights.map(i => {
        const s = insightColors[i.type];
        return `<div style="background:${s.bg};border-left:3px solid ${s.border};border-radius:0 8px 8px 0;padding:10px 12px">
          <div style="font-size:11px;font-weight:700;color:${s.title};margin-bottom:2px">${i.title}</div>
          <div style="font-size:11px;color:#475569">${i.text}</div>
        </div>`;
    }).join('');

    // Timeline (CSS bars)
    const maxTotal = Math.max(...timeline.map(t => t.passed + t.failed), 1);
    const timelineBars = timeline.map(t => {
        const total = t.passed + t.failed;
        const passW = Math.round((t.passed / maxTotal) * 100);
        const failW = Math.round((t.failed / maxTotal) * 100);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="width:42px;font-size:10px;color:#64748b;text-align:right;flex-shrink:0">${t.label}</div>
          <div style="flex:1;display:flex;gap:2px;height:14px">
            ${t.passed > 0 ? `<div style="width:${passW}%;background:#22c55e;border-radius:2px;height:100%" title="${t.passed} passou"></div>` : ''}
            ${t.failed > 0 ? `<div style="width:${failW}%;background:#ef4444;border-radius:2px;height:100%" title="${t.failed} falhou"></div>` : ''}
          </div>
          <div style="width:28px;font-size:10px;color:#64748b;flex-shrink:0">${total}</div>
        </div>`;
    }).join('');

    // Test bar chart (CSS)
    const testBars = tests.filter(t => t.executions > 0).map(t => {
        const rate = Math.round(t.passRate * 100);
        const barColor = rate === 100 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <div style="width:200px;font-size:11px;color:#475569;text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.shortTitle}">${t.shortTitle}</div>
          <div style="flex:1;background:#f1f5f9;border-radius:4px;height:18px;overflow:hidden">
            <div style="width:${rate}%;background:${barColor};height:100%;display:flex;align-items:center;justify-content:flex-end;padding-right:5px">
              <span style="font-size:10px;font-weight:700;color:white">${rate}%</span>
            </div>
          </div>
        </div>`;
    }).join('');

    // Test detail table
    const testRows = tests.filter(t => t.executions > 0).map(t => {
        const rate = Math.round(t.passRate * 100);
        const rateC = rate === 100 ? '#16a34a' : rate >= 70 ? '#d97706' : '#dc2626';
        const rateBgC = rate === 100 ? '#f0fdf4' : rate >= 70 ? '#fffbeb' : '#fef2f2';
        const alert = t.recentFailed24h > 0 ? `<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px">⚠ ${t.recentFailed24h} falha 24h</span>` : '';
        return `<tr>
          <td style="padding:6px 8px;vertical-align:top">
            <div style="font-weight:600">${t.shortTitle}${alert}</div>
            <div style="font-size:10px;color:#94a3b8;font-family:monospace">${t.specFile}</div>
            ${t.journeyCaseTitle ? `<div style="font-size:10px;color:#3b82f6;margin-top:1px">🗺 ${t.journeyCaseTitle}</div>` : ''}
          </td>
          <td style="padding:6px 8px;text-align:center">${t.executions}</td>
          <td style="padding:6px 8px;text-align:center"><span style="background:${rateBgC};color:${rateC};font-weight:700;padding:2px 7px;border-radius:4px;font-size:11px">${rate}%</span></td>
          <td style="padding:6px 8px;text-align:center"><span style="color:#16a34a">${t.passed}✓</span>${t.failed > 0 ? ` <span style="color:#dc2626">${t.failed}✗</span>` : ''}${t.flaky > 0 ? ` <span style="color:#d97706">${t.flaky}~</span>` : ''}</td>
          <td style="padding:6px 8px;text-align:center;color:#64748b">${formatDuration(t.avgDuration)}</td>
          <td style="padding:6px 8px;text-align:center"><span style="font-size:10px;text-transform:uppercase;font-weight:600;color:${t.lastStatus === 'passed' ? '#16a34a' : t.lastStatus === 'failed' ? '#dc2626' : '#64748b'}">${t.lastStatus || '—'}</span></td>
        </tr>`;
    }).join('');

    // Conclusion text
    const problematic = tests.filter(t => t.passRate < 1 && t.executions > 0).map(t => t.shortTitle);
    const hasWarnings = insights.some(i => i.type === 'warning' || i.type === 'danger');
    const conclusionText = pct >= 90 && !hasWarnings
        ? 'Suíte altamente estável. Nenhuma ação imediata necessária.'
        : pct >= 70
        ? `Instabilidade moderada detectada. Investigar: ${problematic.slice(0, 3).join(', ')}.`
        : `Suíte com falhas críticas. Ação urgente necessária em ${pm.failedRuns} run(s) falhado(s).`;
    const conclusionBg = pct >= 90 && !hasWarnings ? '#f0fdf4' : pct >= 70 ? '#fffbeb' : '#fef2f2';
    const conclusionBorder = pct >= 90 && !hasWarnings ? '#bbf7d0' : pct >= 70 ? '#fde68a' : '#fecaca';

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Testes Web — ${projectName}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:36px;font-size:13px;line-height:1.5;background:#fff}
  h1{font-size:20px;font-weight:700;margin:0 0 4px}
  h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
  table{width:100%;border-collapse:collapse}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:600;padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0}
  td{border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .legend{display:flex;gap:16px;font-size:11px;color:#64748b;margin-bottom:8px}
  .legend span{display:flex;align-items:center;gap:4px}
  .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  @page{margin:20mm}
  @media print{body{padding:0}}
</style>
</head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0">
  <div>
    <h1>📊 Relatório de Testes Web — ${projectName}</h1>
    <p style="margin:0;color:#64748b;font-size:12px">Período: últimos <strong>${periodDays} dias</strong> &nbsp;·&nbsp; Gerado em <strong>${today}</strong></p>
  </div>
  <div style="background:${rateBg};border:1px solid ${rateColor}33;border-radius:10px;padding:10px 20px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:${rateColor};line-height:1">${pct}%</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">Taxa de sucesso</div>
  </div>
</div>

<h2>Métricas do Período</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">${kpiCards}</div>

${timeline.length > 0 ? `
<h2>Execuções por Dia</h2>
<div class="legend">
  <span><span class="dot" style="background:#22c55e"></span>Passou</span>
  <span><span class="dot" style="background:#ef4444"></span>Falhou</span>
</div>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">${timelineBars}</div>
` : ''}

${insights.length > 0 ? `
<h2>Insights Automáticos</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${insightCards}</div>
` : ''}

<h2>Estabilidade por Teste — Pass Rate</h2>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px">${testBars}</div>

<h2>Detalhamento por Teste</h2>
<table>
  <thead><tr>
    <th>Teste</th><th style="text-align:center">Execuções</th><th style="text-align:center">Pass Rate</th>
    <th style="text-align:center">P / F / ~</th><th style="text-align:center">Duração Avg</th><th style="text-align:center">Último Status</th>
  </tr></thead>
  <tbody>${testRows}</tbody>
</table>

<div style="background:${conclusionBg};border:1px solid ${conclusionBorder};border-radius:8px;padding:16px;margin-top:28px">
  <div style="font-size:13px;font-weight:700;margin-bottom:6px">🏁 Conclusão</div>
  <p style="margin:0;color:#334155">${conclusionText}</p>
  ${pm.scheduledRuns > 0 ? `<p style="margin:6px 0 0;color:#334155">Agendamentos: ${pm.scheduledAllPassed ? `<span style="color:#16a34a;font-weight:600">${pm.scheduledRuns} run(s) programado(s) — todos passaram.</span>` : `<span style="color:#d97706;font-weight:600">Atenção em ${pm.scheduledRuns} run(s) agendado(s).</span>`}</p>` : ''}
</div>

<p style="margin-top:24px;font-size:10px;color:#94a3b8;text-align:center">Relatório gerado pelo QAMind &nbsp;·&nbsp; ${today}</p>
</body></html>`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-surface-muted/50 rounded-xl border border-border p-4 flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
            <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
    );
}

const INSIGHT_STYLES = {
    success: { border: 'border-success/30', bg: 'bg-success/5', icon: CheckCircle2, iconClass: 'text-success', titleClass: 'text-success' },
    warning: { border: 'border-warning/30', bg: 'bg-warning/5', icon: AlertTriangle, iconClass: 'text-warning', titleClass: 'text-warning' },
    danger:  { border: 'border-danger/30',  bg: 'bg-danger/5',  icon: XCircle,      iconClass: 'text-danger',  titleClass: 'text-danger' },
    info:    { border: 'border-border',      bg: 'bg-surface-muted/50', icon: Zap, iconClass: 'text-brand', titleClass: 'text-brand' },
} as const;

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
    projectId: string;
    runs: WebRun[];
}

export function WebResultsReport({ projectId, runs }: Props) {
    const chart = useChartTheme();
    const [period, setPeriod] = useState<Period>(15);
    const [results, setResults] = useState<RawResult[]>([]);
    const [cases, setCases] = useState<Map<string, JourneyCase>>(new Map());
    const [projectName, setProjectName] = useState('Projeto Web');
    const [loadingData, setLoadingData] = useState(true);
    const [copied, setCopied] = useState(false);

    const fetchData = useCallback(async () => {
        if (runs.length === 0) { setLoadingData(false); return; }
        setLoadingData(true);
        const runIds = runs.map(r => r.id);
        const [{ data: projData }, { data: resData }] = await Promise.all([
            supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
            supabase.from('web_test_results')
                .select('run_id, spec_file, title, status, duration_ms, qa_journey_case_id')
                .in('run_id', runIds),
        ]);
        if (projData) setProjectName((projData as { name: string }).name);
        const rawResults = (resData || []) as RawResult[];
        setResults(rawResults);

        // Fetch linked journey cases
        const caseIds = [...new Set(rawResults.map(r => r.qa_journey_case_id).filter(Boolean) as string[])];
        if (caseIds.length > 0) {
            const { data: caseData } = await supabase
                .from('qa_journey_cases')
                .select('id, title')
                .in('id', caseIds);
            const caseMap = new Map<string, JourneyCase>();
            for (const c of (caseData || []) as JourneyCase[]) caseMap.set(c.id, c);
            setCases(caseMap);
        }
        setLoadingData(false);
    }, [projectId, runs]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const now = useMemo(() => new Date(), []);
    const { projectMetrics: pm, testMetrics, timeline } = useMemo(
        () => computeAll(runs, results, cases, period, now),
        [runs, results, cases, period, now],
    );
    const insights = useMemo(() => generateInsights(testMetrics, pm, period), [testMetrics, pm, period]);

    const passRatePct = Math.round(pm.overallPassRate * 100);
    const passRateColor = passRatePct >= 90 ? 'text-success' : passRatePct >= 70 ? 'text-warning' : 'text-danger';

    const slackText = useMemo(
        () => buildSlackSummary(projectName, period, pm, testMetrics, insights),
        [projectName, period, pm, testMetrics, insights],
    );

    const handleCopy = async () => {
        await navigator.clipboard.writeText(slackText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = () => {
        const html = buildPrintHTML(projectName, period, pm, testMetrics, insights, timeline);
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.onload = () => { w.print(); };
    };

    if (loadingData) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando relatório…
            </div>
        );
    }

    if (runs.length === 0) {
        return (
            <div className="text-center py-16 text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Nenhuma execução registrada</p>
                <p className="text-xs mt-1">Execute os testes para começar a gerar relatórios.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">

            {/* Header da aba: período + ações */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 bg-foreground/5 border border-border rounded-lg p-1">
                    {([7, 15, 30] as Period[]).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${period === p ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:text-foreground'}`}>
                            {p} dias
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => void fetchData()} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Atualizar dados">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all inline-flex items-center gap-1.5">
                        <Printer className="w-3.5 h-3.5" /> Exportar PDF
                    </button>
                    <button onClick={() => void handleCopy()} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all inline-flex items-center gap-1.5 ${copied ? 'bg-success/10 border-success/30 text-success' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                        {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar para Slack</>}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard label="Taxa de sucesso" value={`${passRatePct}%`} sub={`${pm.passedRuns} / ${pm.completedRuns} runs`} color={passRateColor} />
                <KpiCard label="Runs no período" value={String(pm.totalRuns)} sub={`${pm.failedRuns} falhados`} />
                <KpiCard label="Testes únicos" value={String(pm.uniqueTests)} sub={`${pm.testsAt100} com 100%`} />
                <KpiCard label="Execuções totais" value={String(pm.totalExecutions)} sub={`${pm.totalFailed} falhas`} />
                <KpiCard
                    label="Tendência"
                    value={pm.trend === 'improving' ? 'Melhorando' : pm.trend === 'declining' ? 'Caindo' : 'Estável'}
                    color={pm.trend === 'improving' ? 'text-success' : pm.trend === 'declining' ? 'text-danger' : 'text-muted-foreground'}
                />
            </div>

            {/* Linha: timeline + pizza */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Timeline */}
                <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-foreground">Execuções por dia</span>
                        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" />Passou</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger inline-block" />Falhou</span>
                        </div>
                    </div>
                    {timeline.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={160}>
                            <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: chart.axis }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: chart.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} />
                                <Area type="monotone" dataKey="passed" name="Passou" stackId="1" stroke={chart.series.passed} fill={chart.series.passed} fillOpacity={0.15} strokeWidth={2} dot={false} />
                                <Area type="monotone" dataKey="failed" name="Falhou" stackId="1" stroke={chart.series.failed} fill={chart.series.failed} fillOpacity={0.15} strokeWidth={2} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Distribuição */}
                <div className="bg-card rounded-xl border border-border p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-foreground">Distribuição</span>
                    </div>
                    {pm.completedRuns === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={130}>
                                <PieChart>
                                    <Pie data={[
                                        { name: 'Passou', value: pm.passedRuns },
                                        { name: 'Falhou', value: pm.failedRuns },
                                        ...(pm.totalRuns - pm.completedRuns > 0 ? [{ name: 'Outros', value: pm.totalRuns - pm.completedRuns }] : []),
                                    ]} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" strokeWidth={0}>
                                        <Cell fill={chart.series.passed} />
                                        <Cell fill={chart.series.failed} />
                                        <Cell fill={chart.series.muted} />
                                    </Pie>
                                    <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-col gap-1.5 mt-auto">
                                <div className="flex justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-success" />Passou</span><span className="font-bold text-foreground">{pm.passedRuns}</span></div>
                                <div className="flex justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-danger" />Falhou</span><span className="font-bold text-foreground">{pm.failedRuns}</span></div>
                                {pm.totalRuns - pm.completedRuns > 0 && <div className="flex justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-foreground/20" />Outros</span><span className="font-bold text-foreground">{pm.totalRuns - pm.completedRuns}</span></div>}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Insights */}
            {insights.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap className="w-4 h-4 text-brand" />
                        <span className="text-sm font-bold text-foreground">Insights</span>
                        <span className="text-[10px] bg-brand/10 text-brand rounded-full px-2 py-0.5 font-bold">{insights.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {insights.map((ins, i) => {
                            const s = INSIGHT_STYLES[ins.type];
                            const Icon = s.icon;
                            return (
                                <div key={i} className={`flex gap-2.5 p-3 rounded-lg border ${s.border} ${s.bg}`}>
                                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.iconClass}`} />
                                    <div>
                                        <p className={`text-xs font-bold ${s.titleClass}`}>{ins.title}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{ins.text}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Estabilidade por teste */}
            {testMetrics.length > 0 && (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-foreground">Estabilidade por Teste</span>
                        <span className="text-xs text-muted-foreground ml-auto">{testMetrics.filter(t => t.executions > 0).length} testes</span>
                    </div>

                    {/* Mini bar chart: pass rate */}
                    <div className="px-4 pt-4 pb-2">
                        <ResponsiveContainer width="100%" height={Math.min(testMetrics.filter(t => t.executions > 0).length * 32 + 20, 280)}>
                            <BarChart
                                data={testMetrics.filter(t => t.executions > 0).map(t => {
                                    const name = t.shortTitle.length > 28 ? t.shortTitle.slice(0, 25) + '…' : t.shortTitle;
                                    return { name, rate: Math.round(t.passRate * 100) };
                                })}
                                layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: chart.axis }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: chart.axis }} tickLine={false} axisLine={false} width={160} />
                                <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} formatter={(v) => [`${v}%`, 'Pass rate']} />
                                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                                    {testMetrics.filter(t => t.executions > 0).map((t, i) => (
                                        <Cell key={i} fill={t.passRate === 1 ? chart.series.passed : t.passRate >= 0.7 ? chart.series.running : chart.series.failed} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Tabela detalhada */}
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-xs min-w-[640px]">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-t border-b border-border bg-surface-muted/50">
                                    <th className="px-4 py-2 text-left font-bold">Teste</th>
                                    <th className="px-4 py-2 text-left font-bold">Execuções</th>
                                    <th className="px-4 py-2 text-left font-bold">Pass rate</th>
                                    <th className="px-4 py-2 text-left font-bold">P / F / ~</th>
                                    <th className="px-4 py-2 text-left font-bold">Duração avg</th>
                                    <th className="px-4 py-2 text-left font-bold">Última exec.</th>
                                    <th className="px-4 py-2 text-left font-bold">Jornada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {testMetrics.filter(t => t.executions > 0).map((t, i) => {
                                    const rate = Math.round(t.passRate * 100);
                                    const rateColor = rate === 100 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-danger';
                                    const statusColor = t.lastStatus === 'passed' ? 'bg-success/10 text-success' : t.lastStatus === 'failed' ? 'bg-danger/10 text-danger' : t.lastStatus === 'flaky' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground';
                                    return (
                                        <tr key={i} className="hover:bg-accent/30 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-foreground">{t.shortTitle}</div>
                                                {t.specFile && <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{t.specFile}</div>}
                                                {t.recentFailed24h > 0 && <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-danger font-bold"><AlertTriangle className="w-2.5 h-2.5" />{t.recentFailed24h} falha(s) 24h</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{t.executions}</td>
                                            <td className={`px-4 py-2.5 font-bold ${rateColor}`}>{rate}%</td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-success">{t.passed}✓</span>
                                                {t.failed > 0 && <span className="text-danger ml-1">{t.failed}✗</span>}
                                                {t.flaky > 0 && <span className="text-warning ml-1">{t.flaky}~</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{formatDuration(t.avgDuration)}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor}`}>
                                                    {t.lastStatus || '—'}
                                                </span>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(t.lastRunAt)}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground text-[10px]">{t.journeyCaseTitle || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Conclusão */}
            <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-brand" />
                    <span className="text-sm font-bold text-foreground">Conclusão do relatório</span>
                </div>
                <ConclusionBlock pm={pm} tests={testMetrics} periodDays={period} />
                <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Resumo para Slack</p>
                    <pre className="text-[11px] text-muted-foreground bg-surface-muted/60 rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-mono select-all overflow-x-auto custom-scrollbar">{slackText}</pre>
                    <button onClick={() => void handleCopy()} className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all inline-flex items-center gap-1.5 ${copied ? 'bg-success/10 border-success/30 text-success' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                        {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ConclusionBlock({ pm, tests, periodDays }: { pm: ProjectMetrics; tests: TestMetrics[]; periodDays: number }) {
    const pct = Math.round(pm.overallPassRate * 100);
    const problematic = tests.filter(t => t.passRate < 1 && t.executions > 0);
    const stable = tests.filter(t => t.passRate === 1 && t.executions > 0);

    const trendIcon = pm.trend === 'improving' ? TrendingUp : pm.trend === 'declining' ? TrendingDown : Minus;
    const TrendIcon = trendIcon;
    const trendColor = pm.trend === 'improving' ? 'text-success' : pm.trend === 'declining' ? 'text-danger' : 'text-muted-foreground';
    const trendLabel = pm.trend === 'improving' ? 'Melhorando' : pm.trend === 'declining' ? 'Declinando' : 'Estável';

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${pct >= 90 ? 'bg-success/10 text-success' : pct >= 70 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>
                    {pct >= 90 ? <CheckCircle2 className="w-4 h-4" /> : pct >= 70 ? <AlertTriangle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {pct}% de sucesso nos últimos {periodDays} dias
                </div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-foreground/5 ${trendColor}`}>
                    <TrendIcon className="w-4 h-4" /> {trendLabel}
                </div>
                {pm.avgRunDuration && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-foreground/5 text-muted-foreground">
                        <Clock className="w-4 h-4" /> Média {formatDuration(pm.avgRunDuration)}
                    </div>
                )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
                {pct >= 90 && stable.length > 0 && (
                    <>{stable.length} teste{stable.length > 1 ? 's' : ''} com 100% de aprovação. </>
                )}
                {problematic.length > 0 && (
                    <>Testes com instabilidade: <strong className="text-foreground">{problematic.map(t => t.shortTitle).slice(0, 3).join(', ')}{problematic.length > 3 ? ` e mais ${problematic.length - 3}` : ''}</strong>. </>
                )}
                {pm.scheduledRuns > 0 && (
                    <>Agendamentos: {pm.scheduledAllPassed ? <span className="text-success font-medium">{pm.scheduledRuns} run(s) automático(s), todos passaram.</span> : <span className="text-warning font-medium">Atenção em {pm.scheduledRuns} run(s) agendado(s).</span>} </>
                )}
                {problematic.length === 0 && pct >= 90 && <>Nenhuma ação imediata necessária.</>}
            </p>
        </div>
    );
}
