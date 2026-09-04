/**
 * Root 404. Rendered inside the root layout (no site chrome) when a route
 * segment calls notFound() and no closer not-found.tsx exists.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { adminPaths, publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Fant ikke siden' };

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-md text-center">
        <p className="text-subtle font-mono text-sm tracking-widest">404</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">{t('shell.notFound.title')}</h1>
        <p className="text-muted mt-3 text-[15px] leading-6">{t('shell.notFound.description')}</p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={adminPaths.dashboard()}>{t('shell.notFound.toAdmin')}</Link>
          </Button>
          <Button asChild>
            <Link href={publicPaths.front()}>{t('shell.notFound.toFront')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
