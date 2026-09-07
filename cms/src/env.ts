/**
 * Validated environment. Import `env` instead of touching process.env.
 * Works in Next.js server code and in tsx scripts.
 */
import { z } from 'zod';

const DEV_FALLBACK_SECRET = 'desken-dev-secret-change-me-before-production-use-0000';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Postgres connection string. When unset, an embedded PGlite database is used. */
  DATABASE_URL: z.string().url().optional().or(z.literal('')),
  /** Directory for the embedded PGlite database (used when DATABASE_URL is unset). */
  PGLITE_DIR: z.string().default('./data/pglite'),
  /** Run pending migrations on boot. */
  AUTO_MIGRATE: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  /** Secret for session/token signing and TOTP secret encryption. ≥32 chars in production. */
  APP_SECRET: z.string().min(16).default(DEV_FALLBACK_SECRET),
  /** Canonical public URL of the installation (used in emails and absolute links). */
  APP_URL: z.string().url().default('http://localhost:3000'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL for S3 objects (CDN). */
  S3_PUBLIC_URL: z.string().optional(),
  /** smtp://user:pass@host:587 — when unset, emails are logged to the console. */
  SMTP_URL: z.string().optional().or(z.literal('')),
  MAIL_FROM: z.string().default('Desken <no-reply@localhost>'),
  /** Protects /api/cron/* when an external scheduler is used. */
  CRON_SECRET: z.string().optional(),
  /** Run the in-process scheduler (scheduled publishing, webhook retries). */
  ENABLE_INTERNAL_SCHEDULER: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  /** Trust X-Forwarded-* headers from a reverse proxy. */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ugyldig miljøkonfigurasjon:\n${issues}`);
  }
  const env = parsed.data;
  // `next build` evaluates route modules with NODE_ENV=production while collecting page data,
  // long before deployment secrets exist; the production check belongs to boot, not to the build.
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  if (env.NODE_ENV === 'production' && !building) {
    if (env.APP_SECRET === DEV_FALLBACK_SECRET || env.APP_SECRET.length < 32) {
      throw new Error('APP_SECRET må settes til en tilfeldig streng på minst 32 tegn i produksjon.');
    }
  } else if (env.APP_SECRET === DEV_FALLBACK_SECRET && env.NODE_ENV !== 'test') {
    console.warn('[desken] APP_SECRET er ikke satt – bruker usikker utviklingsnøkkel.');
  }
  return env;
}

export const env = load();
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const usesPglite = !env.DATABASE_URL;
