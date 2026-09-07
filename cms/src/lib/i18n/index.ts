/**
 * Minimal, dependency-free i18n. Bokmål (nb) is the source of truth; nynorsk
 * (nn) and English (en) override keys and fall back to nb.
 *
 *   import { t } from '@/lib/i18n';
 *   t('articles.title')                       → 'Saker'
 *   t('articles.count', { count: 3 })         → '3 saker'   (uses {count} placeholders)
 *   t('x.plural', { count: n })               → picks 'x.plural.one' / 'x.plural.other' if present
 *
 * Server components: `t()` uses the request locale set by `setRequestLocale()`
 * (done in the admin layout from the user's preference, and in the public
 * layout from the site's locale). Client components receive `locale` via the
 * `<I18nProvider>` and use `useT()` from '@/lib/i18n/client'.
 */
import { cache } from 'react';

import en from './messages/en';
import nb from './messages/nb';
import nn from './messages/nn';

export type Locale = 'nb' | 'nn' | 'en';
export const LOCALES: Locale[] = ['nb', 'nn', 'en'];
export const DEFAULT_LOCALE: Locale = 'nb';

const dictionaries: Record<Locale, Record<string, string>> = { nb, nn, en };

export type TranslateVars = Record<string, string | number | null | undefined>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function translate(locale: Locale, key: string, vars?: TranslateVars): string {
  const dict = dictionaries[locale] ?? nb;
  let template: string | undefined;
  if (vars && typeof vars.count === 'number') {
    const suffix = vars.count === 1 ? '.one' : '.other';
    template = dict[key + suffix] ?? nb[key + suffix];
  }
  template ??= dict[key] ?? nb[key];
  if (template === undefined) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.warn(`[i18n] Mangler tekst for nøkkel "${key}"`);
    }
    return key;
  }
  return interpolate(template, vars);
}

/** Create a bound translator for a locale. */
export function createT(locale: Locale) {
  return (key: string, vars?: TranslateVars) => translate(locale, key, vars);
}
export type T = ReturnType<typeof createT>;

/*
 * Request-scoped locale for server components. React's `cache()` memoises
 * per server request while rendering (layouts, pages, generateMetadata), so
 * concurrent requests with different user locales never see each other's
 * value. Outside a render — route handlers, scripts, tests, and the client
 * bundle, where `cache()` degrades to a plain call — the store is a fresh
 * object every time, so we fall back to a module-level value there.
 */
type LocaleStore = { locale: Locale | null };
const requestStore = cache((): LocaleStore => ({ locale: null }));
let fallbackLocale: Locale = DEFAULT_LOCALE;

export function setRequestLocale(locale: Locale): void {
  requestStore().locale = locale;
  fallbackLocale = locale;
}
export function getRequestLocale(): Locale {
  return requestStore().locale ?? fallbackLocale;
}

/** Translate using the current request locale (server) — the everyday helper. */
export function t(key: string, vars?: TranslateVars): string {
  return translate(getRequestLocale(), key, vars);
}

export function hasKey(key: string): boolean {
  return key in nb;
}
