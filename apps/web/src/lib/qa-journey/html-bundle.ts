// Lê o "documento HTML" anexado a uma jornada/sub-fluxo a partir de um arquivo
// solto (.html/.htm) OU de um pacote (.zip) que contém o HTML + uma pasta de
// anexos (ex.: attachments/ com prints).
//
// Por que: o HTML é renderizado em <iframe srcDoc sandbox> — onde caminhos
// relativos (src="attachments/x.png") resolvem contra a origem do dashboard e
// quebram. Ao importar o .zip, embutimos cada asset referenciado como data URI
// dentro do próprio HTML, deixando o documento "self-contained" e portável
// (basta gravar a string em html_doc; nada de bucket/Storage).
//
// Client-only: usa DOMParser, FileReader e JSZip (browser).

import JSZip from 'jszip';

export interface HtmlDocument {
    html: string;        // HTML final (com assets embutidos quando veio de .zip)
    fileName: string;    // nome do HTML principal (para exibir no form)
    assetCount: number;  // quantos anexos foram embutidos (0 p/ .html solto)
    bytes: number;       // tamanho do HTML resultante em bytes (utf-8)
}

// Limite do documento final. Imagens em base64 inflam ~33%, então damos folga
// generosa face ao TEXT do Postgres; o objetivo é só barrar pacotes absurdos.
export const MAX_HTML_BYTES = 12 * 1024 * 1024; // 12 MB

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    avif: 'image/avif', apng: 'image/apng', tiff: 'image/tiff', tif: 'image/tiff',
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    json: 'application/json', txt: 'text/plain',
};

function mimeFor(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

// Normaliza um caminho de zip/referência: remove ./, resolve ../, tira query/hash.
function normalizePath(p: string): string {
    let s = p.split('#')[0].split('?')[0];
    try { s = decodeURIComponent(s); } catch { /* mantém como veio */ }
    const out: string[] = [];
    for (const seg of s.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { out.pop(); continue; }
        out.push(seg);
    }
    return out.join('/');
}

// Resolve uma referência relativa a partir do diretório do HTML. Retorna null
// para URLs absolutas / data: / âncoras — que devem ser preservadas como estão.
function resolveRef(baseDir: string, ref: string): string | null {
    const r = ref.trim();
    if (!r) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return null; // http:, https:, data:, mailto:, tel:...
    if (r.startsWith('//') || r.startsWith('#')) return null;
    return normalizePath(baseDir ? `${baseDir}/${r}` : r);
}

const isZip = (file: File) =>
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed';

export async function readHtmlDocument(file: File): Promise<HtmlDocument> {
    if (isZip(file)) return readZip(file);

    // .html/.htm solto: comportamento legado (sem assets externos).
    const html = await file.text();
    return { html, fileName: file.name, assetCount: 0, bytes: utf8Bytes(html) };
}

async function readZip(file: File): Promise<HtmlDocument> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    // Mapa caminho-normalizado -> entry (ignora diretórios e metadados de SO).
    const entries = new Map<string, JSZip.JSZipObject>();
    let htmlEntry: JSZip.JSZipObject | null = null;
    let htmlDepth = Infinity;

    zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        const norm = normalizePath(relPath);
        if (!norm) return;
        const base = norm.split('/').pop() || '';
        if (norm.startsWith('__MACOSX/') || base === '.DS_Store') return;
        entries.set(norm, entry);

        if (/\.html?$/i.test(norm)) {
            // Escolhe o HTML principal: menor profundidade; index.* desempata.
            const depth = norm.split('/').length;
            const isIndex = /^index\.html?$/i.test(base);
            if (depth < htmlDepth || (depth === htmlDepth && isIndex)) {
                htmlEntry = entry;
                htmlDepth = depth;
            }
        }
    });

    if (!htmlEntry) {
        throw new Error('O .zip não contém nenhum arquivo .html. Inclua o documento HTML na raiz do pacote.');
    }

    const htmlPath = normalizePath((htmlEntry as JSZip.JSZipObject).name);
    const htmlDir = htmlPath.includes('/') ? htmlPath.replace(/\/[^/]*$/, '') : '';
    const fileName = htmlPath.split('/').pop() || file.name;
    let assetCount = 0;

    // Cache: cada asset é lido uma vez, mesmo se referenciado várias vezes.
    const dataUriCache = new Map<string, string | null>();
    const toDataUri = async (path: string): Promise<string | null> => {
        if (dataUriCache.has(path)) return dataUriCache.get(path)!;
        const entry = entries.get(path);
        if (!entry) { dataUriCache.set(path, null); return null; }
        try {
            const b64 = await entry.async('base64');
            const uri = `data:${mimeFor(path)};base64,${b64}`;
            dataUriCache.set(path, uri);
            assetCount += 1;
            return uri;
        } catch {
            dataUriCache.set(path, null);
            return null;
        }
    };

    const rawHtml = await (htmlEntry as JSZip.JSZipObject).async('string');
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

    // 1) Atributos que apontam para um único asset.
    const attrTargets: Array<[string, string]> = [
        ['img', 'src'], ['img', 'data-src'], ['source', 'src'],
        ['video', 'poster'], ['audio', 'src'], ['embed', 'src'],
        ['script', 'src'],
    ];
    for (const [tag, attr] of attrTargets) {
        for (const el of Array.from(doc.querySelectorAll(`${tag}[${attr}]`))) {
            const ref = el.getAttribute(attr);
            const resolved = ref && resolveRef(htmlDir, ref);
            if (!resolved) continue;
            const uri = await toDataUri(resolved);
            if (uri) el.setAttribute(attr, uri);
        }
    }

    // 2) <img srcset> — embute cada candidato preservando o descritor (1x/2x/w).
    for (const el of Array.from(doc.querySelectorAll('img[srcset], source[srcset]'))) {
        const srcset = el.getAttribute('srcset');
        if (!srcset) continue;
        const parts = await Promise.all(srcset.split(',').map(async (cand) => {
            const [url, ...desc] = cand.trim().split(/\s+/);
            const resolved = resolveRef(htmlDir, url);
            const uri = resolved ? await toDataUri(resolved) : null;
            return `${uri || url}${desc.length ? ' ' + desc.join(' ') : ''}`;
        }));
        el.setAttribute('srcset', parts.join(', '));
    }

    // 3) <link rel=stylesheet href>: inlina o CSS num <style>, resolvendo os
    //    url() do próprio CSS relativos ao diretório dele.
    for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
        const href = link.getAttribute('href');
        const resolved = href && resolveRef(htmlDir, href);
        const entry = resolved ? entries.get(resolved) : null;
        if (!resolved || !entry) continue;
        try {
            const cssRaw = await entry.async('string');
            const cssDir = resolved.includes('/') ? resolved.replace(/\/[^/]*$/, '') : '';
            const css = await inlineCssUrls(cssRaw, cssDir, toDataUri);
            const style = doc.createElement('style');
            style.textContent = css;
            link.replaceWith(style);
        } catch { /* mantém o <link> intacto se falhar */ }
    }

    // 4) url() em <style> embutidos e em atributos style="".
    for (const style of Array.from(doc.querySelectorAll('style'))) {
        if (style.textContent && style.textContent.includes('url(')) {
            style.textContent = await inlineCssUrls(style.textContent, htmlDir, toDataUri);
        }
    }
    for (const el of Array.from(doc.querySelectorAll('[style*="url("]'))) {
        const style = el.getAttribute('style');
        if (style) el.setAttribute('style', await inlineCssUrls(style, htmlDir, toDataUri));
    }

    const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    const bytes = utf8Bytes(html);
    if (bytes > MAX_HTML_BYTES) {
        throw new Error(
            `Documento muito grande após embutir os anexos (${(bytes / 1024 / 1024).toFixed(1)} MB, máx. ${MAX_HTML_BYTES / 1024 / 1024} MB). Reduza o tamanho/quantidade das imagens.`,
        );
    }
    return { html, fileName, assetCount, bytes };
}

// Substitui url(...) de um trecho de CSS por data URIs dos assets do zip.
async function inlineCssUrls(
    css: string,
    baseDir: string,
    toDataUri: (p: string) => Promise<string | null>,
): Promise<string> {
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    const jobs: Array<Promise<{ match: string; replacement: string }>> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
        const match = m[0];
        const quote = m[1];
        const ref = m[2];
        const resolved = resolveRef(baseDir, ref);
        jobs.push(
            (async () => {
                const uri = resolved ? await toDataUri(resolved) : null;
                return { match, replacement: uri ? `url(${quote}${uri}${quote})` : match };
            })(),
        );
    }
    const results = await Promise.all(jobs);
    let out = css;
    for (const { match, replacement } of results) {
        if (replacement !== match) out = out.replace(match, replacement);
    }
    return out;
}

function utf8Bytes(s: string): number {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    // Fallback improvável (TextEncoder existe em todos os browsers alvo).
    return unescape(encodeURIComponent(s)).length;
}
