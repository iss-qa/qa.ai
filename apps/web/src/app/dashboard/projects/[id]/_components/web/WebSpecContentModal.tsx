'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, Copy, Check, ExternalLink } from 'lucide-react';
import { getSpecContent } from './web-api';

interface Props {
    projectId: string;
    spec: { path: string; name: string };
    repoOwner: string;
    repoName: string;
    defaultBranch: string;
    onClose: () => void;
}

// Coloração TypeScript mínima (sem dependência externa).
// Realça palavras-chave, strings, comentários e describe/test/it/expect.
function highlight(code: string): string {
    return code
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Comentários de linha
        .replace(/(\/\/[^\n]*)/g, '<span style="color:#6a737d;font-style:italic">$1</span>')
        // Comentários de bloco
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6a737d;font-style:italic">$1</span>')
        // Strings (duplas / simples / template)
        .replace(/(`[^`]*`|'[^']*'|"[^"]*")/g, '<span style="color:#9ecbff">$1</span>')
        // Palavras-chave de teste (playwright)
        .replace(/\b(test|it|describe|beforeEach|afterEach|beforeAll|afterAll|expect|page|browser|context)\b(?=\s*[.(])/g, '<span style="color:#79b8ff">$1</span>')
        // Palavras-chave TypeScript
        .replace(/\b(import|from|export|const|let|var|async|await|return|function|class|interface|type|extends|implements|new|this|true|false|null|undefined|void)\b/g, '<span style="color:#f97583">$1</span>');
}

export function WebSpecContentModal({ projectId, spec, repoOwner, repoName, defaultBranch, onClose }: Props) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { content } = await getSpecContent(projectId, spec.path);
                if (alive) setContent(content);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [projectId, spec.path]);

    const copy = async () => {
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
    };

    const lines = content?.split('\n') ?? [];
    const githubUrl = `https://github.com/${repoOwner}/${repoName}/blob/${defaultBranch}/${spec.path}`;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{spec.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{spec.path}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <a href={githubUrl} target="_blank" rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-brand border border-border hover:border-brand/50 transition-colors inline-flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" /> GitHub
                        </a>
                        <button onClick={copy} disabled={!content}
                            className="px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-brand border border-border hover:border-brand/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-40">
                            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copiado' : 'Copiar'}
                        </button>
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-hidden">
                    {loading && (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    )}
                    {error && (
                        <div className="m-4 flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                        </div>
                    )}
                    {content && (
                        <div className="h-full overflow-auto custom-scrollbar">
                            <table className="w-full text-[12.5px] font-mono border-collapse">
                                <tbody>
                                    {lines.map((line, i) => (
                                        <tr key={i} className="hover:bg-foreground/[0.03] transition-colors">
                                            <td className="select-none text-right text-muted-foreground/50 px-4 py-px w-10 shrink-0 border-r border-border/30 leading-5 align-top">
                                                {i + 1}
                                            </td>
                                            <td className="px-4 py-px leading-5 text-foreground align-top whitespace-pre"
                                                dangerouslySetInnerHTML={{ __html: highlight(line) || '&nbsp;' }}
                                            />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{lines.length} linhas · branch <span className="font-mono text-foreground">{defaultBranch}</span></span>
                    <span className="font-mono">{spec.path}</span>
                </div>
            </div>
        </div>
    );
}
