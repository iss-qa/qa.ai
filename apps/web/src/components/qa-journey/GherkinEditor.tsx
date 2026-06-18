'use client';

import { useRef, type ReactNode } from 'react';

// Editor de Gherkin com realce de sintaxe. Técnica de overlay: um <textarea>
// transparente por cima de um <pre> colorido — ambos compartilham exatamente
// a mesma tipografia/padding/quebra de linha para o cursor cair no lugar certo.

const FEATURE_KW = /^(\s*)(Funcionalidade|Feature|Esquema do Cenário|Esquema do Cenario|Scenario Outline|Cenário|Cenario|Scenario|Contexto|Background|Exemplos|Examples|Regra|Rule)(\s*:)(.*)$/;
const STEP_KW = /^(\s*)(Dado|Quando|Então|Entao|Mas|E|Given|When|Then|And|But)(\s.*|)$/;

// Realça trechos entre aspas dentro do "resto" de uma linha.
function highlightStrings(text: string, keyPrefix: string): ReactNode[] {
    const parts = text.split(/("[^"]*")/g);
    return parts.map((p, i) =>
        p.startsWith('"') && p.endsWith('"') && p.length >= 2
            ? <span key={`${keyPrefix}-s${i}`} className="text-emerald-400">{p}</span>
            : <span key={`${keyPrefix}-t${i}`}>{p}</span>,
    );
}

function highlightLine(line: string, key: string): ReactNode {
    const trimmed = line.trimStart();

    // Comentário
    if (trimmed.startsWith('#')) {
        return <span key={key} className="text-emerald-500/60 italic">{line}</span>;
    }
    // Tags (@login @regression ...)
    if (trimmed.startsWith('@')) {
        return <span key={key} className="text-amber-400">{line}</span>;
    }
    // Linha de tabela (| a | b |)
    if (trimmed.startsWith('|')) {
        const cells = line.split('|');
        return (
            <span key={key}>
                {cells.map((c, i) => (
                    <span key={`${key}-c${i}`}>
                        {i > 0 && <span className="text-muted-foreground">|</span>}
                        <span className="text-sky-300/90">{c}</span>
                    </span>
                ))}
            </span>
        );
    }
    // Palavra-chave estrutural (Funcionalidade:, Cenário:, ...)
    const fm = line.match(FEATURE_KW);
    if (fm) {
        const [, indent, kw, colon, rest] = fm;
        return (
            <span key={key}>
                {indent}
                <span className="text-purple-400 font-semibold">{kw}{colon}</span>
                {highlightStrings(rest, key)}
            </span>
        );
    }
    // Palavra-chave de passo (Dado/Quando/Então/E/...)
    const sm = line.match(STEP_KW);
    if (sm) {
        const [, indent, kw, rest] = sm;
        return (
            <span key={key}>
                {indent}
                <span className="text-blue-400 font-semibold">{kw}</span>
                {highlightStrings(rest, key)}
            </span>
        );
    }
    // Texto comum (ainda realça aspas)
    return <span key={key}>{highlightStrings(line, key)}</span>;
}

function highlight(text: string): ReactNode[] {
    const lines = text.split('\n');
    const out: ReactNode[] = [];
    lines.forEach((line, i) => {
        out.push(highlightLine(line, `l${i}`));
        if (i < lines.length - 1) out.push('\n');
    });
    return out;
}

const SHARED =
    'm-0 p-3 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap break-words tracking-normal';

// Visualização read-only de um cenário Gherkin (mesmo realce do editor).
// Usada no detalhe do caso, onde não há edição.
export function GherkinView({ value }: { value: string }) {
    return (
        <pre className={`${SHARED} rounded-lg border border-border bg-[#0d1117] text-zinc-100 overflow-auto max-h-96 custom-scrollbar`}>
            {highlight(value)}
        </pre>
    );
}

interface GherkinEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function GherkinEditor({ value, onChange, placeholder }: GherkinEditorProps) {
    const preRef = useRef<HTMLPreElement>(null);

    return (
        <div className="relative rounded-lg border border-border bg-[#0d1117] dark:bg-[#0d1117] overflow-hidden h-72">
            <pre
                ref={preRef}
                aria-hidden
                className={`${SHARED} absolute inset-0 overflow-auto pointer-events-none text-zinc-100`}
            >
                {value ? highlight(value) : <span className="text-zinc-500">{placeholder}</span>}
                {/* linha extra para o cursor não “grudar” na borda inferior */}
                {'\n'}
            </pre>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                onScroll={e => {
                    if (preRef.current) {
                        preRef.current.scrollTop = e.currentTarget.scrollTop;
                        preRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                }}
                spellCheck={false}
                className={`${SHARED} absolute inset-0 w-full h-full resize-none overflow-auto bg-transparent text-transparent caret-zinc-100 outline-none focus:ring-1 focus:ring-brand/50 rounded-lg`}
            />
        </div>
    );
}
