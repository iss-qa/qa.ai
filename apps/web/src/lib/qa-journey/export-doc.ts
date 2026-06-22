// Exporta jornadas/sub-fluxos/casos da Jornada do QA para um documento
// Markdown (.md) ou HTML (.html) — o INVERSO do import de HTML. O .md é o
// formato mais fiel para reimportar em ferramentas como o Outline; o .html sai
// estilizado (self-contained, sem assets externos) para leitura/print.
//
// Client-only no uso (download via Blob), mas as funções de build são puras.

import { PRIORITY_OPTIONS, RUN_STATUS_OPTIONS } from './constants';
import type { QAJourney, QAJourneyCase, QAJourneySubflow } from '@/types/qa-journey';

// Estrutura normalizada que o modal monta a partir da seleção do usuário.
export interface ExportSubflow {
    subflow: QAJourneySubflow;
    cases: QAJourneyCase[];   // já filtrados para os casos selecionados
    depth: number;            // profundidade na árvore (heading level)
}
export interface ExportJourney {
    journey: QAJourney;
    subflows: ExportSubflow[];
}

const priorityLabel = (p: QAJourneyCase['priority']) =>
    PRIORITY_OPTIONS.find(o => o.value === p)?.label || p;
const statusLabel = (s: QAJourneyCase['last_run_status']) =>
    (s && RUN_STATUS_OPTIONS.find(o => o.value === s)?.label) || '—';

// Corpo do caso conforme o modo de escrita.
function caseBody(c: QAJourneyCase): { gherkin?: string; steps?: string; expected?: string; description?: string } {
    if (c.writing_mode === 'gherkin' && c.gherkin?.trim()) {
        return { gherkin: c.gherkin.trim(), expected: c.expected_result?.trim() || undefined };
    }
    return {
        description: c.description?.trim() || undefined,
        steps: c.steps_summary?.trim() || undefined,
        expected: c.expected_result?.trim() || undefined,
    };
}

function metaLine(c: QAJourneyCase): string {
    const parts = [`Prioridade: ${priorityLabel(c.priority)}`];
    if (c.platform) parts.push(`Plataforma: ${c.platform}`);
    const automated = Boolean(c.test_case_id)
        || (c.automation_engine === 'playwright' && Boolean(c.playwright_path || c.playwright_repo));
    parts.push(`Automação: ${automated ? 'Automatizado' : 'Manual'}`);
    parts.push(`Status: ${statusLabel(c.last_run_status)}`);
    return parts.join(' · ');
}

function caseHeading(c: QAJourneyCase): string {
    return c.external_id ? `${c.external_id} — ${c.title}` : c.title;
}

// =====================================================================
// MARKDOWN
// =====================================================================

const mdCell = (s: string | null | undefined) =>
    (s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';

export function buildMarkdown(journeys: ExportJourney[]): string {
    const out: string[] = [];
    journeys.forEach((j, ji) => {
        if (ji > 0) out.push('\n---\n');
        out.push(`# ${j.journey.title}`);
        if (j.journey.description?.trim()) out.push(`\n> ${j.journey.description.trim()}`);

        for (const sf of j.subflows) {
            const hashes = '#'.repeat(Math.min(2 + sf.depth, 6));
            out.push(`\n${hashes} ${sf.subflow.title}`);
            if (sf.subflow.description?.trim()) out.push(`\n${sf.subflow.description.trim()}`);

            if (sf.cases.length > 0) {
                // Tabela-resumo dos casos.
                out.push('\n| ID | Caso | Prioridade | Plataforma | Status |');
                out.push('| --- | --- | --- | --- | --- |');
                for (const c of sf.cases) {
                    out.push(`| ${mdCell(c.external_id)} | ${mdCell(c.title)} | ${mdCell(priorityLabel(c.priority))} | ${mdCell(c.platform)} | ${mdCell(statusLabel(c.last_run_status))} |`);
                }

                // Detalhe de cada caso.
                for (const c of sf.cases) {
                    const subHashes = '#'.repeat(Math.min(3 + sf.depth, 6));
                    out.push(`\n${subHashes} ${caseHeading(c)}`);
                    out.push(`\n*${metaLine(c)}*`);
                    const body = caseBody(c);
                    if (body.gherkin) out.push('\n```gherkin\n' + body.gherkin + '\n```');
                    if (body.description) out.push(`\n${body.description}`);
                    if (body.steps) out.push(`\n**Passos:**\n\n${body.steps}`);
                    if (body.expected) out.push(`\n**Resultado esperado:** ${body.expected}`);
                    // Evidência: imagem inline; vídeo vira link.
                    if (c.evidence_url && c.evidence_type === 'image') out.push(`\n![Evidência](${c.evidence_url})`);
                    else if (c.evidence_url) out.push(`\n[Evidência (${c.evidence_type || 'arquivo'})](${c.evidence_url})`);
                }
            }
        }
    });
    return out.join('\n').trim() + '\n';
}

// =====================================================================
// HTML (estilizado, self-contained)
// =====================================================================

const esc = (s: string | null | undefined) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Texto com quebras de linha → parágrafos/brs.
const escMultiline = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

// Opções do build HTML: mapa url→dataURI das evidências (embutidas) e cor de
// acento (cor da jornada). imageMap é montado no client antes do build.
export interface HtmlBuildOptions {
    imageMap?: Record<string, string>;
    accentColor?: string;
}

const PRIORITY_CLASS: Record<string, string> = {
    critical: 'b-red', high: 'b-orange', medium: 'b-amber', low: 'b-green',
};
const STATUS_CLASS: Record<string, string> = {
    pass: 'b-green', fail: 'b-red', skipped: 'b-gray', not_run: 'b-gray',
};

function isAutomated(c: QAJourneyCase): boolean {
    return Boolean(c.test_case_id)
        || (c.automation_engine === 'playwright' && Boolean(c.playwright_path || c.playwright_repo));
}

function badges(c: QAJourneyCase): string {
    const out = [`<span class="badge ${PRIORITY_CLASS[c.priority] || 'b-gray'}">${esc(priorityLabel(c.priority))}</span>`];
    if (c.platform) out.push(`<span class="badge b-blue">${esc(c.platform)}</span>`);
    out.push(isAutomated(c) ? `<span class="badge b-green">Automatizado</span>` : `<span class="badge b-gray">Manual</span>`);
    if (c.last_run_status) out.push(`<span class="badge ${STATUS_CLASS[c.last_run_status] || 'b-gray'}">${esc(statusLabel(c.last_run_status))}</span>`);
    return `<div class="badges">${out.join('')}</div>`;
}

function evidenceHtml(c: QAJourneyCase, imageMap?: Record<string, string>): string {
    if (!c.evidence_url) return '';
    if (c.evidence_type === 'image') {
        const src = imageMap?.[c.evidence_url] || c.evidence_url; // data URI embutido, ou URL
        return `<figure class="evidence"><img src="${esc(src)}" alt="Evidência de ${esc(c.title)}" loading="lazy"><figcaption>Evidência</figcaption></figure>`;
    }
    return `<p class="evidence-link">📎 <a href="${esc(c.evidence_url)}" target="_blank" rel="noopener">Evidência (${esc(c.evidence_type || 'arquivo')})</a></p>`;
}

function htmlBody(j: ExportJourney, opts: HtmlBuildOptions): string {
    const out: string[] = [];
    const accent = j.journey.color || opts.accentColor || '#2563eb';

    out.push(`<header class="cover" style="--accent:${esc(accent)}">`);
    out.push(`<div class="kicker">Documentação de QA</div>`);
    out.push(`<h1>${esc(j.journey.title)}</h1>`);
    if (j.journey.description?.trim()) out.push(`<p class="lead">${escMultiline(j.journey.description.trim())}</p>`);
    out.push(`</header>`);
    out.push(`<div class="inner" style="--accent:${esc(accent)}">`);

    for (const sf of j.subflows) {
        const lvl = Math.min(2 + sf.depth, 4);
        out.push(`<h${lvl} class="subflow">${esc(sf.subflow.title)}</h${lvl}>`);
        if (sf.subflow.description?.trim()) out.push(`<p class="muted">${escMultiline(sf.subflow.description.trim())}</p>`);

        if (sf.cases.length > 0) {
            // Índice (tabela-resumo).
            out.push('<table class="summary"><thead><tr><th>ID</th><th>Caso</th><th>Prioridade</th><th>Plataforma</th><th>Status</th></tr></thead><tbody>');
            for (const c of sf.cases) {
                out.push(`<tr><td class="mono">${esc(c.external_id) || '—'}</td><td>${esc(c.title)}</td><td>${esc(priorityLabel(c.priority))}</td><td>${esc(c.platform) || '—'}</td><td>${esc(statusLabel(c.last_run_status))}</td></tr>`);
            }
            out.push('</tbody></table>');

            // Detalhe de cada caso em "card".
            for (const c of sf.cases) {
                out.push('<section class="case">');
                out.push(`<h4 class="case-title">${esc(caseHeading(c))}</h4>`);
                out.push(badges(c));
                const body = caseBody(c);
                if (body.gherkin) out.push(`<pre class="gherkin"><code>${esc(body.gherkin)}</code></pre>`);
                if (body.description) out.push(`<p>${escMultiline(body.description)}</p>`);
                if (body.steps) out.push(`<div class="field"><span class="field-label">Passos</span><p>${escMultiline(body.steps)}</p></div>`);
                if (body.expected) out.push(`<div class="field expected"><span class="field-label">✓ Resultado esperado</span><p>${escMultiline(body.expected)}</p></div>`);
                out.push(evidenceHtml(c, opts.imageMap));
                out.push('</section>');
            }
        }
    }
    out.push('</div>'); // .inner
    return out.join('\n');
}

export function buildHtml(journeys: ExportJourney[], opts: HtmlBuildOptions = {}): string {
    const title = journeys.length === 1 ? journeys[0].journey.title : 'Jornadas do QA';
    const sections = journeys.map(j => htmlBody(j, opts)).join('\n<hr class="journey-sep">\n');
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; --accent: #2563eb; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; background: #f1f5f9; line-height: 1.65; margin: 0; padding: 40px 20px; }
  .doc { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 16px;
         box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 12px 40px -12px rgba(0,0,0,.18); overflow: hidden; }
  .inner { padding: 0 40px 40px; }
  .cover { padding: 36px 40px 28px; border-top: 5px solid var(--accent);
           background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, #fff), #fff); }
  .cover .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: .7rem; font-weight: 700; color: var(--accent); }
  .cover h1 { font-size: 2.1rem; font-weight: 800; margin: .35rem 0 0; letter-spacing: -.02em; color: #0f172a; }
  .cover .lead { color: #475569; font-size: 1.02rem; margin: .75rem 0 0; }
  h2.subflow, h3.subflow, h4.subflow { margin: 2.2rem 0 .25rem; font-weight: 700; color: #0f172a;
           padding-left: .6rem; border-left: 4px solid var(--accent); }
  h2.subflow { font-size: 1.45rem; } h3.subflow { font-size: 1.2rem; } h4.subflow { font-size: 1.05rem; }
  .muted { color: #64748b; margin: .15rem 0 0; }
  table.summary { width: 100%; border-collapse: collapse; margin: 1rem 0 1.5rem; font-size: .88rem;
           border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  table.summary th, table.summary td { padding: .55rem .8rem; text-align: left; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  table.summary thead th { background: #f8fafc; font-weight: 700; color: #334155; font-size: .76rem; text-transform: uppercase; letter-spacing: .04em; }
  table.summary tbody tr:last-child td { border-bottom: 0; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .8rem; color: #64748b; }
  .case { border: 1px solid #e9eef5; border-radius: 12px; padding: 16px 18px; margin: 14px 0; background: #fff; }
  .case-title { margin: 0; font-size: 1.02rem; font-weight: 700; color: #0f172a; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: .55rem 0 .35rem; }
  .badge { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
           padding: 3px 9px; border-radius: 999px; line-height: 1.4; }
  .b-red { background:#fee2e2; color:#b91c1c; } .b-orange { background:#ffedd5; color:#c2410c; }
  .b-amber { background:#fef3c7; color:#b45309; } .b-green { background:#dcfce7; color:#15803d; }
  .b-blue { background:#dbeafe; color:#1d4ed8; } .b-gray { background:#eef2f7; color:#475569; }
  .field { margin: .7rem 0; } .field-label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase;
           letter-spacing:.05em; color:#64748b; margin-bottom:.15rem; }
  .field.expected { border-left: 3px solid #22c55e; padding-left: .7rem; } .field.expected .field-label { color:#15803d; }
  .field p, .case > p { margin: 0; }
  pre.gherkin { background:#0f172a; color:#e2e8f0; border-radius:10px; padding: 14px 16px; overflow-x:auto; margin:.6rem 0; }
  pre.gherkin code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.82rem; white-space:pre; }
  figure.evidence { margin: .8rem 0 0; }
  figure.evidence img { max-width: 100%; border-radius: 10px; border: 1px solid #e5e7eb; display:block; }
  figure.evidence figcaption { font-size: .72rem; color:#94a3b8; margin-top:.3rem; }
  .evidence-link a { color: var(--accent); }
  hr.journey-sep { border:none; border-top: 1px dashed #cbd5e1; margin: 2.5rem 0; }
  footer { text-align:center; color:#94a3b8; font-size:.72rem; padding: 18px; }
</style>
</head>
<body>
<div class="doc">
${sections}
</div>
<footer>Exportado do QA Mind</footer>
</body>
</html>`;
}

// Baixa imagens (evidências) e devolve um mapa url → data URI, para o HTML
// exportado ficar self-contained (imagens aparecem ao reimportar). Falhas
// (CORS/offline) são ignoradas — o HTML cai para a URL original.
export async function fetchImagesAsDataUris(urls: string[]): Promise<Record<string, string>> {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    const map: Record<string, string> = {};
    await Promise.all(unique.map(async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const blob = await res.blob();
            if (blob.size > 5 * 1024 * 1024) return; // evita inflar demais o doc
            const dataUri = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result || ''));
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
            if (dataUri) map[url] = dataUri;
        } catch { /* mantém a URL original */ }
    }));
    return map;
}

// =====================================================================
// Download
// =====================================================================

export function downloadTextFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Nome de arquivo seguro a partir de um título.
export function slugifyFilename(s: string): string {
    return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'jornada';
}
