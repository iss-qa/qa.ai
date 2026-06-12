'use client';

// Modal "Exportação da execução de teste" (estilo Repeato): TestRail, Jira e
// Relatórios em PDF. PDF é gerado localmente a partir dos passos da última
// execução; TestRail/Jira dependem de conector configurado em Integrações.

import Link from 'next/link';
import { ExternalLink, FileDown, X } from 'lucide-react';
import type { TestStep } from '../editor-types';

interface ExportResultModalProps {
    testName: string;
    projectName: string;
    steps: TestStep[];
    onClose: () => void;
}

function stepStatusLabel(status: string): { label: string; color: string } {
    if (status === 'passed' || status === 'success') return { label: 'PASS', color: '#16a34a' };
    if (status === 'failed' || status === 'error') return { label: 'FAIL', color: '#dc2626' };
    if (status === 'running') return { label: 'EXECUTANDO', color: '#d97706' };
    return { label: '—', color: '#64748b' };
}

// Abre uma janela com o relatório formatado e dispara a impressão — o
// usuário salva como PDF pelo diálogo nativo (sem dependência de lib).
function printPdfReport(testName: string, projectName: string, steps: TestStep[]) {
    const generatedAt = new Date().toLocaleString('pt-BR');
    const passed = steps.filter(s => s.status === 'passed' || s.status === 'success').length;
    const failed = steps.filter(s => s.status === 'failed' || s.status === 'error').length;
    const verdict = failed > 0 ? 'FALHA' : passed > 0 ? 'SUCESSO' : 'NÃO EXECUTADO';
    const verdictColor = failed > 0 ? '#dc2626' : passed > 0 ? '#16a34a' : '#64748b';

    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rows = steps.map((s, i) => {
        const st = stepStatusLabel(s.status);
        return `<tr>
            <td class="num">${i + 1}</td>
            <td class="mono">${esc(s.action || '')}</td>
            <td>${esc(s.target || '')}${s.value ? `<div class="value">valor: "${esc(s.value)}"</div>` : ''}</td>
            <td><span class="badge" style="color:${st.color};border-color:${st.color}">${st.label}</span></td>
            <td class="err">${esc(s.error_message || '')}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório — ${esc(testName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  .verdict { display: inline-block; font-weight: 800; font-size: 14px; padding: 4px 12px; border: 2px solid ${verdictColor}; color: ${verdictColor}; border-radius: 8px; margin-bottom: 16px; }
  .summary { font-size: 12px; color: #334155; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 2px solid #e2e8f0; padding: 8px 10px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; }
  .num { color: #94a3b8; width: 32px; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .value { color: #64748b; font-size: 11px; margin-top: 2px; }
  .badge { font-size: 10px; font-weight: 800; border: 1px solid; border-radius: 6px; padding: 1px 8px; }
  .err { color: #dc2626; font-size: 11px; max-width: 260px; }
  .footer { margin-top: 28px; color: #94a3b8; font-size: 10px; }
</style></head><body>
  <h1>Relatório de execução — ${esc(testName)}</h1>
  <div class="meta">Projeto: ${esc(projectName || '—')} · Gerado em ${generatedAt} · QAMind</div>
  <div class="verdict">${verdict}</div>
  <div class="summary">${steps.length} passos · ${passed} pass · ${failed} fail</div>
  <table>
    <thead><tr><th>#</th><th>Ação</th><th>Alvo</th><th>Status</th><th>Erro</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">QAMind — relatório gerado localmente. Use "Salvar como PDF" no diálogo de impressão.</div>
<script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        alert('Pop-up bloqueado — permita pop-ups para gerar o PDF.');
        return;
    }
    win.document.write(html);
    win.document.close();
}

export function ExportResultModal({ testName, projectName, steps, onClose }: ExportResultModalProps) {
    const hasRun = steps.some(s => s.status && s.status !== 'idle');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
                <div className="p-5 border-b border-border flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Exportação da execução de teste</h2>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                            Relatórios em PDF são gerados localmente; exportações para Jira e TestRail usam os
                            conectores configurados em Integrações.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent" aria-label="Fechar">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* TestRail */}
                        <div className="border border-border rounded-xl p-4 flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-foreground">Exportações do TestRail</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                                Você só pode exportar para o TestRail depois de configurar um conector TestRail.
                                Conector em desenvolvimento — em breve nas Configurações.
                            </p>
                            <p className="text-[11px] text-muted-foreground italic">Nenhuma exportação criada ainda.</p>
                            <button
                                disabled
                                className="border border-border rounded-lg py-2 text-xs font-bold text-muted-foreground opacity-50 cursor-not-allowed"
                                title="Conector TestRail em breve"
                            >
                                CRIAR NOVO
                            </button>
                        </div>

                        {/* Jira */}
                        <div className="border border-border rounded-xl p-4 flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-foreground">Problemas Jira</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                                Você só pode exportar para o Jira com um conector configurado.{' '}
                                <Link href="/dashboard/settings/integrations" className="text-brand hover:underline inline-flex items-center gap-0.5">
                                    Configurar nas Integrações <ExternalLink className="w-3 h-3" />
                                </Link>
                            </p>
                            <p className="text-[11px] text-muted-foreground italic">Nenhum problema do Jira criado ainda.</p>
                            <button
                                disabled
                                className="border border-border rounded-lg py-2 text-xs font-bold text-muted-foreground opacity-50 cursor-not-allowed"
                                title="Exportação para Jira em breve — configure o conector em Integrações"
                            >
                                CRIAR NOVO
                            </button>
                        </div>
                    </div>

                    {/* PDF */}
                    <div className="border border-border rounded-xl p-4 flex flex-col gap-2">
                        <h3 className="text-sm font-bold text-foreground">Relatórios em PDF</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Relatório da última execução deste teste: veredito, passos com status PASS/FAIL e erros.
                        </p>
                        {!hasRun && (
                            <p className="text-[11px] text-warning">
                                Este teste ainda não foi executado nesta sessão — o relatório sairá sem status por passo.
                            </p>
                        )}
                        <button
                            onClick={() => printPdfReport(testName, projectName, steps)}
                            disabled={steps.length === 0}
                            className="self-start inline-flex items-center gap-2 border border-brand/40 text-brand rounded-lg px-4 py-2 text-xs font-bold hover:bg-brand/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <FileDown className="w-3.5 h-3.5" /> CRIAR NOVO
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
