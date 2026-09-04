'use client';
/**
 * Error boundary for admin pages: explains what happened, offers "Prøv igjen"
 * (re-renders the segment) and a way back to the dashboard. The digest lets
 * support match the entry in the server log.
 */
import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';

export default function AdminError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  /** Older Next.js name for `retry`; kept so both signatures work. */
  reset?: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error('[admin]', error);
  }, [error]);

  const tryAgain = retry ?? reset;

  return (
    <div className="mx-auto max-w-xl py-12">
      <Alert
        variant="danger"
        live
        title={t('shell.error.title')}
        actions={
          <>
            {tryAgain ? (
              <Button variant="outline" size="sm" leftIcon={<RotateCcw />} onClick={() => tryAgain()}>
                {t('common.retry')}
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link href={adminPaths.dashboard()}>{t('shell.error.dashboard')}</Link>
            </Button>
          </>
        }
      >
        <p>{t('shell.error.description')}</p>
        {error.digest ? (
          <p className="text-subtle mt-1 font-mono text-xs">
            {t('shell.error.reference')}: {error.digest}
          </p>
        ) : null}
      </Alert>
    </div>
  );
}
