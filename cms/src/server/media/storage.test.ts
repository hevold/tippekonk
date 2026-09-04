import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertStorageKey,
  InvalidStorageKeyError,
  isValidStorageKey,
  LocalStorageAdapter,
  S3StorageAdapter,
} from './storage';

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

describe('storage key validation', () => {
  it('accepts the key scheme used for uploads', () => {
    expect(isValidStorageKey('2026/09/3f1c2a1e-0b6d-4f2a-9c1e-9d1a2b3c4d5e.jpg')).toBe(true);
    expect(isValidStorageKey('2026/09/3f1c2a1e-0b6d-4f2a-9c1e-9d1a2b3c4d5e-640.webp')).toBe(true);
    expect(isValidStorageKey('a')).toBe(true);
  });

  it('rejects traversal, absolute paths, uppercase and odd characters', () => {
    for (const key of [
      '../etc/passwd',
      '2026/../x.jpg',
      '/2026/x.jpg',
      '2026//x.jpg',
      'A.jpg',
      'x y.jpg',
      '.hidden',
      '2026/.',
      'x.jpg?x=1',
      '',
      'æ.jpg',
    ]) {
      expect(isValidStorageKey(key), key).toBe(false);
    }
    expect(isValidStorageKey(123)).toBe(false);
    expect(isValidStorageKey('a'.repeat(201))).toBe(false);
    expect(() => assertStorageKey('../x')).toThrow(InvalidStorageKeyError);
  });
});

describe('LocalStorageAdapter', () => {
  let root: string;
  let storage: LocalStorageAdapter;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'desken-storage-'));
    storage = new LocalStorageAdapter(root);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes, reads, heads and deletes an object (creating directories on demand)', async () => {
    const key = '2026/09/abc.txt';
    const data = Buffer.from('hei verden');
    await storage.put(key, data, 'text/plain');

    const head = await storage.head(key);
    expect(head?.size).toBe(data.length);
    expect(head?.etag).toMatch(/^W\/"/);

    const obj = await storage.get(key);
    expect(obj).not.toBeNull();
    expect((await readAll(obj!.body)).toString()).toBe('hei verden');

    // No temp files left behind after an atomic write.
    const files = await readdir(path.join(root, '2026/09'));
    expect(files).toEqual(['abc.txt']);

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.head(key)).toBeNull();
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it('serves byte ranges', async () => {
    const key = '2026/09/range.bin';
    await storage.put(key, Buffer.from('0123456789'), 'application/octet-stream');
    const part = await storage.getRange(key, 2, 5);
    expect(part?.size).toBe(4);
    expect((await readAll(part!.body)).toString()).toBe('2345');
    // End clamps to the file size.
    const tail = await storage.getRange(key, 8, 100);
    expect((await readAll(tail!.body)).toString()).toBe('89');
  });

  it('refuses keys that would escape the root', async () => {
    await expect(storage.put('../escape.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      InvalidStorageKeyError,
    );
    await expect(storage.get('../../etc/passwd')).rejects.toThrow(InvalidStorageKeyError);
    expect(() => storage.pathFor('2026/../../x')).toThrow(InvalidStorageKeyError);
    await expect(stat(path.join(root, '..', 'escape.txt'))).rejects.toThrow();
  });

  it('overwrites atomically and reports the new size', async () => {
    const key = '2026/09/over.txt';
    await storage.put(key, Buffer.from('first'), 'text/plain');
    await storage.put(key, Buffer.from('second!'), 'text/plain');
    expect((await storage.head(key))?.size).toBe(7);
  });

  it('builds root-relative public URLs', () => {
    expect(storage.publicUrl('2026/09/x.jpg')).toBe('/media/2026/09/x.jpg');
    expect(() => storage.publicUrl('../x')).toThrow(InvalidStorageKeyError);
  });
});

describe('S3StorageAdapter', () => {
  it('requires a bucket', () => {
    expect(() => new S3StorageAdapter({ bucket: '' })).toThrow();
  });

  it('prefers the CDN URL, then a path-style endpoint, then the virtual-host URL', () => {
    expect(
      new S3StorageAdapter({ bucket: 'b', publicUrl: 'https://cdn.example.no/' }).publicUrl('2026/09/x.jpg'),
    ).toBe('https://cdn.example.no/2026/09/x.jpg');
    expect(new S3StorageAdapter({ bucket: 'b', endpoint: 'http://localhost:9000/' }).publicUrl('x.jpg')).toBe(
      'http://localhost:9000/b/x.jpg',
    );
    expect(new S3StorageAdapter({ bucket: 'b', region: 'eu-north-1' }).publicUrl('x.jpg')).toBe(
      'https://b.s3.eu-north-1.amazonaws.com/x.jpg',
    );
    expect(new S3StorageAdapter({ bucket: 'b', region: 'auto' }).publicUrl('x.jpg')).toBe(
      'https://b.s3.amazonaws.com/x.jpg',
    );
  });
});
