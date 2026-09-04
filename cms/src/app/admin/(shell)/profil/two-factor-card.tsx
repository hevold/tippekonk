'use client';
/**
 * TwoFactorCard — status of TOTP for the account, with the enable flow
 * (QR code → recovery codes → confirm with a code) and the disable flow
 * (confirm with password).
 */
import { Copy, ShieldCheck, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { beginTotpSetupAction, confirmTotpAction, disableTotpAction } from '@/server/auth/actions';
import type { TotpSetupView } from '@/server/auth/profile';

import { PasswordField } from '../../(auth)/_components/password-field';

export function TwoFactorCard({
  enabled,
  recoveryCodesLeft,
}: {
  enabled: boolean;
  recoveryCodesLeft: number | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<TotpSetupView | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function begin() {
    startTransition(async () => {
      const result = await beginTotpSetupAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCode('');
      setCodeError(null);
      setSetup(result.data);
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmTotpAction(code);
      if (!result.ok) {
        setCodeError(result.fieldErrors?.code?.[0] ?? result.error);
        return;
      }
      toast.success(t('users.profile.twoFactor.enabledToast'));
      setSetup(null);
      router.refresh();
    });
  }

  function disable() {
    startTransition(async () => {
      const result = await disableTotpAction(password);
      if (!result.ok) {
        setPasswordError(result.fieldErrors?.currentPassword?.[0] ?? result.error);
        return;
      }
      toast.success(t('users.profile.twoFactor.disabledToast'));
      setDisableOpen(false);
      setPassword('');
      router.refresh();
    });
  }

  async function copyCodes() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.recoveryCodes.join('\n'));
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.error.generic'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('users.profile.section.twoFactor')}</CardTitle>
          <Badge variant={enabled ? 'success' : 'muted'}>
            {enabled ? <ShieldCheck aria-hidden /> : <ShieldOff aria-hidden />}
            {enabled ? t('users.profile.twoFactor.enabled') : t('users.profile.twoFactor.disabled')}
          </Badge>
        </div>
        <CardDescription>{t('users.profile.section.twoFactorDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {enabled && recoveryCodesLeft !== null ? (
          <p className="text-muted text-sm">
            {t('users.profile.twoFactor.recoveryLeft', { count: recoveryCodesLeft })}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        {enabled ? (
          <Button variant="outline" leftIcon={<ShieldOff />} onClick={() => setDisableOpen(true)}>
            {t('users.profile.twoFactor.disable')}
          </Button>
        ) : (
          <Button leftIcon={<ShieldCheck />} onClick={begin} loading={pending && !setup}>
            {t('users.profile.twoFactor.enable')}
          </Button>
        )}
      </CardFooter>

      <Dialog
        open={setup !== null}
        onOpenChange={(open) => !open && setSetup(null)}
        title={t('users.profile.twoFactor.setupTitle')}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setSetup(null)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirm} loading={pending} disabled={code.trim().length !== 6}>
              {t('users.profile.twoFactor.confirm')}
            </Button>
          </>
        }
      >
        {setup ? (
          <div className="flex flex-col gap-5 py-1">
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-5">{t('users.profile.twoFactor.step1')}</p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the server, not a media file */}
                <img
                  src={setup.qrDataUrl}
                  alt={t('users.profile.twoFactor.qrAlt')}
                  width={180}
                  height={180}
                  className="border-border rounded-md border bg-white p-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-muted text-[13px]">{t('users.profile.twoFactor.manualKey')}</p>
                  <code className="bg-surface-2 mt-1 block rounded-md px-2 py-1.5 font-mono text-[13px] break-all select-all">
                    {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                  </code>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-5">{t('users.profile.twoFactor.step2')}</p>
              <ul className="bg-surface-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md px-3 py-2 font-mono text-sm sm:grid-cols-4">
                {setup.recoveryCodes.map((c) => (
                  <li key={c} className="select-all">
                    {c}
                  </li>
                ))}
              </ul>
              <div>
                <Button variant="ghost" size="sm" leftIcon={<Copy />} onClick={copyCodes}>
                  {t('users.profile.twoFactor.copyCodes')}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-5">{t('users.profile.twoFactor.step3')}</p>
              <FormField label={t('users.profile.twoFactor.code')} htmlFor="totp-code" error={codeError}>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ''));
                    setCodeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6) confirm();
                  }}
                  className="max-w-[12rem] text-center font-mono text-lg tracking-[0.3em]"
                />
              </FormField>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={disableOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDisableOpen(false);
            setPassword('');
            setPasswordError(null);
          }
        }}
        title={t('users.profile.twoFactor.disableTitle')}
        description={t('users.profile.twoFactor.disableDescription')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDisableOpen(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={disable} loading={pending} disabled={!password}>
              {t('users.profile.twoFactor.disable')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 py-1">
          {passwordError ? (
            <Alert variant="danger" live>
              {passwordError}
            </Alert>
          ) : null}
          <FormField label={t('users.profile.currentPassword')} htmlFor="disable-totp-password" required>
            <PasswordField
              id="disable-totp-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) disable();
              }}
            />
          </FormField>
        </div>
      </Dialog>
    </Card>
  );
}
