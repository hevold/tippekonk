/**
 * Pure helpers for settings updates: merge a section payload into the
 * stored settings, validate the result, and describe what changed for the
 * audit log. Unit-tested in settings.test.ts.
 */
import { z } from 'zod';

import { siteSettingsSchema, type SiteSettings } from '@/lib/validation/site';

import { SECTION_KEYS, type SettingsSection, type SettingsKey } from './schema';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge one section into the current settings and parse the result with the
 * full schema. Only the keys belonging to the section are touched; within a
 * key the objects are merged one level deep so a partial payload keeps the
 * other fields. A `null` or `undefined` value removes the field, which lets
 * forms clear optional values (logo, OG image) and reset others to default.
 *
 * Throws ZodError (→ fieldErrors like "theme.primary") when invalid.
 */
export function mergeSettingsSection(
  current: SiteSettings,
  section: SettingsSection,
  payload: Record<string, unknown>,
): SiteSettings {
  const allowed = SECTION_KEYS[section];
  const unknown = Object.keys(payload).filter((k) => !(allowed as readonly string[]).includes(k));
  if (unknown.length > 0) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: [unknown[0] as string],
        message: `Feltet «${unknown[0]}» hører ikke til denne delen av innstillingene`,
        input: payload,
      },
    ]);
  }
  const next: Record<string, unknown> = { ...current };
  for (const key of allowed) {
    if (!(key in payload)) continue;
    const incoming = payload[key];
    if (!isPlainObject(incoming)) {
      throw new z.ZodError([{ code: 'custom', path: [key], message: 'Ugyldig format', input: incoming }]);
    }
    const base = isPlainObject(current[key as SettingsKey]) ? (current[key as SettingsKey] as object) : {};
    const merged: Record<string, unknown> = { ...base, ...incoming };
    for (const [field, value] of Object.entries(merged)) {
      if (value === null || value === undefined) delete merged[field];
    }
    next[key] = merged;
  }
  return siteSettingsSchema.parse(next);
}

export type SettingsChange = { key: string; before: unknown; after: unknown };

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.set(prefix, value);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Dotted keys whose value differs between two settings objects (arrays compared as a whole). */
export function settingsDiff(before: SiteSettings, after: SiteSettings): SettingsChange[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before, '', a);
  flatten(after, '', b);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const changes: SettingsChange[] = [];
  for (const key of [...keys].sort()) {
    const x = a.get(key);
    const y = b.get(key);
    if (!same(x, y)) changes.push({ key, before: x, after: y });
  }
  return changes;
}

const SECRET_KEY_RE = /(secret|password|token|key)$/i;

/** Compact audit payload: which keys changed, with before/after for non-secret scalars. */
export function describeChanges(changes: SettingsChange[]): {
  changed: string[];
  values: Record<string, { before: unknown; after: unknown }>;
} {
  const values: Record<string, { before: unknown; after: unknown }> = {};
  for (const c of changes) {
    if (SECRET_KEY_RE.test(c.key)) continue;
    const scalar = (v: unknown) =>
      v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v);
    if (scalar(c.before) && scalar(c.after))
      values[c.key] = { before: c.before ?? null, after: c.after ?? null };
  }
  return { changed: changes.map((c) => c.key), values };
}
