/**
 * GET/HEAD /media/<key> — serves stored originals and variants for every
 * storage driver (local disk, or proxied from S3 when no CDN URL is set).
 *
 * Keys are content-addressed (uuid based) and never reused, so responses are
 * immutable and cached for a year. Supports conditional requests (ETag) and
 * single byte ranges so <video>/<audio> can seek. `?download=1` forces an
 * attachment with the original filename (admin "Last ned original").
 */
import { mimeFromKey } from '@/server/media/mime';
import { contentRange, parseRange } from '@/server/media/range';
import { getStorage, isValidStorageKey, type StorageObject } from '@/server/media/storage';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string[] }> };

const IMMUTABLE = 'public, max-age=31536000, immutable';

function baseHeaders(contentType: string, obj: { etag?: string; lastModified?: Date }): Headers {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': IMMUTABLE,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  if (obj.etag) headers.set('ETag', obj.etag);
  if (obj.lastModified) headers.set('Last-Modified', obj.lastModified.toUTCString());
  return headers;
}

/** RFC 6266 attachment header with an ASCII fallback and a UTF-8 filename*. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function etagMatches(header: string | null, etag: string | undefined): boolean {
  if (!header || !etag) return false;
  if (header.trim() === '*') return true;
  const normalize = (v: string) => v.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => normalize(candidate) === normalize(etag));
}

async function respond(request: Request, ctx: Ctx, includeBody: boolean): Promise<Response> {
  const { key: segments } = await ctx.params;
  const key = (segments ?? []).join('/');
  if (!isValidStorageKey(key)) {
    return Response.json({ error: { code: 'invalid_key', message: 'Ugyldig filnøkkel.' } }, { status: 400 });
  }

  const storage = getStorage();
  const url = new URL(request.url);
  const contentType = mimeFromKey(key);
  const download = url.searchParams.get('download');

  // Metadata first: cheap, and enough for HEAD and conditional GETs.
  const head = storage.head ? await storage.head(key) : null;
  if (storage.head && !head) {
    return Response.json({ error: { code: 'not_found', message: 'Filen finnes ikke.' } }, { status: 404 });
  }

  if (head && etagMatches(request.headers.get('if-none-match'), head.etag)) {
    return new Response(null, { status: 304, headers: baseHeaders(contentType, head) });
  }

  const size = head?.size;
  const range = size !== undefined ? parseRange(request.headers.get('range'), size) : null;
  if (range === 'unsatisfiable' && size !== undefined) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Cache-Control': IMMUTABLE },
    });
  }

  if (!includeBody) {
    const headers = baseHeaders(contentType, head ?? {});
    if (size !== undefined) headers.set('Content-Length', String(size));
    if (download)
      headers.set(
        'Content-Disposition',
        contentDisposition(download === '1' ? (key.split('/').pop() ?? key) : download),
      );
    return new Response(null, { status: 200, headers });
  }

  let obj: StorageObject | null;
  if (range && range !== 'unsatisfiable' && storage.getRange) {
    obj = await storage.getRange(key, range.start, range.end);
  } else {
    obj = await storage.get(key);
  }
  if (!obj) {
    return Response.json({ error: { code: 'not_found', message: 'Filen finnes ikke.' } }, { status: 404 });
  }

  const headers = baseHeaders(obj.contentType ?? contentType, obj);
  if (download) {
    headers.set(
      'Content-Disposition',
      contentDisposition(download === '1' ? (key.split('/').pop() ?? key) : download),
    );
  }

  const partial = range && range !== 'unsatisfiable' && storage.getRange && size !== undefined;
  if (partial) {
    headers.set('Content-Range', contentRange(range, size));
    headers.set('Content-Length', String(range.end - range.start + 1));
    return new Response(obj.body as BodyInit, { status: 206, headers });
  }
  if (obj.size !== undefined) headers.set('Content-Length', String(obj.size));
  return new Response(obj.body as BodyInit, { status: 200, headers });
}

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    return await respond(request, ctx, true);
  } catch (err) {
    console.error('[media] serve failed', err);
    return Response.json(
      { error: { code: 'internal', message: 'Kunne ikke hente filen.' } },
      { status: 500 },
    );
  }
}

export async function HEAD(request: Request, ctx: Ctx): Promise<Response> {
  try {
    return await respond(request, ctx, false);
  } catch (err) {
    console.error('[media] head failed', err);
    return new Response(null, { status: 500 });
  }
}
