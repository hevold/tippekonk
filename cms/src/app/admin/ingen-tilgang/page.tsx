/**
 * "Ingen tilgang": shown by getAdminContext() when the signed-in user has
 * no membership in any site. Rendered outside the shell (no sidebar), with
 * a way to log out and try another account.
 */
import { ShieldOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { adminPaths, publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Ingen tilgang', robots: { index: false, follow: false } };

export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-8 text-center shadow-xs">
        <div
          className="bg-danger-soft text-danger mx-auto mb-4 flex size-12 items-center justify-center rounded-full"
          aria-hidden
        >
          <ShieldOff className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t('shell.noAccess.title')}</h1>
        <p className="text-muted mt-2 text-sm leading-6">{t('shell.noAccess.description')}</p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={publicPaths.front()}>{t('shell.noAccess.toSite')}</Link>
          </Button>
          <Button asChild>
            <a href={adminPaths.logout()}>{t('shell.logout')}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
