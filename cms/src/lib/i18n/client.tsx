'use client';
/**
 * Client-side i18n: wrap client trees in <I18nProvider locale="nb"> (the admin
 * and public layouts do this) and call `const t = useT()` in components.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createT, DEFAULT_LOCALE, type Locale, type T } from './index';

const I18nContext = createContext<{ locale: Locale; t: T }>({
  locale: DEFAULT_LOCALE,
  t: createT(DEFAULT_LOCALE),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
