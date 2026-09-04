/**
 * POST /api/upload — multipart upload endpoint used by <UploadDropzone> and
 * the media picker. Server actions are capped by bodySizeLimit, so large
 * files (video, PDF) always go through this route.
 *
 * Form fields: file (repeatable; "files" also accepted), alt, caption,
 * credit, folder. Requires a signed-in admin user with media:upload and a
 * same-origin request (session cookies are sent automatically, so the
 * Origin/Sec-Fetch-Site check is what stops cross-site uploads).
 *
 * Responses: 200 { media: Media[], errors?: [...] } when at least one file
 * was stored; otherwise { error: { code, message } } with 400/401/403/413/
 * 415/422/500.
 */
import type { Media } from '@/db/schema';
import { uploadFieldsSchema } from '@/lib/validation/media';
import { ActionError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
// INTEGRATION: provided by the auth area (SPEC 4.2).
import { getOptionalAdminContext } from '@/server/auth/context';
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, normalizeMime } from '@/server/media/mime';
import { ingestUpload, UploadError } from '@/server/media/processing';

export const dynamic = 'force-dynamic';

/** Files per request; the dropzone batches larger selections. */
export const MAX_FILES_PER_REQUEST = 20;

type UploadFailure = { filename: string; code: string; message: string };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return errorResponse(403, 'forbidden', 'Opplasting må skje fra samme nettsted.');
  }

  const ctx = await getOptionalAdminContext();
  if (!ctx) return errorResponse(401, 'unauthorized', 'Du må logge inn for å laste opp filer.');
  if (!ctx.can('media:upload'))
    return errorResponse(403, 'forbidden', 'Du har ikke tilgang til å laste opp filer.');

  // Cheap guard before parsing: the declared length may lie, but it stops obvious abuse early.
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FILE_BYTES * MAX_FILES_PER_REQUEST) {
    return errorResponse(413, 'too_large', 'Forespørselen er for stor.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, 'bad_request', 'Forventet et multipart-skjema med minst én fil.');
  }

  const files = [...form.getAll('file'), ...form.getAll('files')].filter((f): f is File => f instanceof File);
  if (files.length === 0) return errorResponse(400, 'no_files', 'Ingen filer ble sendt.');
  if (files.length > MAX_FILES_PER_REQUEST) {
    return errorResponse(400, 'too_many_files', `Maks ${MAX_FILES_PER_REQUEST} filer per opplasting.`);
  }

  const parsedFields = uploadFieldsSchema.safeParse({
    alt: form.get('alt'),
    caption: form.get('caption'),
    credit: form.get('credit'),
    folder: form.get('folder'),
  });
  if (!parsedFields.success) {
    return errorResponse(400, 'validation', parsedFields.error.issues[0]?.message ?? 'Ugyldige felter.');
  }
  const fields = parsedFields.data;

  const stored: Media[] = [];
  const failures: UploadFailure[] = [];
  let firstStatus = 400;

  for (const file of files) {
    const mime = normalizeMime(file.type);
    const limit = mime.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) {
      failures.push({
        filename: file.name,
        code: 'too_large',
        message: `«${file.name}» er for stor (maks ${Math.round(limit / 1024 / 1024)} MB).`,
      });
      if (failures.length === 1) firstStatus = 413;
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const media = await ingestUpload({
        siteId: ctx.site.id,
        userId: ctx.user.id,
        filename: file.name,
        mime,
        buffer,
        alt: fields.alt,
        caption: fields.caption,
        credit: fields.credit,
        folder: fields.folder,
      });
      stored.push(media);
      await auditFromContext(ctx, {
        action: 'media.upload',
        entityType: 'media',
        entityId: media.id,
        summary: `Lastet opp «${media.filename}»`,
        data: {
          kind: media.kind,
          mime: media.mime,
          size: media.size,
          width: media.width,
          height: media.height,
        },
      });
    } catch (err) {
      if (err instanceof UploadError) {
        failures.push({ filename: file.name, code: err.reason, message: err.message });
        if (failures.length === 1) firstStatus = err.status;
      } else if (err instanceof ActionError) {
        failures.push({ filename: file.name, code: err.code, message: err.message });
        if (failures.length === 1) firstStatus = 400;
      } else {
        console.error('[media] upload failed', err);
        failures.push({
          filename: file.name,
          code: 'internal',
          message: `«${file.name}» kunne ikke lagres. Prøv igjen.`,
        });
        if (failures.length === 1) firstStatus = 500;
      }
    }
  }

  if (stored.length === 0) {
    const first = failures[0];
    return errorResponse(firstStatus, first?.code ?? 'internal', first?.message ?? 'Opplastingen mislyktes.');
  }
  return Response.json(failures.length ? { media: stored, errors: failures } : { media: stored }, {
    status: 200,
  });
}
