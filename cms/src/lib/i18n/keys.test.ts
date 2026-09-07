/**
 * Every literal translation key used in the code base must exist in the
 * bokmål dictionary (the source of truth). Catches the classic integration
 * slip where one area references a key another area never added.
 *
 * Covered call shapes: `t('a.b')`, `t("a.b")`, `t(\`a.b.${x}\`)` (prefix must
 * match at least one key), and plural keys resolved as `<key>.one/.other`.
 * Keys built from variables (`t(item.labelKey)`) are out of scope here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from './messages/en';
import nb from './messages/nb';
import nn from './messages/nn';

const SRC = join(__dirname, '..', '..');
const MESSAGES_DIR = join(__dirname, 'messages');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (full.startsWith(MESSAGES_DIR) || entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

/** `t(` preceded by a word boundary (so `format(` or `nt(` do not match), then a string literal. */
const LITERAL_CALL = /(?<![\w$.])t\(\s*(['"])([^'"\n]+)\1/g;
const TEMPLATE_CALL = /(?<![\w$.])t\(\s*`([^`$\n]+)\$\{/g;

/** Drop block and line comments so documentation examples (`t('x.plural')`) are not counted as usages. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

export function hasMessageKey(key: string): boolean {
  return key in nb || (`${key}.one` in nb && `${key}.other` in nb);
}

describe('i18n keys', () => {
  const files = [...walk(SRC)];
  const literal = new Map<string, string[]>();
  const prefixes = new Map<string, string[]>();
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const rel = relative(SRC, file);
    for (const m of source.matchAll(LITERAL_CALL)) {
      const key = m[2]!;
      literal.set(key, [...(literal.get(key) ?? []), rel]);
    }
    for (const m of source.matchAll(TEMPLATE_CALL)) {
      const prefix = m[1]!;
      prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), rel]);
    }
  }

  it('finds a meaningful number of calls', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(literal.size).toBeGreaterThan(500);
  });

  it('every literal key exists in the nb dictionary', () => {
    const missing = [...literal.entries()]
      .filter(([key]) => !hasMessageKey(key))
      .map(([key, where]) => `${key}  (${[...new Set(where)].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('every template-literal prefix matches at least one nb key', () => {
    const nbKeys = Object.keys(nb);
    const missing = [...prefixes.entries()]
      .filter(([prefix]) => !nbKeys.some((k) => k.startsWith(prefix)))
      .map(([prefix, where]) => `${prefix}*  (${[...new Set(where)].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('nn and en only override keys that exist in nb', () => {
    const stray = [...Object.keys(nn), ...Object.keys(en)].filter((k) => !(k in nb));
    expect(stray).toEqual([]);
  });

  it('every plural ".one" key has its ".other" counterpart', () => {
    const halves = Object.keys(nb)
      .filter((k) => k.endsWith('.one'))
      .map((k) => k.slice(0, -'.one'.length))
      .filter((base) => !(`${base}.other` in nb));
    expect(halves).toEqual([]);
  });
});
