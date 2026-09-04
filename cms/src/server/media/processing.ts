/**
 * Upload ingestion and image processing.
 *
 *   ingestUpload({ siteId, userId, filename, mime, buffer, alt, ... })  → Media row
 *   regenerateVariants(mediaId)                                        → Media (re-derives variants from the stored original)
 *   deleteMediaFiles(media)                                            → removes original + variants from storage
 *
 * Pipeline for every upload: sniff the real type with `file-type` (never
 * trust the browser's declared MIME; SVG is refused because it can carry
 * scripts), enforce size limits, then for images: read EXIF (taken-at and
 * orientation) before stripping all metadata, bake the orientation into the
 * pixels, measure, compute the dominant colour and render WebP variants at
 * IMAGE_WIDTHS — never upscaling. Files are written to storage before the
 * row is inserted; on a failed insert the files are removed again.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Metadata } from 'sharp';

import { db } from '@/db';
import { media, type Media, type MediaKind, type MediaVariant } from '@/db/schema';
import { ActionError, NotFoundError } from '@/server/actions';

import { readExifSummary, type ExifSummary } from './exif';
import {
  EXTENSION_BY_MIME,
  isAllowedMime,
  kindForMime,
  maxBytesFor,
  normalizeMime,
  type AllowedMime,
} from './mime';
import { getStorage, type StorageAdapter } from './storage';
import { sortedVariants } from './urls';

export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

/** WebP quality for generated variants; 82 is visually lossless for news photos at ~1/3 the JPEG size. */
export const VARIANT_QUALITY = 82;

/** Pixel budget so a hostile 30 000 × 30 000 PNG cannot exhaust memory. */
const MAX_PIXELS = 80_000_000;

export type UploadErrorReason = 'empty' | 'too_large' | 'unsupported_type' | 'type_mismatch' | 'corrupt';

/** HTTP status for each upload failure (the upload route maps these to responses). */
export const UPLOAD_ERROR_STATUS: Record<UploadErrorReason, number> = {
  empty: 400,
  too_large: 413,
  unsupported_type: 415,
  type_mismatch: 415,
  corrupt: 422,
};

export class UploadError extends ActionError {
  constructor(
    message: string,
    public reason: UploadErrorReason,
  ) {
    super(message, 'validation');
    this.name = 'UploadError';
  }

  get status(): number {
    return UPLOAD_ERROR_STATUS[this.reason];
  }
}

export type IngestInput = {
  siteId: string;
  userId: string;
  filename: string;
  /** MIME type declared by the client; only used to detect mismatches. */
  mime: string;
  buffer: Buffer;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  folder?: string | null;
  /** Override the storage adapter (tests). */
  storage?: StorageAdapter;
  /** Override "now" for the key prefix (tests). */
  now?: Date;
};

/* -------------------------------------------------------------------------- */
/*  Type sniffing                                                              */
/* -------------------------------------------------------------------------- */

export type SniffResult = { mime: AllowedMime; kind: MediaKind; ext: string };

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * Determine the real type of an upload. Rejects empty files, unknown or
 * disallowed types, declared/actual mismatches, and oversize files.
 */
export async function sniffUpload(buffer: Buffer, declaredMime: string, filename = ''): Promise<SniffResult> {
  if (buffer.length === 0) throw new UploadError('Filen er tom.', 'empty');

  const detected = await fileTypeFromBuffer(buffer);
  const actual = normalizeMime(detected?.mime);
  const declared = normalizeMime(declaredMime);

  if (!actual || !isAllowedMime(actual)) {
    if (actual === 'image/svg+xml' || declared === 'image/svg+xml' || /\.svg$/i.test(filename)) {
      throw new UploadError(
        'SVG-filer kan ikke lastes opp av sikkerhetshensyn. Konverter til PNG eller WebP.',
        'unsupported_type',
      );
    }
    throw new UploadError(
      `Filtypen ${actual || declared || 'ukjent'} støttes ikke. Bruk JPEG, PNG, WebP, GIF, AVIF, MP4, MP3 eller PDF.`,
      'unsupported_type',
    );
  }

  // A declared type that is itself allowed but disagrees with the bytes is suspicious (e.g. a PDF renamed to .jpg).
  if (declared && declared !== 'application/octet-stream' && isAllowedMime(declared) && declared !== actual) {
    throw new UploadError(
      `Filen ser ut til å være ${actual}, ikke ${declared} som oppgitt. Sjekk filen og prøv igjen.`,
      'type_mismatch',
    );
  }

  const limit = maxBytesFor(actual);
  if (buffer.length > limit) {
    throw new UploadError(
      `Filen er for stor (${formatMb(buffer.length)}). Maks ${formatMb(limit)}.`,
      'too_large',
    );
  }

  return { mime: actual, kind: kindForMime(actual), ext: EXTENSION_BY_MIME[actual] };
}

/* -------------------------------------------------------------------------- */
/*  Keys                                                                       */
/* -------------------------------------------------------------------------- */

/** "2026/09/<uuid>.jpg" — spreads files over directories and keeps keys unguessable. */
export function makeStorageKey(ext: string, now = new Date(), id = randomUUID()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${id}.${ext}`;
}

/** "2026/09/<uuid>-640.webp" for the original key "2026/09/<uuid>.jpg". */
export function variantKey(originalKey: string, width: number): string {
  return `${originalKey.replace(/\.[a-z0-9]+$/i, '')}-${width}.webp`;
}

/* -------------------------------------------------------------------------- */
/*  Image processing                                                           */
/* -------------------------------------------------------------------------- */

export type ProcessedImage = {
  /** Re-encoded original with orientation applied and metadata stripped (GIFs are kept byte-for-byte). */
  original: Buffer;
  width: number;
  height: number;
  dominantColor: string;
  exif: ExifSummary;
  /** Rendered variants in ascending width order. */
  variants: { width: number; height: number; buffer: Buffer }[];
};

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/** Render WebP variants at every IMAGE_WIDTH not wider than the source. */
async function renderVariants(
  source: Buffer,
  sourceWidth: number,
  widths: readonly number[],
): Promise<ProcessedImage['variants']> {
  const out: ProcessedImage['variants'] = [];
  for (const width of widths) {
    if (width > sourceWidth) continue;
    const { data, info } = await sharp(source, { animated: false })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: VARIANT_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    out.push({ width: info.width, height: info.height, buffer: data });
  }
  return out;
}

/**
 * Normalise an uploaded image: read EXIF, apply orientation, strip metadata,
 * measure, compute dominant colour and render variants. Throws UploadError
 * for undecodable input.
 */
export async function processImage(buffer: Buffer, mime: AllowedMime): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { animated: false }).metadata();
  } catch {
    throw new UploadError('Bildet kunne ikke leses. Filen kan være skadet.', 'corrupt');
  }
  if (!meta.width || !meta.height)
    throw new UploadError('Bildet kunne ikke leses. Filen kan være skadet.', 'corrupt');
  if (meta.width * meta.height > MAX_PIXELS) {
    throw new UploadError(
      'Bildet har for mange piksler (maks 80 megapiksler). Skaler det ned først.',
      'too_large',
    );
  }

  const exif = readExifSummary(meta.exif);
  if (exif.orientation === null && meta.orientation) exif.orientation = meta.orientation;

  let original: Buffer;
  try {
    // rotate() with no angle bakes the EXIF orientation into the pixels; sharp strips metadata unless asked to keep it.
    const oriented = sharp(buffer, { animated: false }).rotate();
    switch (mime) {
      case 'image/jpeg':
        original = await oriented.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        break;
      case 'image/png':
        original = await oriented.png({ compressionLevel: 8 }).toBuffer();
        break;
      case 'image/webp':
        original = await oriented.webp({ quality: 90 }).toBuffer();
        break;
      case 'image/avif':
        original = await oriented.avif({ quality: 65, effort: 4 }).toBuffer();
        break;
      default:
        // GIF: keep the animation and bytes untouched (GIF has no EXIF block to strip).
        original = buffer;
    }
  } catch {
    throw new UploadError('Bildet kunne ikke behandles. Filen kan være skadet.', 'corrupt');
  }

  const orientedMeta = mime === 'image/gif' ? meta : await sharp(original).metadata();
  const width = orientedMeta.width ?? meta.width;
  const height = orientedMeta.height ?? meta.height;

  const stats = await sharp(original, { animated: false }).stats();
  const dominantColor = `#${toHex(stats.dominant.r)}${toHex(stats.dominant.g)}${toHex(stats.dominant.b)}`;

  // GIFs get a single still poster (largest standard width that fits, capped at 960 px) for grids and previews.
  const posterWidth = Math.min(960, IMAGE_WIDTHS.filter((w) => w <= width).pop() ?? width);
  const variants = await renderVariants(original, width, mime === 'image/gif' ? [posterWidth] : IMAGE_WIDTHS);

  return { original, width, height, dominantColor, exif, variants };
}

/* -------------------------------------------------------------------------- */
/*  Ingest                                                                     */
/* -------------------------------------------------------------------------- */

function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Drop control characters (including NUL) that some clients leak into filenames.
  return (
    base
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 255) || 'fil'
  );
}

/** Best-effort cleanup used when a later step fails; never throws. */
async function removeKeys(storage: StorageAdapter, keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => storage.delete(k).catch(() => {})));
}

/**
 * Validate, process and store an upload, then insert its media row.
 * Throws UploadError (client fault) or rethrows storage/database errors.
 */
export async function ingestUpload(input: IngestInput): Promise<Media> {
  const storage = input.storage ?? getStorage();
  const filename = cleanFilename(input.filename);
  const sniff = await sniffUpload(input.buffer, input.mime, filename);
  const originalKey = makeStorageKey(sniff.ext, input.now);
  const written: string[] = [];

  try {
    let row: typeof media.$inferInsert;

    if (sniff.kind === 'image') {
      const processed = await processImage(input.buffer, sniff.mime);
      await storage.put(originalKey, processed.original, sniff.mime);
      written.push(originalKey);

      const variants: Record<string, MediaVariant> = {};
      for (const v of processed.variants) {
        const key = variantKey(originalKey, v.width);
        await storage.put(key, v.buffer, 'image/webp');
        written.push(key);
        variants[String(v.width)] = {
          key,
          width: v.width,
          height: v.height,
          format: 'webp',
          size: v.buffer.length,
        };
      }

      const exifRecord: Record<string, unknown> = {};
      if (processed.exif.orientation !== null) exifRecord.orientation = processed.exif.orientation;
      if (processed.exif.dateTimeOriginal) exifRecord.dateTimeOriginal = processed.exif.dateTimeOriginal;
      if (processed.exif.offsetTime) exifRecord.offsetTime = processed.exif.offsetTime;

      row = {
        siteId: input.siteId,
        kind: 'image',
        filename,
        storageKey: originalKey,
        mime: sniff.mime,
        size: processed.original.length,
        width: processed.width,
        height: processed.height,
        alt: input.alt?.trim() || null,
        caption: input.caption?.trim() || null,
        credit: input.credit?.trim() || null,
        folder: input.folder?.trim() || null,
        variants,
        dominantColor: processed.dominantColor,
        exif: Object.keys(exifRecord).length ? exifRecord : null,
        takenAt: processed.exif.takenAt,
        uploadedBy: input.userId,
      };
    } else {
      await storage.put(originalKey, input.buffer, sniff.mime);
      written.push(originalKey);
      row = {
        siteId: input.siteId,
        kind: sniff.kind,
        filename,
        storageKey: originalKey,
        mime: sniff.mime,
        size: input.buffer.length,
        alt: input.alt?.trim() || null,
        caption: input.caption?.trim() || null,
        credit: input.credit?.trim() || null,
        folder: input.folder?.trim() || null,
        variants: {},
        uploadedBy: input.userId,
      };
    }

    const [inserted] = await db.insert(media).values(row).returning();
    if (!inserted) throw new Error('Kunne ikke lagre mediefilen i databasen.');
    return inserted;
  } catch (err) {
    await removeKeys(storage, written);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Maintenance                                                                */
/* -------------------------------------------------------------------------- */

async function readAll(body: ReadableStream | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Re-render the variants of an image from its stored original (e.g. after
 * IMAGE_WIDTHS changed or files went missing). Old variant files that are no
 * longer produced are removed.
 */
export async function regenerateVariants(
  mediaId: string,
  storage: StorageAdapter = getStorage(),
): Promise<Media> {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row) throw new NotFoundError('Fant ikke mediefilen.');
  if (row.kind !== 'image') return row;
  if (!isAllowedMime(row.mime)) throw new ActionError('Bildeformatet støttes ikke lenger.', 'validation');

  const object = await storage.get(row.storageKey);
  if (!object) throw new NotFoundError('Originalfilen finnes ikke i lagringen.');
  const original = await readAll(object.body);
  const processed = await processImage(original, row.mime);

  const variants: Record<string, MediaVariant> = {};
  for (const v of processed.variants) {
    const key = variantKey(row.storageKey, v.width);
    await storage.put(key, v.buffer, 'image/webp');
    variants[String(v.width)] = {
      key,
      width: v.width,
      height: v.height,
      format: 'webp',
      size: v.buffer.length,
    };
  }
  const produced = new Set(Object.values(variants).map((v) => v.key));
  const stale = sortedVariants(row.variants)
    .map((v) => v.key)
    .filter((k) => !produced.has(k));
  await removeKeys(storage, stale);

  const [updated] = await db
    .update(media)
    .set({
      variants,
      width: processed.width,
      height: processed.height,
      dominantColor: processed.dominantColor,
      updatedAt: new Date(),
    })
    .where(eq(media.id, row.id))
    .returning();
  return updated ?? row;
}

/** Remove the original and every variant from storage (missing files are ignored). */
export async function deleteMediaFiles(
  item: Pick<Media, 'storageKey' | 'variants'>,
  storage: StorageAdapter = getStorage(),
): Promise<void> {
  const keys = [item.storageKey, ...sortedVariants(item.variants).map((v) => v.key)];
  const results = await Promise.allSettled(keys.map((k) => storage.delete(k)));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}
