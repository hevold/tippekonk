/**
 * Media MIME rules shared by the server (upload sniffing, serving) and the
 * client (dropzone `accept`). Pure module: no Node or Next imports, so it is
 * safe to import from client components.
 *
 * SVG is deliberately not allowed: it can carry scripts and is served from
 * the site origin. Uploads are sniffed with `file-type`; the declared type
 * from the browser is only used to catch mismatches.
 */
import type { MediaKind } from '@/db/schema';

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
export const ALLOWED_VIDEO_MIMES = ['video/mp4'] as const;
export const ALLOWED_AUDIO_MIMES = ['audio/mpeg'] as const;
export const ALLOWED_DOCUMENT_MIMES = ['application/pdf'] as const;

export const ALLOWED_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_VIDEO_MIMES,
  ...ALLOWED_AUDIO_MIMES,
  ...ALLOWED_DOCUMENT_MIMES,
] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];

/** 25 MB for images (sharp keeps the whole decode in memory), 200 MB for everything else. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Extension used for stored originals per MIME type. */
export const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
};

/** Browsers and OSes use a few aliases; normalise before comparing. */
const MIME_ALIASES: Record<string, AllowedMime> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'audio/mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'video/x-m4v': 'video/mp4',
  'application/x-pdf': 'application/pdf',
};

export function normalizeMime(mime: string | null | undefined): string {
  const lower = (mime ?? '').trim().toLowerCase().split(';')[0] ?? '';
  return MIME_ALIASES[lower] ?? lower;
}

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIMES as readonly string[]).includes(mime);
}

export function kindForMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export function maxBytesFor(mime: string): number {
  return kindForMime(mime) === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
}

/** Content-Type for a storage key based on its extension (used when serving). */
export function mimeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

/** `accept` attribute value for a file input restricted to a media kind. */
export function acceptForKind(kind?: MediaKind): string {
  switch (kind) {
    case 'image':
      return ALLOWED_IMAGE_MIMES.join(',');
    case 'video':
      return ALLOWED_VIDEO_MIMES.join(',');
    case 'audio':
      return ALLOWED_AUDIO_MIMES.join(',');
    case 'document':
      return ALLOWED_DOCUMENT_MIMES.join(',');
    default:
      return ALLOWED_MIMES.join(',');
  }
}

/** Human-readable size: "1,2 MB", "840 kB", "12 B" (nb-NO formatting). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  const digits = i === 0 ? 0 : value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${units[i]}`;
}
