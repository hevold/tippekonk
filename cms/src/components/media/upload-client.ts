/**
 * Browser-side upload helper for /api/upload. Uses XMLHttpRequest because
 * fetch() still has no upload progress events. Pure module (no React) so
 * the dropzone and the picker share one implementation and it can be unit
 * tested with a fake XHR.
 *
 *   const result = await uploadFiles([file], { alt: 'Rådhuset' }, { onProgress: (p) => … });
 *   result.media   → stored Media rows
 *   result.errors  → per-file failures the server reported
 */
import type { Media } from '@/db/schema';

export type UploadFields = {
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  folder?: string | null;
};

export type UploadProgress = { loaded: number; total: number; percent: number };

export type UploadFailure = { filename: string; code: string; message: string };

export type UploadResult = { media: Media[]; errors: UploadFailure[] };

export class UploadRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = 'UploadRequestError';
  }
}

export type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Endpoint override (tests). */
  url?: string;
  /** XHR factory override (tests). */
  createRequest?: () => XMLHttpRequest;
};

/** Serialised Media from JSON: revive the date fields the UI formats. */
function reviveMedia(raw: unknown): Media {
  const m = raw as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === 'string' ? new Date(v) : (v as Date | null));
  return {
    ...(m as unknown as Media),
    createdAt: date(m.createdAt) ?? new Date(),
    updatedAt: date(m.updatedAt) ?? new Date(),
    deletedAt: date(m.deletedAt),
    takenAt: date(m.takenAt),
  };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Upload one batch of files in a single multipart request. Rejects with UploadRequestError when nothing was stored. */
export function uploadFiles(
  files: File[],
  fields: UploadFields = {},
  opts: UploadOptions = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('file', file, file.name);
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string' && value.trim()) form.append(key, value.trim());
    }

    const xhr = opts.createRequest ? opts.createRequest() : new XMLHttpRequest();
    xhr.open('POST', opts.url ?? '/api/upload');
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (!opts.onProgress) return;
      const total = event.lengthComputable ? event.total : files.reduce((sum, f) => sum + f.size, 0);
      const loaded = Math.min(event.loaded, total);
      opts.onProgress({ loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
    };

    xhr.onerror = () =>
      reject(new UploadRequestError('Mistet kontakt med tjeneren. Sjekk nettforbindelsen.', 0, 'network'));
    xhr.onabort = () => reject(new UploadRequestError('Opplastingen ble avbrutt.', 0, 'aborted'));
    xhr.ontimeout = () => reject(new UploadRequestError('Opplastingen tok for lang tid.', 0, 'timeout'));

    xhr.onload = () => {
      const body = parseJson(String(xhr.responseText ?? ''));
      if (xhr.status >= 200 && xhr.status < 300 && body && Array.isArray(body.media)) {
        const errors = Array.isArray(body.errors) ? (body.errors as UploadFailure[]) : [];
        resolve({ media: (body.media as unknown[]).map(reviveMedia), errors });
        return;
      }
      const error = (body?.error ?? {}) as { code?: string; message?: string };
      const fallback =
        xhr.status === 401
          ? 'Du må logge inn på nytt.'
          : xhr.status === 413
            ? 'Filen er for stor.'
            : 'Opplastingen mislyktes. Prøv igjen.';
      reject(new UploadRequestError(error.message ?? fallback, xhr.status, error.code ?? 'internal'));
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new UploadRequestError('Opplastingen ble avbrutt.', 0, 'aborted'));
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
