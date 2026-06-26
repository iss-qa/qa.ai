// Extração de storyboard a partir de um vídeo — 100% no navegador.
//
// O vídeo NUNCA sai para um serviço externo: carregamos em um <video> oculto,
// percorremos por amostragem, detectamos cada mudança de tela comparando frames
// (diff perceptual em escala de cinza reduzida) e capturamos um print de cada
// tela distinta. Só os PRINTS (JPEG) sobem para o Supabase Storage.
//
// Espelha o padrão client-side de html-bundle.ts (processa o upload no front).

import { supabase } from '@/lib/supabase';

export interface ExtractOptions {
    // Trava de segurança de nº de telas (evita runaway). NÃO é um corte de
    // duração: a varredura cobre o vídeo inteiro até este teto. Default 120.
    maxFrames?: number;
    // Intervalo de amostragem em segundos. Menor = mais sensível, mais lento.
    sampleEverySec?: number;
    // Fração (0..1) de CÉLULAS que precisam mudar para ser "outra tela". Métrica
    // por região (não média) — detecta mudanças localizadas de texto/ícones em
    // telas escuras. Default 0.035 (3,5% das células).
    diffThreshold?: number;
    // Fração abaixo da qual duas telas são consideradas a MESMA (dedup de telas
    // já registradas, ex.: voltar ao login). Default 0.012.
    dupThreshold?: number;
    // Segundos a esperar APÓS detectar a mudança, antes do print — dá tempo de a
    // tela carregar (evita capturar componentes ainda em branco). Default 1.2.
    settleDelaySec?: number;
    // Maior dimensão do print capturado (px). Mantém os arquivos leves. Default 720.
    maxFrameDim?: number;
    // Cancelamento (ex.: usuário fecha o modal).
    signal?: AbortSignal;
    // Progresso 0..1 enquanto varre o vídeo.
    onProgress?: (fraction: number, framesFound: number) => void;
}

export interface RawFrame {
    blob: Blob;
    dataUrl: string;   // preview imediato (sem esperar upload)
    time: number;      // segundo no vídeo
}

const ABORT_MSG = 'cancelado';

// Limite duro de duração (≈ 3 min + folga). Vídeos maiores são rejeitados —
// a feature foi pensada para clipes curtos de jornada.
export const MAX_VIDEO_SECONDS = 200;

function isAborted(signal?: AbortSignal): boolean {
    return Boolean(signal?.aborted);
}

// Espera o próximo paint (garante que o frame buscado foi decodificado/pintado
// antes do drawImage — evita capturar o frame anterior).
function nextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

// Busca um instante do vídeo e espera o seek concluir ('seeked'). Timeout
// generoso evita travar em codecs/keyframes lentos sem cortar seeks legítimos.
function seekTo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (isAborted(signal)) return reject(new Error(ABORT_MSG));
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            video.removeEventListener('seeked', finish);
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(finish, 3000);
        video.addEventListener('seeked', finish, { once: true });
        try {
            video.currentTime = time;
        } catch (e) {
            clearTimeout(timer);
            reject(e instanceof Error ? e : new Error(String(e)));
        }
    });
}

// Luma média de um ImageData (escala 0..255). Usada no diff perceptual.
function lumaSignature(data: Uint8ClampedArray): Float32Array {
    const out = new Float32Array(data.length / 4);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return out;
}

// Fração de células que mudaram visivelmente entre duas assinaturas (0..1).
// Conta quantas células diferem além de CELL_DELTA (ignora ruído de
// compressão) — sensível a mudanças LOCAIS de texto/ícones que a diferença
// média não pega em telas predominantemente escuras.
const CELL_DELTA = 16; // luma 0..255
function changeScore(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length || a.length === 0) return 1;
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > CELL_DELTA) changed++;
    return changed / a.length;
}

// Converte uma data URL em Blob (mantém a ordem de captura sem await no rVFC).
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    return (await fetch(dataUrl)).blob();
}

// Força o navegador a calcular a duração real quando vem Infinity/NaN
// (comum em MP4/WebM de gravadores de tela). Truque: pula para um tempo enorme
// — o navegador busca o fim de fato e dispara durationchange/seeked/timeupdate
// com a duração verdadeira. Retorna 0 se não conseguir descobrir (a varredura
// não depende disto: a reprodução vai até o 'ended' real de qualquer forma).
function resolveDuration(video: HTMLVideoElement): Promise<number> {
    if (isFinite(video.duration) && video.duration > 0) return Promise.resolve(video.duration);
    return new Promise<number>(resolve => {
        let done = false;
        const check = () => { if (isFinite(video.duration) && video.duration > 0) finish(video.duration); };
        const cleanup = () => {
            video.removeEventListener('durationchange', check);
            video.removeEventListener('timeupdate', check);
            video.removeEventListener('seeked', check);
            clearTimeout(timer);
        };
        const finish = (d: number) => {
            if (done) return;
            done = true;
            cleanup();
            try { video.currentTime = 0; } catch { /* ignore */ }
            resolve(d);
        };
        video.addEventListener('durationchange', check);
        video.addEventListener('timeupdate', check);
        video.addEventListener('seeked', check);
        const timer = setTimeout(() => finish(0), 6000);
        try { video.currentTime = 1e6; } catch { /* ignore */ } // ~11 dias: força ir ao fim
    });
}

/**
 * Varre o vídeo do INÍCIO AO FIM e devolve um frame por mudança de tela
 * (sempre inclui o primeiro). Estratégia 100% por SEEK: primeiro lê o vídeo
 * por completo e descobre a duração real; depois percorre toda a linha do
 * tempo (0 → fim) buscando cada instante e capturando quando a tela muda.
 *
 * Por que seek e não reprodução: um <video> oculto/fora da tela tem os frames
 * de reprodução (e o requestVideoFrameCallback) limitados pelo navegador, o que
 * fazia a captura morrer no meio (~metade do vídeo). O seek decodifica o
 * instante pedido sob demanda, independente de visibilidade — cobre tudo.
 */
export async function extractStoryboardFrames(file: File, opts: ExtractOptions = {}): Promise<RawFrame[]> {
    const {
        maxFrames = 400,            // trava anti-runaway (não é corte de duração)
        sampleEverySec = 0.6,
        diffThreshold = 0.035,      // fração de células que mudam → "outra tela"
        dupThreshold = 0.012,       // fração abaixo da qual é a MESMA tela
        settleDelaySec = 1.2,
        maxFrameDim = 720,
        signal,
        onProgress,
    } = opts;

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // Renderizado (não escondido com display:none / fora da tela): um <video>
    // não-composto pode não decodificar os frames buscados, devolvendo o último
    // frame "preso". Fica minúsculo e quase transparente num canto durante a
    // varredura — imperceptível, mas garante a decodificação de cada seek.
    video.style.cssText = 'position:fixed;left:0;bottom:0;width:64px;height:64px;opacity:0.02;z-index:2147483647;pointer-events:none;';
    video.src = url;
    document.body.appendChild(video);

    const small = document.createElement('canvas');
    const smallCtx = small.getContext('2d', { willReadFrequently: true });
    const capture = document.createElement('canvas');
    const captureCtx = capture.getContext('2d');

    const cleanup = () => {
        try { video.pause(); } catch { /* ignore */ }
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        video.remove();
    };

    try {
        if (!smallCtx || !captureCtx) throw new Error('Canvas indisponível neste navegador.');

        // 1) Lê o vídeo (metadados) e descobre início/fim (duração real).
        await new Promise<void>((resolve, reject) => {
            const onMeta = () => resolve();
            const onErr = () => reject(new Error('Não foi possível ler o vídeo (formato não suportado?).'));
            video.addEventListener('loadedmetadata', onMeta, { once: true });
            video.addEventListener('error', onErr, { once: true });
        });

        let duration = await resolveDuration(video);
        console.info(`[storyboard] varredura por seek (v4) · duração detectada=${Number.isFinite(duration) ? duration.toFixed(1) + 's' : 'desconhecida'}`);
        if (duration > MAX_VIDEO_SECONDS) {
            throw new Error(`Vídeo muito longo (${Math.round(duration)}s). Máximo ${MAX_VIDEO_SECONDS}s (~3 min).`);
        }
        if (duration <= 0) duration = MAX_VIDEO_SECONDS; // desconhecida: varre até o teto

        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1280;
        const scale = Math.min(1, maxFrameDim / Math.max(vw, vh));
        capture.width = Math.round(vw * scale);
        capture.height = Math.round(vh * scale);
        const smallW = 64; // mais resolução na assinatura → pega texto/ícones
        const smallH = Math.max(1, Math.round((vh / vw) * smallW));
        small.width = smallW;
        small.height = smallH;

        const sigAt = async (time: number): Promise<Float32Array> => {
            await seekTo(video, time, signal);
            await nextPaint();   // garante o frame buscado pintado antes do draw
            smallCtx.drawImage(video, 0, 0, smallW, smallH);
            return lumaSignature(smallCtx.getImageData(0, 0, smallW, smallH).data);
        };

        const shots: { dataUrl: string; time: number }[] = [];
        const capturedSigs: Float32Array[] = [];
        let lastCapturedSig: Float32Array | null = null;

        // Captura o frame atual do vídeo. `force` ignora o dedup global (usado
        // para garantir a última tela, mesmo que pareça com uma anterior).
        const pushFrame = (sig: Float32Array, time: number) => {
            captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
            shots.push({ dataUrl: capture.toDataURL('image/jpeg', 0.82), time });
            capturedSigs.push(sig);
            lastCapturedSig = sig;
        };
        const tryCapture = (sig: Float32Array, time: number) => {
            lastCapturedSig = sig;
            if (capturedSigs.some(cs => changeScore(cs, sig) <= dupThreshold)) return;
            pushFrame(sig, time);
        };

        // 2) Percorre TODA a linha do tempo por seek (0 → fim). NÃO usamos um
        // corte por "currentTime < alvo" (o seek encosta no keyframe anterior e
        // isso disparava um falso "fim do vídeo" no meio). O fim real só é
        // detectado quando o currentTime para de avançar por várias buscas
        // seguidas (clamp) — relevante só p/ duração desconhecida.
        const lastT = Math.max(0, duration - 0.05);
        let t = 0;
        let prevCT = -1;
        let stuck = 0;
        let lastCapturedTime = 0;
        while (t <= lastT && shots.length < maxFrames) {
            if (isAborted(signal)) throw new Error(ABORT_MSG);
            let sig = await sigAt(t);

            const ct = video.currentTime;
            if (ct <= prevCT + 0.05) { if (++stuck >= 4) break; } else stuck = 0;
            prevCT = ct;

            if (lastCapturedSig === null || changeScore(lastCapturedSig, sig) > diffThreshold) {
                // "Assenta" a tela (componentes carregam) antes do print.
                const settled = Math.min(t + settleDelaySec, lastT);
                if (settled > t) { sig = await sigAt(settled); t = settled; }
                tryCapture(sig, t);
                lastCapturedTime = t;
            }
            onProgress?.(Math.min(0.99, t / duration), shots.length);
            t += sampleEverySec;
        }

        // Garante a ÚLTIMA tela do vídeo (ex.: tela de espera/sucesso longa no
        // fim). Captura o frame final se for diferente da última registrada —
        // sem passar pelo dedup global (a tela de fim pode parecer com uma
        // anterior, mas representa outro estado e o usuário quer vê-la).
        if (shots.length < maxFrames) {
            const endSig = await sigAt(lastT);
            if (lastCapturedSig === null || changeScore(lastCapturedSig, endSig) > diffThreshold) {
                pushFrame(endSig, lastT);
                lastCapturedTime = lastT;
            }
        }

        onProgress?.(1, shots.length);
        // Diagnóstico (console): ajuda a confirmar cobertura do vídeo inteiro.
        console.info(`[storyboard] duração≈${duration.toFixed(1)}s · telas capturadas=${shots.length} · última tela em ${lastCapturedTime.toFixed(1)}s`);
        if (shots.length === 0) throw new Error('Nenhuma tela detectada no vídeo.');

        // Gera os blobs preservando a ordem de captura.
        const frames: RawFrame[] = [];
        for (const s of shots) {
            frames.push({ blob: await dataUrlToBlob(s.dataUrl), dataUrl: s.dataUrl, time: s.time });
        }
        return frames;
    } finally {
        cleanup();
    }
}

/**
 * Sobe um print para o bucket público qa-evidence (prefixo storyboard/) e
 * devolve a URL pública. `storyboardId` agrupa as telas de um mesmo sub-fluxo.
 */
export async function uploadStoryboardFrame(storyboardId: string, index: number, blob: Blob): Promise<string> {
    const path = `storyboard/${storyboardId}/${String(index).padStart(3, '0')}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
        .from('qa-evidence')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    return supabase.storage.from('qa-evidence').getPublicUrl(path).data.publicUrl;
}

// ============================================================
// Tarja (LGPD) — pixela regiões sensíveis (e-mail/senha) no print.
// Coordenadas normalizadas 0..1 relativas à imagem.
// ============================================================

export interface RedactRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // bucket público devolve CORS *
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Não foi possível carregar a imagem para tarjar.'));
        img.src = url;
    });
}

/**
 * Aplica mosaico (pixelização forte) nas regiões informadas e devolve um novo
 * JPEG. A tarja é PERMANENTE na imagem — não dá para "desfazer" pelo cliente.
 */
export async function redactImage(imageUrl: string, rects: RedactRect[]): Promise<Blob> {
    const img = await loadImage(imageUrl);
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.drawImage(img, 0, 0, W, H);

    for (const r of rects) {
        const x = Math.max(0, Math.round(r.x * W));
        const y = Math.max(0, Math.round(r.y * H));
        const w = Math.min(W - x, Math.round(r.w * W));
        const h = Math.min(H - y, Math.round(r.h * H));
        if (w <= 1 || h <= 1) continue;
        // Mosaico: reduz a região a ~10px de largura e amplia de volta.
        const blocks = Math.max(1, Math.round(w / 14));
        const small = document.createElement('canvas');
        small.width = blocks;
        small.height = Math.max(1, Math.round((h / w) * blocks));
        const sctx = small.getContext('2d');
        if (!sctx) continue;
        sctx.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
    }

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Falha ao gerar a imagem tarjada.');
    return blob;
}
