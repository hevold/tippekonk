/**
 * Summary box of key events ("nøkkelhendelser"), oldest first, linking to
 * the posts further down. Server-safe.
 */
import { Star } from 'lucide-react';

import { docExcerpt } from '@/lib/content/text';
import { formatTime, toIso } from '@/lib/dates';
import type { LivePostDto } from '@/server/live';

export function KeyEvents({ events, title }: { events: LivePostDto[]; title: string }) {
  if (!events.length) return null;
  return (
    <aside
      aria-labelledby="nokkelhendelser"
      className="border-border bg-surface-2 mb-8 rounded-[var(--site-radius)] border p-4 md:p-5"
    >
      <h2
        id="nokkelhendelser"
        className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase"
      >
        <Star className="size-4 text-[var(--site-primary)]" aria-hidden />
        {title}
      </h2>
      <ol className="flex flex-col gap-2">
        {events.map((e) => {
          const at = new Date(e.publishedAt);
          const text = e.title || docExcerpt(e.body, 140);
          return (
            <li key={e.id} className="flex gap-3 text-sm">
              <time dateTime={toIso(at)} className="text-muted w-12 shrink-0 tabular-nums">
                {formatTime(at)}
              </time>
              <a
                href={`#innlegg-${e.id}`}
                className="font-medium underline-offset-2 hover:text-[var(--site-primary)] hover:underline"
              >
                {text}
              </a>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
