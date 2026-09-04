import { describe, expect, it } from 'vitest';

import { uploadFiles, UploadRequestError } from './upload-client';

/** Minimal XMLHttpRequest stand-in that lets a test script the response and progress events. */
class FakeXhr {
  status = 0;
  responseText = '';
  responseType = '';
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } =
    { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  opened: [string, string] | null = null;
  sent: FormData | null = null;
  aborted = false;

  constructor(private script: (xhr: FakeXhr) => void) {}
  open(method: string, url: string) {
    this.opened = [method, url];
  }
  send(body: FormData) {
    this.sent = body;
    queueMicrotask(() => this.script(this));
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

const file = new File([new Uint8Array(1000)], 'bilde.png', { type: 'image/png' });

describe('uploadFiles', () => {
  it('posts multipart form data, reports progress and revives dates', async () => {
    const progress: number[] = [];
    let captured: FakeXhr | null = null;
    const result = await uploadFiles(
      [file],
      { alt: ' Rådhuset ', credit: '', folder: 'Sport' },
      {
        createRequest: () => {
          captured = new FakeXhr((xhr) => {
            xhr.upload.onprogress?.({ lengthComputable: true, loaded: 500, total: 1000 });
            xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1000, total: 1000 });
            xhr.status = 200;
            xhr.responseText = JSON.stringify({
              media: [
                {
                  id: 'm1',
                  filename: 'bilde.png',
                  createdAt: '2026-09-04T10:00:00.000Z',
                  updatedAt: '2026-09-04T10:00:00.000Z',
                  deletedAt: null,
                  takenAt: null,
                },
              ],
              errors: [{ filename: 'annen.png', code: 'too_large', message: 'For stor' }],
            });
            xhr.onload?.();
          }) as unknown as FakeXhr;
          return captured as unknown as XMLHttpRequest;
        },
        onProgress: (p) => progress.push(p.percent),
      },
    );

    expect(progress).toEqual([50, 100]);
    expect(result.media[0]?.id).toBe('m1');
    expect(result.media[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.errors).toEqual([{ filename: 'annen.png', code: 'too_large', message: 'For stor' }]);

    const xhr = captured! as FakeXhr;
    expect(xhr.opened).toEqual(['POST', '/api/upload']);
    expect(xhr.sent?.getAll('file')).toHaveLength(1);
    expect(xhr.sent?.get('alt')).toBe('Rådhuset');
    expect(xhr.sent?.get('folder')).toBe('Sport');
    expect(xhr.sent?.has('credit')).toBe(false);
  });

  it('rejects with the server message and status when nothing was stored', async () => {
    await expect(
      uploadFiles(
        [file],
        {},
        {
          createRequest: () =>
            new FakeXhr((xhr) => {
              xhr.status = 415;
              xhr.responseText = JSON.stringify({
                error: { code: 'unsupported_type', message: 'Filtypen støttes ikke.' },
              });
              xhr.onload?.();
            }) as unknown as XMLHttpRequest,
        },
      ),
    ).rejects.toMatchObject({ status: 415, code: 'unsupported_type', message: 'Filtypen støttes ikke.' });
  });

  it('maps network failures and non-JSON responses to friendly errors', async () => {
    await expect(
      uploadFiles(
        [file],
        {},
        { createRequest: () => new FakeXhr((xhr) => xhr.onerror?.()) as unknown as XMLHttpRequest },
      ),
    ).rejects.toBeInstanceOf(UploadRequestError);
    await expect(
      uploadFiles(
        [file],
        {},
        {
          createRequest: () =>
            new FakeXhr((xhr) => {
              xhr.status = 401;
              xhr.responseText = '<html>login</html>';
              xhr.onload?.();
            }) as unknown as XMLHttpRequest,
        },
      ),
    ).rejects.toMatchObject({ status: 401, message: 'Du må logge inn på nytt.' });
  });

  it('aborts through an AbortSignal', async () => {
    const controller = new AbortController();
    const promise = uploadFiles(
      [file],
      {},
      {
        signal: controller.signal,
        createRequest: () => new FakeXhr(() => controller.abort()) as unknown as XMLHttpRequest,
      },
    );
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });
});
