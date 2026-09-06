'use client';
/**
 * LiveFeed — the post list on the public live blog page. Server-rendered on
 * first paint (the initial posts come as props), then polls
 * /api/live/[id]/posts?after=<iso> every `pollIntervalSec` seconds. New
 * posts wait behind a "Nye innlegg" button so the page never jumps under
 * the reader; edits and deletions apply in place. Relative timestamps tick
 * every 30 s. Polling stops once the blog has ended.
 */
import { ArrowUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LiveBlogStatus, Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { LivePostDto, PostsDelta } from '@/server/live';

import { LivePostCard } from './live-post-card';

export type LiveFeedProps = {
  blogId: string;
  status: LiveBlogStatus;
  initialPosts: LivePostDto[];
  initialMedia: Record<string, Media>;
  /** ISO instant the initial posts were loaded at. */
  loadedAt: string;
  pollIntervalSec: number;
};

function sortPosts(posts: LivePostDto[]): LivePostDto[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const diff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    return diff !== 0 ? diff : a.id < b.id ? 1 : -1;
  });
}

export function LiveFeed({
  blogId,
  status: initialStatus,
  initialPosts,
  initialMedia,
  loadedAt,
  pollIntervalSec,
}: LiveFeedProps) {
  const t = useT();
  const [posts, setPosts] = useState<LivePostDto[]>(() => sortPosts(initialPosts));
  const [pending, setPending] = useState<LivePostDto[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, Media>>(initialMedia);
  const [status, setStatus] = useState<LiveBlogStatus>(initialStatus);
  const [now, setNow] = useState(() => new Date());
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const since = useRef(loadedAt);
  const known = useRef(new Set(initialPosts.map((p) => p.id)));
  const media = useMemo(() => new Map(Object.entries(mediaMap)), [mediaMap]);

  // Relative timestamps.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const poll = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const res = await fetch(`/api/live/${blogId}/posts?after=${encodeURIComponent(since.current)}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const delta = (await res.json()) as PostsDelta;
      // Overlap the window by a few seconds so a post saved during the request is not missed.
      since.current = new Date(new Date(delta.serverTime).getTime() - 5_000).toISOString();
      setStatus(delta.status);
      if (Object.keys(delta.media).length) setMediaMap((prev) => ({ ...prev, ...delta.media }));
      const deleted = new Set(delta.deleted);
      const fresh: LivePostDto[] = [];
      const edited: LivePostDto[] = [];
      for (const p of delta.posts) {
        if (known.current.has(p.id)) edited.push(p);
        else fresh.push(p);
      }
      if (deleted.size || edited.length) {
        setPosts((prev) =>
          sortPosts(
            prev
              .filter((p) => !deleted.has(p.id))
              .map((p) => edited.find((e) => e.id === p.id && e.updatedAt !== p.updatedAt) ?? p),
          ),
        );
        setPending((prev) => prev.filter((p) => !deleted.has(p.id)));
      }
      if (fresh.length) {
        for (const p of fresh) known.current.add(p.id);
        setPending((prev) => sortPosts([...prev.filter((p) => !fresh.some((f) => f.id === p.id)), ...fresh]));
      }
    } catch (err) {
      console.error('[live-feed] poll failed', err);
    }
  }, [blogId]);

  useEffect(() => {
    if (status === 'ended') return;
    const interval = Math.max(5, pollIntervalSec) * 1000;
    const timer = setInterval(() => void poll(), interval);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll, pollIntervalSec, status]);

  function showPending() {
    const ids = new Set(pending.map((p) => p.id));
    setHighlightIds(ids);
    setPosts((prev) => sortPosts([...pending, ...prev.filter((p) => !ids.has(p.id))]));
    setPending([]);
    setNow(new Date());
    window.setTimeout(() => setHighlightIds(new Set()), 4000);
  }

  const labels = {
    pinned: t('live.public.pinned'),
    keyEvent: t('live.public.keyEvent'),
    updated: t('live.public.updated'),
  };

  return (
    <div className="live-feed">
      <div aria-live="polite" className="min-h-0">
        {pending.length ? (
          <button
            type="button"
            onClick={showPending}
            className="sticky top-2 z-10 mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--site-primary)] px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.01]"
          >
            <ArrowUp className="size-4" aria-hidden />
            {t('live.public.newPosts', { count: pending.length })}
          </button>
        ) : null}
      </div>
      {posts.length === 0 ? (
        <p className="text-muted py-10 text-center">{t('live.public.noPosts')}</p>
      ) : (
        <div>
          {posts.map((post) => (
            <LivePostCard
              key={post.id}
              post={post}
              media={media}
              now={now}
              labels={labels}
              highlight={highlightIds.has(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
