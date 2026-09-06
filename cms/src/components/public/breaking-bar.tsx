/**
 * "Siste nytt" bar under the masthead: breaking stories published in the
 * last 24 hours. Renders nothing when there are none or the site has
 * turned the bar off.
 */
import { publicPaths } from '@/config/routes';
import { formatTime, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type { ArticleTeaser } from '@/lib/layout/engine';

export function BreakingBar({ articles }: { articles: ArticleTeaser[] }) {
  if (!articles.length) return null;
  return (
    <aside
      aria-label={t('public.breaking')}
      className="site-breaking bg-[var(--site-accent)] text-white print:hidden"
    >
      <div className="site-container flex items-center gap-3 py-2 text-sm">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-bold tracking-wide uppercase">
          <span aria-hidden className="live-dot size-2 rounded-full bg-white" />
          {t('public.breaking.label')}
        </span>
        <ul className="m-0 flex min-w-0 scrollbar-none list-none gap-6 overflow-x-auto p-0">
          {articles.map((a) => {
            const when = a.publishedAt ?? a.updatedAt;
            return (
              <li key={a.id} className="shrink-0">
                <a
                  href={publicPaths.article(a.sectionSlug, a.sectionSlug ? a.slug : a.id)}
                  className="font-medium hover:underline"
                >
                  <time dateTime={toIso(when)} className="mr-2 text-white/80 tabular-nums">
                    {formatTime(when)}
                  </time>
                  {a.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
