/**
 * Storage adapters for uploaded files. Two drivers:
 *
 *  - LocalStorageAdapter: files under `UPLOAD_DIR`, served by `/media/[...key]`.
 *    Writes are atomic (temp file + rename) so a crash never leaves a half file.
 *  - S3StorageAdapter: any S3-compatible bucket (AWS, MinIO, Cloudflare R2, …).
 *
 * Keys are relative paths like "2026/09/<uuid>.jpg" and are validated
 * strictly (lowercase alphanumerics, "/", "_", ".", "-"; no ".." segments),
 * which makes them safe both on disk and in URLs.
 *
 * `getStorage()` returns the process-wide adapter chosen by STORAGE_DRIVER;
 * tests call `setStorage()` with a LocalStorageAdapter on a temp directory.
 */
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { env } from '@/env';

import { mimeFromKey } from './mime';

export type StorageObject = {
  body: ReadableStream | Buffer;
  contentType?: string;
  size?: number;
  etag?: string;
  lastModified?: Date;
};

export type StorageHead = {
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
};

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  /** Absolute or root-relative URL that serves the object (local: /media/<key>). */
  publicUrl(key: string): string;
  /** Metadata without the body (for ETag / HEAD). Optional for adapters that cannot do it cheaply. */
  head?(key: string): Promise<StorageHead | null>;
  /** Byte range [start, end] inclusive, for video/audio seeking. */
  getRange?(key: string, start: number, end: number): Promise<StorageObject | null>;
}

/* -------------------------------------------------------------------------- */
/*  Key validation                                                             */
/* -------------------------------------------------------------------------- */

const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]*(?:\/[a-z0-9][a-z0-9_.-]*)*$/;
export const MAX_KEY_LENGTH = 200;

export function isValidStorageKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (!KEY_PATTERN.test(key)) return false;
  return !key.split('/').some((segment) => segment === '.' || segment === '..');
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Ugyldig lagringsnøkkel: ${JSON.stringify(key).slice(0, 80)}`);
    this.name = 'InvalidStorageKeyError';
  }
}

export function assertStorageKey(key: string): void {
  if (!isValidStorageKey(key)) throw new InvalidStorageKeyError(key);
}

/** Weak ETag derived from size and mtime; stable across restarts, cheap to compute. */
function fileEtag(size: number, mtimeMs: number): string {
  return `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

function toWebStream(readable: Readable): ReadableStream {
  return Readable.toWeb(readable) as ReadableStream;
}

/* -------------------------------------------------------------------------- */
/*  Local disk                                                                 */
/* -------------------------------------------------------------------------- */

export class LocalStorageAdapter implements StorageAdapter {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Absolute path for a key; throws on invalid keys and never escapes the root. */
  pathFor(key: string): string {
    assertStorageKey(key);
    const file = path.resolve(this.root, key);
    if (file !== this.root && !file.startsWith(this.root + path.sep)) {
      throw new InvalidStorageKeyError(key);
    }
    return file;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tmp, data, { flag: 'wx' });
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async head(key: string): Promise<StorageHead | null> {
    const file = this.pathFor(key);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return null;
      return {
        size: stat.size,
        contentType: mimeFromKey(key),
        etag: fileEtag(stat.size, stat.mtimeMs),
        lastModified: stat.mtime,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    const file = this.pathFor(key);
    const head = await this.head(key);
    if (!head) return null;
    return { ...head, body: toWebStream(createReadStream(file)) };
  }

  async getRange(key: string, start: number, end: number): Promise<StorageObject | null> {
    const file = this.pathFor(key);
    const head = await this.head(key);
    if (!head) return null;
    const last = Math.min(end, head.size - 1);
    return {
      ...head,
      size: last - start + 1,
      body: toWebStream(createReadStream(file, { start, end: last })),
    };
  }

  async delete(key: string): Promise<void> {
    const file = this.pathFor(key);
    try {
      await fs.unlink(file);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  publicUrl(key: string): string {
    assertStorageKey(key);
    return `/media/${key}`;
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}

/* -------------------------------------------------------------------------- */
/*  S3-compatible                                                              */
/* -------------------------------------------------------------------------- */

export type S3Options = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
};

type S3Module = typeof import('@aws-sdk/client-s3');

export class S3StorageAdapter implements StorageAdapter {
  private client: Promise<InstanceType<S3Module['S3Client']>> | null = null;
  private sdk: Promise<S3Module> | null = null;

  constructor(private readonly opts: S3Options) {
    if (!opts.bucket) throw new Error('S3_BUCKET må settes når STORAGE_DRIVER=s3.');
  }

  private loadSdk(): Promise<S3Module> {
    // Lazy import keeps the (large) SDK out of the local-driver code path.
    this.sdk ??= import('@aws-sdk/client-s3');
    return this.sdk;
  }

  private async getClient() {
    this.client ??= this.loadSdk().then(
      ({ S3Client }) =>
        new S3Client({
          region: this.opts.region ?? 'auto',
          endpoint: this.opts.endpoint || undefined,
          // Path-style is what MinIO and most self-hosted S3 clones expect.
          forcePathStyle: Boolean(this.opts.endpoint),
          credentials:
            this.opts.accessKeyId && this.opts.secretAccessKey
              ? { accessKeyId: this.opts.accessKeyId, secretAccessKey: this.opts.secretAccessKey }
              : undefined,
        }),
    );
    return this.client;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    assertStorageKey(key);
    const [{ PutObjectCommand }, client] = await Promise.all([this.loadSdk(), this.getClient()]);
    await client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async head(key: string): Promise<StorageHead | null> {
    assertStorageKey(key);
    const [{ HeadObjectCommand }, client] = await Promise.all([this.loadSdk(), this.getClient()]);
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? mimeFromKey(key),
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    return this.fetch(key);
  }

  async getRange(key: string, start: number, end: number): Promise<StorageObject | null> {
    return this.fetch(key, `bytes=${start}-${end}`);
  }

  private async fetch(key: string, range?: string): Promise<StorageObject | null> {
    assertStorageKey(key);
    const [{ GetObjectCommand }, client] = await Promise.all([this.loadSdk(), this.getClient()]);
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key, Range: range }));
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream() as ReadableStream,
        contentType: res.ContentType ?? mimeFromKey(key),
        size: res.ContentLength,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    const [{ DeleteObjectCommand }, client] = await Promise.all([this.loadSdk(), this.getClient()]);
    await client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    assertStorageKey(key);
    const base = this.opts.publicUrl?.replace(/\/+$/, '');
    if (base) return `${base}/${key}`;
    if (this.opts.endpoint) return `${this.opts.endpoint.replace(/\/+$/, '')}/${this.opts.bucket}/${key}`;
    const region = this.opts.region && this.opts.region !== 'auto' ? `.${this.opts.region}` : '';
    return `https://${this.opts.bucket}.s3${region}.amazonaws.com/${key}`;
  }
}

function isS3NotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

/* -------------------------------------------------------------------------- */
/*  Singleton                                                                  */
/* -------------------------------------------------------------------------- */

const g = globalThis as unknown as { __deskenStorage?: StorageAdapter | null };

export function createStorage(): StorageAdapter {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3StorageAdapter({
      bucket: env.S3_BUCKET ?? '',
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrl: env.S3_PUBLIC_URL,
    });
  }
  return new LocalStorageAdapter(env.UPLOAD_DIR);
}

export function getStorage(): StorageAdapter {
  g.__deskenStorage ??= createStorage();
  return g.__deskenStorage;
}

/** Replace the active adapter (tests) or reset to the env-configured one (null). */
export function setStorage(adapter: StorageAdapter | null): void {
  g.__deskenStorage = adapter;
}

export function storageDriver(): 'local' | 's3' {
  return env.STORAGE_DRIVER;
}
