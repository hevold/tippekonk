'use client';
/**
 * SessionsCard — the user's active sessions with per-session logout and
 * "Logg ut overalt" (keeps the current session).
 */
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatRelative } from '@/components/ui/format';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { logoutEverywhereAction, revokeSessionAction } from '@/server/auth/actions';

export type SessionRow = {
  id: string;
  current: boolean;
  ip: string | null;
  device: string;
  createdAt: string;
  lastSeenAt: string;
};

export function SessionsCard({ rows }: { rows: SessionRow[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const others = rows.filter((s) => !s.current);

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeSessionAction(id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t('users.profile.sessions.revoked'));
        router.refresh();
      }
    });
  }

  async function logoutEverywhere() {
    const result = await logoutEverywhereAction();
    if (!result.ok) throw new Error(result.error);
    toast.success(t('users.profile.sessions.loggedOutEverywhere', { count: result.data.removed }));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('users.profile.section.sessions')}</CardTitle>
        <CardDescription>{t('users.profile.section.sessionsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-border divide-y" aria-label={t('users.profile.section.sessions')}>
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div
                className="bg-surface-2 text-muted flex size-8 shrink-0 items-center justify-center rounded-md"
                aria-hidden
              >
                <MonitorSmartphone className="size-4" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {s.device}
                  {s.current ? <Badge variant="success">{t('users.profile.sessions.current')}</Badge> : null}
                </p>
                <p className="text-muted mt-0.5 text-[13px]">
                  {t('users.profile.sessions.lastSeen', { when: formatRelative(s.lastSeenAt) })}
                  {' · '}
                  {t('users.profile.sessions.signedIn', { when: formatRelative(s.createdAt) })}
                  {s.ip ? ` · ${s.ip}` : ''}
                </p>
              </div>
              {!s.current ? (
                <Button variant="ghost" size="sm" onClick={() => revoke(s.id)} disabled={pending}>
                  {t('users.profile.sessions.revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-muted text-[13px]">
          {others.length === 0
            ? t('users.profile.sessions.none')
            : t('users.profile.sessions.logoutEverywhereDescription')}
        </p>
        <Button
          variant="outline"
          leftIcon={<LogOut />}
          disabled={others.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          {t('users.profile.sessions.logoutEverywhere')}
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('users.profile.sessions.logoutEverywhere')}
        description={t('users.profile.sessions.logoutEverywhereDescription')}
        confirmLabel={t('users.profile.sessions.logoutEverywhere')}
        onConfirm={logoutEverywhere}
      />
    </Card>
  );
}
