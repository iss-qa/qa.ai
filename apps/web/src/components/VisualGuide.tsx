'use client';

import { useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, X, Plus, ImageIcon, Loader2, ZoomIn } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVisionStore } from '@/store/visionStore';

function SortableThumbnail({ id, index, previewUrl, isConverting, fileName, onRemove }: {
  id: string;
  index: number;
  previewUrl: string;
  isConverting: boolean;
  fileName: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [showPreview, setShowPreview] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex-shrink-0 w-[90px] h-[90px] rounded-lg border overflow-hidden group cursor-grab active:cursor-grabbing ${isDragging ? 'border-brand ring-2 ring-brand/50 shadow-xl' : 'border-white/10 hover:border-white/30'}`}
      {...attributes}
      {...listeners}
      title={fileName}
    >
      {/* Number badge */}
      <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center shadow">
        {index + 1}
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="w-3 h-3" />
      </button>

      {/* Zoom button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        className="absolute bottom-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ZoomIn className="w-3 h-3" />
      </button>

      {/* Image */}
      <img src={previewUrl} alt={`Ref ${index + 1}`} className="w-full h-full object-cover" draggable={false} />

      {/* Converting overlay */}
      {isConverting && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-brand animate-spin" />
        </div>
      )}

      {/* Arrow between thumbnails */}
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none select-none z-0">
        →
      </div>

      {/* Full preview overlay */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setShowPreview(false)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <img src={previewUrl} alt={`Preview ${index + 1}`} className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}

export function VisualGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { referenceImages, addImages, removeImage, reorderImages } = useVisionStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = referenceImages.findIndex(r => r.id === active.id);
      const newIndex = referenceImages.findIndex(r => r.id === over.id);
      reorderImages(oldIndex, newIndex);
    }
  }, [referenceImages, reorderImages]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type));
    if (imageFiles.length === 0) {
      alert('Apenas imagens são aceitas (PNG, JPG, WebP)');
      return;
    }
    addImages(imageFiles);
    if (!isOpen) setIsOpen(true);
  }, [addImages, isOpen]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) addImages(files);
    e.target.value = '';
  }, [addImages]);

  const imageCount = referenceImages.length;

  return (
    <div className="mb-2">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <ImageIcon className="w-3.5 h-3.5" />
          Guia Visual {imageCount > 0 ? `(${imageCount} ${imageCount === 1 ? 'imagem' : 'imagens'})` : '(opcional)'}
        </div>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="mt-2 p-3 rounded-lg border border-white/10 bg-white/5">
          {imageCount === 0 ? (
            /* Drop zone */
            <div
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-brand', 'bg-brand/5'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-brand', 'bg-brand/5'); }}
              onDrop={(e) => { e.currentTarget.classList.remove('border-brand', 'bg-brand/5'); handleDrop(e); }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/40 transition-colors"
            >
              <ImageIcon className="w-8 h-8 text-zinc-500" />
              <p className="text-xs text-zinc-400 text-center">
                Arraste imagens aqui ou clique para selecionar
              </p>
              <p className="text-[10px] text-zinc-500">Formatos: PNG, JPG, WebP</p>
            </div>
          ) : (
            /* Thumbnail strip */
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] text-zinc-500">Arraste para reordenar</p>
              </div>
              <div
                className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={referenceImages.map(r => r.id)} strategy={horizontalListSortingStrategy}>
                    {referenceImages.map((img, index) => (
                      <SortableThumbnail
                        key={img.id}
                        id={img.id}
                        index={index}
                        previewUrl={img.previewUrl}
                        isConverting={img.isConverting}
                        fileName={img.file.name}
                        onRemove={() => removeImage(img.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Add more button */}
                {imageCount < 20 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-[90px] h-[90px] rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-white/40 transition-colors"
                  >
                    <Plus className="w-5 h-5 text-zinc-500" />
                    <span className="text-[9px] text-zinc-500">Adicionar</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
