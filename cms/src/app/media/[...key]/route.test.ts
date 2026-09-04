import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalStorageAdapter, setStorage } from '@/server/media/storage';

import { GET, HEAD } from './route';

let root: string;
const key = '2026/09/11111111-1111-4111-8111-111111111111.mp4';
const body = Buffer.from('0123456789abcdefghij'); // 20 bytes

function ctx(k: string) {
  return { params: Promise.resolve({ key: k.split('/') }) };
}

function req(k: string, headers: Record<string, string> = {}, query = '') {
  return new Request(`http://localhost/media/${k}${query}`, { headers });
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'desken-media-route-'));
  const storage = new LocalStorageAdapter(root);
  await storage.put(key, body, 'video/mp4');
  await storage.put('2026/09/a.webp', Buffer.from('RIFF'), 'image/webp');
  setStorage(storage);
});

afterAll(async () => {
  setStorage(null);
  await rm(root, { recursive: true, force: true });
});

describe('GET /media/[...key]', () => {
  it('serves the file with immutable caching, ETag and the right Content-Type', async () => {
    const res = await GET(req(key), ctx(key));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe('20');
    expect(res.headers.get('etag')).toMatch(/^W\//);
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);

    const webp = await GET(req('2026/09/a.webp'), ctx('2026/09/a.webp'));
    expect(webp.headers.get('content-type')).toBe('image/webp');
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const first = await GET(req(key), ctx(key));
    const etag = first.headers.get('etag')!;
    const res = await GET(req(key, { 'if-none-match': etag }), ctx(key));
    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe(etag);
  });

  it('serves byte ranges with 206 and Content-Range', async () => {
    const res = await GET(req(key, { range: 'bytes=5-9' }), ctx(key));
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 5-9/20');
    expect(res.headers.get('content-length')).toBe('5');
    expect(await res.text()).toBe('56789');

    const tail = await GET(req(key, { range: 'bytes=-3' }), ctx(key));
    expect(tail.status).toBe(206);
    expect(await tail.text()).toBe('hij');
  });

  it('rejects unsatisfiable ranges with 416', async () => {
    const res = await GET(req(key, { range: 'bytes=99-' }), ctx(key));
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */20');
  });

  it('returns 404 for missing files and 400 for invalid keys', async () => {
    const missing = '2026/09/nope.jpg';
    expect((await GET(req(missing), ctx(missing))).status).toBe(404);
    const bad = await GET(req('../../etc/passwd'), {
      params: Promise.resolve({ key: ['..', '..', 'etc', 'passwd'] }),
    });
    expect(bad.status).toBe(400);
    const upper = await GET(req('2026/09/X.JPG'), ctx('2026/09/X.JPG'));
    expect(upper.status).toBe(400);
  });

  it('forces a download with a safe Content-Disposition when asked', async () => {
    const res = await GET(req(key, {}, '?download=R%C3%A5dhuset%20%22h%C3%B8st%22.mp4'), ctx(key));
    expect(res.status).toBe(200);
    const cd = res.headers.get('content-disposition')!;
    expect(cd.startsWith('attachment; filename="R_dhuset _h_st_.mp4"; filename*=UTF-8\'\'')).toBe(true);
    expect(cd).toContain(encodeURIComponent('Rådhuset "høst".mp4'));
  });
});

describe('HEAD /media/[...key]', () => {
  it('returns headers only', async () => {
    const res = await HEAD(req(key), ctx(key));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('20');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.body).toBeNull();
    expect((await HEAD(req('2026/09/nope.jpg'), ctx('2026/09/nope.jpg'))).status).toBe(404);
  });
});
