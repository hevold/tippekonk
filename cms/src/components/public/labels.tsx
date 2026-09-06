/**
 * Small editorial labels used on teasers and article pages: "Pluss",
 * "Siste nytt", "Annonsørinnhold", "Direkte". Server-safe.
 */
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type LabelProps = { className?: string; label?: string };

export function PlusLabel({ className, label }: LabelProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase',
        className,
      )}
    >
      {label || t('public.plus')}
    </span>
  );
}

export function BreakingLabel({ className }: LabelProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--site-radius)] bg-[var(--site-accent)] px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-white" />
      {t('public.breaking')}
    </span>
  );
}

export function SponsoredLabel({ className }: LabelProps) {
  return (
    <span
      className={cn(
        'border-border-strong bg-surface-2 text-muted inline-flex items-center rounded-[var(--site-radius)] border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {t('public.sponsored')}
    </span>
  );
}

export function LiveLabel({ className, ended }: LabelProps & { ended?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--site-radius)] px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase',
        ended ? 'bg-text-subtle' : 'bg-[var(--site-accent)]',
        className,
      )}
    >
      {!ended ? <span aria-hidden className="live-dot size-1.5 rounded-full bg-white" /> : null}
      {ended ? t('public.liveEnded') : t('public.live')}
    </span>
  );
}
