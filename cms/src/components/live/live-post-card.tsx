/**
 * One live blog post for the public page: time, author, pinned / key event
 * labels and the body rendered with the shared ContentDoc renderer. No
 * hooks, so both the server page and the client <LiveFeed> can use it.
 */
import { Pin, Star } from 'lucide-react';

import type { Media } from '@/db/schema';
import { renderDoc } from '@/lib/content/render';
import { formatRelative, formatTime, toIso } from '@/lib/dates';
import type { LivePostDto } from '@/server/live';
import { cn } from '@/lib/utils';

export type LivePostCardProps = {
  post: LivePostDto;
  media: Map<string, Media>;
  /** Reference instant for relative times (re-rendered periodically on the client). */
  now: Date;
  labels: { pinned: string; keyEvent: string; updated: string };
  className?: string;
  highlight?: boolean;
};

export function LivePostCard({ post, media, now, labels, className, highlight }: LivePostCardProps) {
  const published = new Date(post.publishedAt);
  const updated = new Date(post.updatedAt);
  const edited = updated.getTime() - published.getTime() > 60_000;
  return (
    <article
      id={`innlegg-${post.id}`}
      className={cn(
        'border-border relative scroll-mt-24 border-b py-5 first:pt-0',
        highlight && 'animate-fade-in',
        className,
      )}
      aria-labelledby={post.title ? `innlegg-${post.id}-tittel` : undefined}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <time
          dateTime={toIso(published)}
          className="text-text font-semibold tabular-nums"
          title={formatRelative(published, now)}
        >
          {formatTime(published)}
        </time>
        <span className="text-muted">{formatRelative(published, now)}</span>
        {post.authorName ? <span className="text-muted">{post.authorName}</span> : null}
        {post.isPinned ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--site-accent)]">
            <Pin className="size-3" aria-hidden />
            {labels.pinned}
          </span>
        ) : null}
        {post.isKeyEvent ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--site-primary)]">
            <Star className="size-3" aria-hidden />
            {labels.keyEvent}
          </span>
        ) : null}
        {edited ? (
          <span className="text-muted">
            {labels.updated} <time dateTime={toIso(updated)}>{formatTime(updated)}</time>
          </span>
        ) : null}
      </header>
      {post.title ? (
        <h3 id={`innlegg-${post.id}-tittel`} className="font-heading mb-2 text-xl font-bold tracking-tight">
          {post.title}
        </h3>
      ) : null}
      <div className="prose-article live-post-body">
        {renderDoc(post.body, {
          media,
          articles: new Map(),
          embeds: 'full',
          imageSizes: '(min-width: 768px) 640px, 100vw',
        })}
      </div>
    </article>
  );
}
