/**
 * Public 404 in Norwegian, inside the site frame (the (public) layout
 * still renders around it).
 */
import { Search } from 'lucide-react';

import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';

export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-xs font-bold tracking-wide text-[var(--site-accent)] uppercase">404</p>
      <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight md:text-4xl">
        {t('public.notFound.title')}
      </h1>
      <p className="text-muted mt-3">{t('public.notFound.text')}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={publicPaths.front()}
          className="inline-flex h-11 items-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 font-semibold text-white hover:opacity-90"
        >
          {t('public.notFound.front')}
        </a>
        <a
          href={publicPaths.search()}
          className="border-border hover:bg-surface-2 inline-flex h-11 items-center gap-2 rounded-[var(--site-radius)] border px-5 font-semibold"
        >
          <Search aria-hidden className="size-4" />
          {t('public.notFound.search')}
        </a>
      </div>
    </div>
  );
}
