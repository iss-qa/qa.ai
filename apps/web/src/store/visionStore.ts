import { create } from 'zustand';
import { ReferenceImage, AmbiguityEvent, ExecutionProgress, ImageStepMapping } from '@/types/vision';
import { sessionLogger } from '@/lib/session-logger';

interface VisionState {
  referenceImages: ReferenceImage[];
  imageStepMapping: ImageStepMapping;
  ambiguityEvent: AmbiguityEvent | null;
  executionProgress: ExecutionProgress | null;

  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  reorderImages: (oldIndex: number, newIndex: number) => void;
  setImageConverted: (id: string, blob: Blob) => void;
  autoMapImages: (stepCount: number) => void;
  setAmbiguityEvent: (event: AmbiguityEvent | null) => void;
  setExecutionProgress: (progress: ExecutionProgress | null) => void;
  clearAll: () => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_IMAGES = 20;

async function compressToJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('JPEG compression failed'));
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export const useVisionStore = create<VisionState>((set, get) => ({
  referenceImages: [],
  imageStepMapping: {},
  ambiguityEvent: null,
  executionProgress: null,

  addImages: (files: File[]) => {
    const current = get().referenceImages;
    const validFiles = files.filter(f => ACCEPTED_TYPES.includes(f.type));
    const remaining = MAX_IMAGES - current.length;
    const toAdd = validFiles.slice(0, remaining);

    const newImages: ReferenceImage[] = toAdd.map((file, i) => ({
      id: `img-${Date.now()}-${i}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isConverting: true,
      order: current.length + i,
    }));

    set({ referenceImages: [...current, ...newImages] });

    // Log upload
    sessionLogger.logVisionUpload(
      toAdd.map(f => ({ name: f.name, size: f.size }))
    );

    // Compress each image in background
    newImages.forEach(async (img) => {
      try {
        const blob = await compressToJpeg(img.file);
        set((state) => ({
          referenceImages: state.referenceImages.map((r) =>
            r.id === img.id ? { ...r, jpegBlob: blob, isConverting: false } : r
          ),
        }));
      } catch {
        set((state) => ({
          referenceImages: state.referenceImages.map((r) =>
            r.id === img.id ? { ...r, isConverting: false } : r
          ),
        }));
      }
    });
  },

  removeImage: (id: string) => {
    const img = get().referenceImages.find((r) => r.id === id);
    if (img) URL.revokeObjectURL(img.previewUrl);
    set((state) => ({
      referenceImages: state.referenceImages
        .filter((r) => r.id !== id)
        .map((r, i) => ({ ...r, order: i })),
    }));
  },

  reorderImages: (oldIndex: number, newIndex: number) => {
    set((state) => {
      const images = [...state.referenceImages];
      const [moved] = images.splice(oldIndex, 1);
      images.splice(newIndex, 0, moved);
      return { referenceImages: images.map((r, i) => ({ ...r, order: i })) };
    });
  },

  setImageConverted: (id: string, blob: Blob) => {
    set((state) => ({
      referenceImages: state.referenceImages.map((r) =>
        r.id === id ? { ...r, jpegBlob: blob, isConverting: false } : r
      ),
    }));
  },

  autoMapImages: (stepCount: number) => {
    const images = get().referenceImages;
    if (images.length === 0 || stepCount === 0) return;

    const mapping: ImageStepMapping = {};
    for (let i = 0; i < images.length; i++) {
      mapping[String(i)] = [];
    }

    for (let step = 1; step <= stepCount; step++) {
      const imgIdx = Math.min(
        Math.floor((step - 1) * images.length / stepCount),
        images.length - 1
      );
      mapping[String(imgIdx)].push(step);
    }

    set({ imageStepMapping: mapping });
  },

  setAmbiguityEvent: (event: AmbiguityEvent | null) => set({ ambiguityEvent: event }),
  setExecutionProgress: (progress: ExecutionProgress | null) => set({ executionProgress: progress }),

  clearAll: () => {
    get().referenceImages.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    set({
      referenceImages: [],
      imageStepMapping: {},
      ambiguityEvent: null,
      executionProgress: null,
    });
  },
}));
