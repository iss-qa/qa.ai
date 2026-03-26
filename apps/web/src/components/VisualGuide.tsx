'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Plus, Loader2, ZoomIn, FolderOpen, ImageIcon } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVisionStore } from '@/store/visionStore';
import { DAEMON_URL } from '@/lib/constants';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

interface StoredImage {
  filename: string;
  url: string;
}

// ─── Session thumbnail (in-memory — used for UIAutomator2 vision path) ─────────

function SessionThumbnail({ id, index, previewUrl, isConverting, fileName, onRemove }: {
  id: string; index: number; previewUrl: string; isConverting: boolean; fileName: string; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [showPreview, setShowPreview] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1, opacity: isDragging ? 0.7 : 1 };

  return (
    <div
      ref={setNodeRef} style={style} title={fileName}
      className={`relative flex-shrink-0 w-[80px] h-[80px] rounded-lg border overflow-hidden group cursor-grab active:cursor-grabbing ${isDragging ? 'border-brand ring-2 ring-brand/50' : 'border-white/10 hover:border-white/30'}`}
      {...attributes} {...listeners}
    >
      <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">{index + 1}</div>
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
        <X className="w-3 h-3" />
      </button>
      <button onClick={(e) => { e.stopPropagation(); setShowPreview(true); }} onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ZoomIn className="w-3 h-3" />
      </button>
      <img src={previewUrl} alt={`Ref ${index + 1}`} className="w-full h-full object-cover" draggable={false} />
      {isConverting && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-5 h-5 text-brand animate-spin" /></div>}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowPreview(false)} onPointerDown={(e) => e.stopPropagation()}>
          <img src={previewUrl} alt="" className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}

// ─── Stored thumbnail (persisted on daemon — used for Maestro Smart Retry) ────

function StoredThumbnail({ image, onRemove }: { image: StoredImage; onRemove: () => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fullUrl = `${DAEMON_URL}${image.url}`;
  const label = image.filename.replace(/\.[^.]+$/, '').replace(/-\d{10,}$/, '');

  return (
    <div className="relative flex-shrink-0 w-[100px] h-[160px] rounded-lg border border-white/10 hover:border-white/30 overflow-hidden group transition-colors bg-white/5">
      <button onClick={async (e) => { e.stopPropagation(); setIsDeleting(true); await onRemove(); setIsDeleting(false); }} disabled={isDeleting}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 disabled:opacity-50">
        {isDeleting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-3 h-3" />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        className="absolute bottom-6 right-1.5 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
        <ZoomIn className="w-3 h-3" />
      </button>
      <img src={fullUrl} alt={label} className="w-full h-full object-cover" draggable={false} />
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 text-[9px] text-zinc-300 truncate">{label}</div>
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowPreview(false)}>
          <img src={fullUrl} alt={label} className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VisualGuide({ projectId }: { projectId?: string }) {
  const isMaestroMode = !!projectId;

  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [isLoadingStored, setIsLoadingStored] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { referenceImages, addImages, removeImage, reorderImages } = useVisionStore();

  // DnD for session thumbnails
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = referenceImages.findIndex(r => r.id === active.id);
      const newIndex = referenceImages.findIndex(r => r.id === over.id);
      reorderImages(oldIndex, newIndex);
    }
  }, [referenceImages, reorderImages]);

  // Maestro mode: load stored images from backend
  const refreshStoredImages = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`${DAEMON_URL}/api/projects/${projectId}/reference-screenshots`);
      const data = await res.json();
      setStoredImages(data.images || []);
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setIsLoadingStored(true);
    refreshStoredImages().finally(() => setIsLoadingStored(false));
  }, [projectId, refreshStoredImages]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    addImages(files); // always add to visionStore for session use

    if (!projectId) return; // UIAutomator2: only session, no backend
    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      await fetch(`${DAEMON_URL}/api/projects/${projectId}/reference-screenshots`, { method: 'POST', body: formData });
      await refreshStoredImages();
    } catch {} finally {
      setIsUploading(false);
    }
  }, [projectId, addImages, refreshStoredImages]);

  const handleDeleteStored = useCallback(async (filename: string) => {
    if (!projectId) return;
    try {
      await fetch(`${DAEMON_URL}/api/projects/${projectId}/reference-screenshots/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      setStoredImages(prev => prev.filter(i => i.filename !== filename));
    } catch {}
  }, [projectId]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED_TYPES.includes(f.type));
    if (files.length === 0) { alert('Apenas imagens são aceitas (PNG, JPG, WebP)'); return; }
    await uploadFiles(files);
    if (!isOpen) setIsOpen(true);
  }, [uploadFiles, isOpen]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => ACCEPTED_TYPES.includes(f.type));
    if (files.length > 0) await uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

  // Counts and labels per mode
  const sessionCount = referenceImages.length;
  const storedCount = storedImages.length;
  const displayCount = isMaestroMode ? storedCount : sessionCount;

  const headerIcon = isMaestroMode ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400/80" /> : <ImageIcon className="w-3.5 h-3.5" />;
  const headerLabel = isMaestroMode
    ? `Screenshots de referências (${displayCount})`
    : `Guia Visual ${sessionCount > 0 ? `(${sessionCount})` : '(opcional)'}`;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          {headerIcon}
          {headerLabel}
          {(isUploading || isLoadingStored) && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
      </button>

      {isOpen && (
        <div className="mt-1.5 rounded-lg border border-white/10 bg-white/5 overflow-hidden">

          {/* ── Maestro mode: persistent stored thumbnails ── */}
          {isMaestroMode && (
            <>
              {isLoadingStored ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
              ) : storedCount > 0 ? (
                <div className="p-3 flex gap-3 overflow-x-auto custom-scrollbar">
                  {storedImages.map(img => (
                    <StoredThumbnail key={img.filename} image={img} onRemove={() => handleDeleteStored(img.filename)} />
                  ))}
                </div>
              ) : null}
            </>
          )}

          {/* ── UIAutomator2 mode: session in-memory thumbnails with drag reorder ── */}
          {!isMaestroMode && sessionCount > 0 && (
            <div className="p-3">
              <p className="text-[10px] text-zinc-600 mb-2">Arraste para reordenar</p>
              <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={referenceImages.map(r => r.id)} strategy={horizontalListSortingStrategy}>
                    {referenceImages.map((img, index) => (
                      <SessionThumbnail
                        key={img.id} id={img.id} index={index}
                        previewUrl={img.previewUrl} isConverting={img.isConverting}
                        fileName={img.file.name} onRemove={() => removeImage(img.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          )}

          {/* ── Drop zone (always visible at bottom) ── */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center justify-center gap-2 px-4 py-3 cursor-pointer transition-colors ${(isMaestroMode ? storedCount : sessionCount) > 0 ? 'border-t border-dashed border-white/10' : ''} ${isDragOver ? 'bg-brand/10' : 'hover:bg-white/5'}`}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <Plus className="w-4 h-4 text-zinc-500" />}
            <span className="text-xs text-zinc-500">
              {isUploading ? 'Salvando...' : displayCount === 0 ? 'Arraste imagens ou clique para adicionar' : 'Adicionar mais imagens'}
            </span>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple onChange={handleFileSelect} className="hidden" />
    </div>
  );
}
