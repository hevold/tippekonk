/**
 * Layout for the sign-in and recovery screens (login, 2FA, glemt passord,
 * tilbakestill, invitasjon): a calm, centred frame with the Desken wordmark
 * and the newsroom's name, no sidebar. Pages render their own card.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { publicPaths } from '@/config/routes';
import { setRequestLocale, t } from '@/lib/i18n';
import { I18nProvider } from '@/lib/i18n/client';
import { getDefaultSite } from '@/server/sites';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Logg inn', template: '%s – Desken' },
  robots: { index: false, follow: false },
};

async function siteName(): Promise<string | null> {
  try {
    return (await getDefaultSite()).name;
  } catch {
    return null;
  }
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  setRequestLocale('nb');
  const name = await siteName();
  return (
    <I18nProvider locale="nb">
      <main className="bg-bg flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[26rem]">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Link
              href={publicPaths.front()}
              className="focus-visible:outline-ring inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
              aria-label={t('auth.brand')}
            >
              <span
                className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg font-serif text-xl leading-none font-bold shadow-xs"
                aria-hidden
              >
                D
              </span>
              <span className="text-text text-2xl font-semibold tracking-tight">{t('auth.brand')}</span>
            </Link>
            {name ? <p className="text-muted text-sm">{name}</p> : null}
          </div>
          <div className="bg-surface border-border rounded-xl border p-6 shadow-md sm:p-8">{children}</div>
          <p className="text-subtle mt-6 text-center text-xs">{t('auth.tagline')}</p>
        </div>
      </main>
    </I18nProvider>
  );
}
