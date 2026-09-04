/**
 * Small pure helpers shared by the media components: kind labels/icons,
 * client-side pre-validation of files before they are sent, and a
 * thumbnail-size heuristic. Safe to import from client components.
 */
import type { MediaKind } from '@/db/schema';
import { isAllowedMime, maxBytesFor, mimeFromKey, normalizeMime } from '@/server/media/mime';

export const MEDIA_KINDS: MediaKind[] = ['image', 'video', 'audio', 'document'];

export function kindLabelKey(kind: MediaKind): string {
  return `media.kind.${kind}`;
}

/** MIME to compare against the allow-list, falling back to the extension when the browser sends nothing. */
export function effectiveMime(file: Pick<File, 'type' | 'name'>): string {
  const declared = normalizeMime(file.type);
  if (declared && declared !== 'application/octet-stream') return declared;
  return mimeFromKey(file.name.toLowerCase());
}

export type FileCheck = { ok: true } | { ok: false; reason: 'type' | 'size'; limit?: number };

/** Reject obviously wrong files before uploading (the server sniffs the bytes anyway). */
export function checkFile(file: Pick<File, 'type' | 'name' | 'size'>, kind?: MediaKind): FileCheck {
  const mime = effectiveMime(file);
  if (!isAllowedMime(mime)) return { ok: false, reason: 'type' };
  if (kind && !mime.startsWith(kind === 'document' ? 'application/' : `${kind}/`))
    return { ok: false, reason: 'type' };
  const limit = maxBytesFor(mime);
  if (file.size > limit) return { ok: false, reason: 'size', limit };
  return { ok: true };
}

/** Stable-ish id for queue entries (no crypto dependency needed for UI keys). */
export function queueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Split a selection into batches the upload route accepts. */
export function batchFiles<T>(files: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < files.length; i += size) out.push(files.slice(i, i + size));
  return out;
}

/** Text shown under a card: "1600 × 1000 · 79 kB". */
export function dimensionsLabel(media: { width: number | null; height: number | null }): string | null {
  return media.width && media.height ? `${media.width} × ${media.height}` : null;
}
