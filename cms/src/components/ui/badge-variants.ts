/**
 * Badge variants and the ArticleStatus → colour/label mapping used by
 * <StatusBadge>. Pure module (no React) so it is unit-testable.
 */
import { cva, type VariantProps } from 'class-variance-authority';

import type { ArticleStatus } from '@/db/schema';

export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary-soft text-primary border-transparent',
        success: 'bg-success-soft text-success border-transparent',
        warning: 'bg-warning-soft text-warning border-transparent',
        danger: 'bg-danger-soft text-danger border-transparent',
        info: 'bg-info-soft text-info border-transparent',
        outline: 'bg-transparent text-text border-border-strong',
        muted: 'bg-surface-2 text-muted border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
export type BadgeVariant = NonNullable<BadgeVariantProps['variant']>;

export const BADGE_VARIANTS: BadgeVariant[] = ['default', 'success', 'warning', 'danger', 'info', 'outline', 'muted'];

export const ARTICLE_STATUSES: ArticleStatus[] = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'unpublished',
  'archived',
];

/** Status colour classes (bg/fg tokens from globals.css). */
export const statusBadgeClass: Record<ArticleStatus, string> = {
  draft: 'bg-status-draft-bg text-status-draft-fg',
  in_review: 'bg-status-in-review-bg text-status-in-review-fg',
  approved: 'bg-status-approved-bg text-status-approved-fg',
  scheduled: 'bg-status-scheduled-bg text-status-scheduled-fg',
  published: 'bg-status-published-bg text-status-published-fg',
  unpublished: 'bg-status-unpublished-bg text-status-unpublished-fg',
  archived: 'bg-status-archived-bg text-status-archived-fg',
};

/** Dot colour classes for compact status indicators. */
export const statusDotClass: Record<ArticleStatus, string> = {
  draft: 'bg-status-draft-fg',
  in_review: 'bg-status-in-review-fg',
  approved: 'bg-status-approved-fg',
  scheduled: 'bg-status-scheduled-fg',
  published: 'bg-status-published-fg',
  unpublished: 'bg-status-unpublished-fg',
  archived: 'bg-status-archived-fg',
};

/** i18n key for each status label ("Utkast", "Til gjennomsyn", …). */
export function statusLabelKey(status: ArticleStatus): string {
  return `ui.status.${status}`;
}

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return typeof value === 'string' && (ARTICLE_STATUSES as string[]).includes(value);
}
