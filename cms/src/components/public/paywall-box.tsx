/**
 * Paywall CTA (SPEC 5.6) rendered after the teaser paragraphs of a plus
 * article. Text and links come from `settings.paywall`; the subscription
 * and login systems are external.
 */
import { Lock } from 'lucide-react';

import { t } from '@/lib/i18n';
import type { SiteSettings } from '@/lib/validation/site';

export function PaywallBox({ paywall }: { paywall: SiteSettings['paywall'] }) {
  return (
    <aside
      className="paywall-box bg-surface relative mt-2 rounded-[var(--site-radius)] border border-[var(--site-primary)] p-6 md:p-8"
      aria-label={t('public.paywall.locked')}
      data-paywall="true"
    >
      <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[var(--site-primary)] uppercase">
        <Lock aria-hidden className="size-4" />
        {paywall.label || t('public.plus')}
      </div>
      <h2 className="font-heading mt-2 text-2xl font-bold tracking-tight">{paywall.ctaTitle}</h2>
      <p className="text-muted mt-2 max-w-prose text-base">{paywall.ctaText}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={paywall.ctaUrl || '/abonnement'}
          className="inline-flex h-11 items-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 font-semibold text-white hover:opacity-90"
        >
          {paywall.ctaButton}
        </a>
        {paywall.loginUrl ? (
          <span className="text-muted text-sm">
            {t('public.paywall.alreadySubscriber')}{' '}
            <a href={paywall.loginUrl} className="font-semibold text-[var(--site-primary)] underline">
              {t('public.paywall.login')}
            </a>
          </span>
        ) : null}
      </div>
    </aside>
  );
}
