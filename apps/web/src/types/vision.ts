export interface ReferenceImage {
  id: string;
  file: File;
  previewUrl: string;
  jpegBlob?: Blob;
  isConverting: boolean;
  order: number;
}

export interface AmbiguityCandidate {
  index: number;
  label: string;
  x: number;
  y: number;
}

export interface AmbiguityEvent {
  stepNum: number;
  screenshotBase64: string;
  candidates: AmbiguityCandidate[];
  reason?: string;
}

export interface ExecutionProgress {
  current: number;
  total: number;
  description: string;
}

export interface ImageStepMapping {
  [imageIndex: string]: number[];
}
