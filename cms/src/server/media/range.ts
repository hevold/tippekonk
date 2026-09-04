/**
 * HTTP Range header parsing for the media route (video/audio seeking).
 * Pure module. Only single byte ranges are supported — browsers never send
 * multipart ranges for media playback.
 *
 *   parseRange('bytes=0-499', 1000)   → { start: 0, end: 499 }
 *   parseRange('bytes=500-', 1000)    → { start: 500, end: 999 }
 *   parseRange('bytes=-200', 1000)    → { start: 800, end: 999 }
 *   parseRange('bytes=2000-', 1000)   → 'unsatisfiable'   (respond 416)
 *   parseRange(null, 1000)            → null              (serve the whole file)
 */

export type ByteRange = { start: number; end: number };

export function parseRange(
  header: string | null | undefined,
  size: number,
): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // Unknown units or multi-range specs are ignored (full response), as RFC 9110 allows.
  if (!m) return null;
  const [, startRaw, endRaw] = m;
  if (startRaw === '' && endRaw === '') return null;
  if (!Number.isFinite(size) || size <= 0) return 'unsatisfiable';

  let start: number;
  let end: number;
  if (startRaw === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(endRaw);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return 'unsatisfiable';
  }
  return { start, end };
}

/** Value for the Content-Range header of a 206 response. */
export function contentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
