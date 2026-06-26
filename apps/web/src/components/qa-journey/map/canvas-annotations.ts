// Camada de anotações livres do mapa (estilo Figma/Miro): sticky notes, formas
// (losango de decisão, retângulo, elipse), imagens coladas/soltas e conexões
// manuais entre nós. Persistido em localStorage por projeto — junto do
// customLayout (geometria) já existente, recompõe o "último estado" do usuário.

import { supabase } from '@/lib/supabase';

export type AnnotationKind = 'sticky' | 'shape' | 'image';
export type ShapeVariant = 'diamond' | 'rectangle' | 'ellipse';

export interface CanvasAnnotation {
    id: string;             // sempre começa com ANNOTATION_ID_PREFIX
    kind: AnnotationKind;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;          // sticky / rótulo da forma
    color?: string;         // cor de acento (hex)
    shape?: ShapeVariant;   // quando kind === 'shape'
    imageUrl?: string;      // quando kind === 'image'
}

export interface ManualEdge {
    id: string;             // sempre começa com MANUAL_EDGE_ID_PREFIX
    source: string;
    target: string;
    // Bordas exatas de onde a seta sai/chega (l/t/r/b nas anotações). Sem isso,
    // o React Flow ancora todas as conexões numa única extremidade.
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

export interface CanvasAnnotationsState {
    annotations: CanvasAnnotation[];
    edges: ManualEdge[];
}

export const ANNOTATION_ID_PREFIX = 'anno:';
export const MANUAL_EDGE_ID_PREFIX = 'manno:';

export const isAnnotationId = (id: string): boolean => id.startsWith(ANNOTATION_ID_PREFIX);
export const isManualEdgeId = (id: string): boolean => id.startsWith(MANUAL_EDGE_ID_PREFIX);

// Paleta de cores das anotações (sticky/formas). Funciona nos dois temas.
export const ANNOTATION_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ef4444', '#ec4899', '#64748b'];

function uid(): string {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* fallback */ }
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export const genAnnotationId = (): string => ANNOTATION_ID_PREFIX + uid();
export const genManualEdgeId = (): string => MANUAL_EDGE_ID_PREFIX + uid();

export function annotationsStorageKey(projectId: string): string {
    return `qa-journey-map-annotations:${projectId}`;
}

export function loadAnnotations(projectId: string): CanvasAnnotationsState {
    try {
        const raw = localStorage.getItem(annotationsStorageKey(projectId));
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<CanvasAnnotationsState>;
            return {
                annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
                edges: Array.isArray(parsed.edges) ? parsed.edges : [],
            };
        }
    } catch {
        // parse/storage indisponível
    }
    return { annotations: [], edges: [] };
}

export function saveAnnotations(projectId: string, state: CanvasAnnotationsState): void {
    try {
        const key = annotationsStorageKey(projectId);
        if (state.annotations.length === 0 && state.edges.length === 0) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(state));
        }
    } catch {
        // localStorage cheio/indisponível
    }
}

// Imagem colada/solta no canvas → sobe ao bucket público qa-evidence (prefixo
// canvas/). Guardamos só a URL na anotação (data URI estouraria o localStorage).
export async function uploadCanvasImage(projectId: string, blob: Blob): Promise<string> {
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const path = `canvas/${projectId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const { error } = await supabase.storage
        .from('qa-evidence')
        .upload(path, blob, { upsert: true, contentType: blob.type || 'image/png' });
    if (error) throw error;
    return supabase.storage.from('qa-evidence').getPublicUrl(path).data.publicUrl;
}
