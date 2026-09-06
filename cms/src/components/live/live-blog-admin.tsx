'use client';
/**
 * LiveBlogAdmin — the direktestudio for one live blog (/admin/direkte/[id]):
 * status controls (start / end / reopen), settings (title, slug,
 * description, linked article), a composer using the article editor in
 * compact mode, and the post timeline with inline edit, delete, pin and
 * key-event toggles. The timeline refreshes every 15 s so several desk
 * members can post at once.
 */
import { ExternalLink, Pencil, Pin, Play, Radio, RotateCcw, Send, Square, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ArticlePickerDialog } from '@/components/article-editor/article-picker-dialog';
import { ArticleEditor, EDITOR_CHANGE_DEBOUNCE_MS } from '@/components/editor/article-editor';
import { MediaPicker } from '@/components/media/media-picker';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { adminPaths, publicPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { isEmptyDoc } from '@/lib/content/schema';
import { renderDoc } from '@/lib/content/render';
import { EMPTY_DOC, type ContentDoc } from '@/lib/content/types';
import { formatRelative, formatTime } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { LivePostDto } from '@/server/live';
import {
  addLivePostAction,
  deleteLiveBlogAction,
  deleteLivePostAction,
  listLivePostsAction,
  setLiveBlogStatusAction,
  updateLiveBlogAction,
  updateLivePostAction,
} from '@/server/live/actions';
import type { LiveBlogDto } from '@/server/live/dto';

import { LiveStatusBadge } from './live-status-badge';

export type AuthorOption = { id: string; name: string; userId: string | null };

export type LiveBlogAdminProps = {
  blog: LiveBlogDto;
  posts: LivePostDto[];
  authors: AuthorOption[];
  currentUserId: string;
  articleTitle: string | null;
  media: Record<string, Media>;
  canManage: boolean;
};

const REFRESH_MS = 15_000;

/** The editor reports changes debounced; wait them out before reading the body state. */
function settleEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, EDITOR_CHANGE_DEBOUNCE_MS + 50));
}

function sortPosts(posts: LivePostDto[]): LivePostDto[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const diff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    return diff !== 0 ? diff : a.id < b.id ? 1 : -1;
  });
}

export function LiveBlogAdmin({
  blog: initialBlog,
  posts: initialPosts,
  authors,
  currentUserId,
  articleTitle: initialArticleTitle,
  media,
  canManage,
}: LiveBlogAdminProps) {
  const t = useT();
  const router = useRouter();
  const [blog, setBlog] = useState(initialBlog);
  const [posts, setPosts] = useState(() => sortPosts(initialPosts));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBlogOpen, setDeleteBlogOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const mediaMap = useMemo(() => new Map(Object.entries(media)), [media]);
  const editingRef = useRef(editingId);
  useEffect(() => {
    editingRef.current = editingId;
  }, [editingId]);

  const refresh = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const res = await listLivePostsAction({ liveBlogId: blog.id });
    if (!res.ok) return;
    setPosts((prev) => {
      const editing = editingRef.current;
      const kept = editing ? prev.find((p) => p.id === editing) : undefined;
      const next = res.data.map((p) => (kept && p.id === kept.id ? kept : p));
      return sortPosts(next);
    });
    setNow(new Date());
  }, [blog.id]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function setStatus(status: LiveBlogDto['status']) {
    setStatusPending(true);
    try {
      const res = await setLiveBlogStatusAction({ id: blog.id, status });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBlog(res.data);
      toast.success(status === 'live' ? t('live.admin.startedToast') : t('live.admin.endedToast'));
      router.refresh();
    } finally {
      setStatusPending(false);
    }
  }

  async function deleteBlog() {
    const res = await deleteLiveBlogAction({ id: blog.id });
    if (!res.ok) throw new Error(res.error);
    toast.success(t('live.admin.deletedToast'));
    router.push(adminPaths.live());
  }

  function upsertPost(post: LivePostDto) {
    setPosts((prev) => sortPosts([post, ...prev.filter((p) => p.id !== post.id)]));
  }

  async function togglePost(post: LivePostDto, patch: { isPinned?: boolean; isKeyEvent?: boolean }) {
    const res = await updateLivePostAction({ id: post.id, ...patch });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    upsertPost(res.data);
  }

  async function deletePost() {
    if (!deleteId) return;
    const res = await deleteLivePostAction({ id: deleteId });
    if (!res.ok) throw new Error(res.error);
    setPosts((prev) => prev.filter((p) => p.id !== deleteId));
    toast.success(t('live.admin.postDeletedToast'));
  }

  const publicPath = publicPaths.live(blog.slug);

  return (
    <>
      <PageHeader
        title={blog.title}
        eyebrow={<LiveStatusBadge status={blog.status} />}
        breadcrumbs={[{ label: t('nav.live'), href: adminPaths.live() }, { label: blog.title }]}
        description={
          blog.status === 'live' && blog.startedAt
            ? t('live.admin.startedAt', { when: formatRelative(blog.startedAt, now) })
            : blog.status === 'ended' && blog.endedAt
              ? t('live.admin.endedAt', { when: formatRelative(blog.endedAt, now) })
              : t('live.admin.draftHint')
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {blog.status !== 'draft' ? (
              <Button variant="outline" size="sm" leftIcon={<ExternalLink />} asChild>
                <Link href={publicPath} target="_blank" rel="noreferrer">
                  {t('live.admin.openPublic')}
                </Link>
              </Button>
            ) : null}
            {blog.status === 'draft' ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Play />}
                loading={statusPending}
                disabled={!canManage}
                onClick={() => void setStatus('live')}
              >
                {t('live.admin.start')}
              </Button>
            ) : null}
            {blog.status === 'live' ? (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Square />}
                loading={statusPending}
                disabled={!canManage}
                onClick={() => void setStatus('ended')}
              >
                {t('live.admin.end')}
              </Button>
            ) : null}
            {blog.status === 'ended' ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RotateCcw />}
                loading={statusPending}
                disabled={!canManage}
                onClick={() => void setStatus('live')}
              >
                {t('live.admin.reopen')}
              </Button>
            ) : null}
            <IconButton
              label={t('live.admin.delete')}
              variant="ghost"
              size="sm"
              disabled={!canManage}
              onClick={() => setDeleteBlogOpen(true)}
            >
              <Trash2 />
            </IconButton>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {canManage ? (
            <Composer
              blogId={blog.id}
              status={blog.status}
              authors={authors}
              currentUserId={currentUserId}
              onPosted={(post) => {
                upsertPost(post);
                setNow(new Date());
              }}
            />
          ) : null}

          <section aria-labelledby="live-timeline">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="live-timeline" className="text-base font-semibold">
                {t('live.admin.timeline')} <span className="text-muted font-normal">({posts.length})</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                {t('live.admin.refresh')}
              </Button>
            </div>
            {posts.length === 0 ? (
              <EmptyState
                compact
                icon={<Radio className="size-5" />}
                title={t('live.admin.noPostsTitle')}
                description={t('live.admin.noPostsDescription')}
              />
            ) : (
              <ol className="flex flex-col gap-3">
                {posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    media={mediaMap}
                    now={now}
                    authors={authors}
                    editing={editingId === post.id}
                    canManage={canManage}
                    onEdit={() => setEditingId(post.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaved={(p) => {
                      upsertPost(p);
                      setEditingId(null);
                    }}
                    onDelete={() => setDeleteId(post.id)}
                    onTogglePin={() => void togglePost(post, { isPinned: !post.isPinned })}
                    onToggleKey={() => void togglePost(post, { isKeyEvent: !post.isKeyEvent })}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <SettingsCard
            blog={blog}
            articleTitle={initialArticleTitle}
            canManage={canManage}
            onSaved={setBlog}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('live.admin.deletePostTitle')}
        description={t('live.admin.deletePostDescription')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={deletePost}
      />
      <ConfirmDialog
        open={deleteBlogOpen}
        onOpenChange={setDeleteBlogOpen}
        title={t('live.admin.deleteTitle')}
        description={t('live.admin.deleteDescription', { count: posts.length })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={deleteBlog}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Composer                                                                   */
/* -------------------------------------------------------------------------- */

function useMediaPicker() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((m: Media | null) => void) | null>(null);
  const pick = useCallback(
    () =>
      new Promise<Media | null>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );
  const element = (
    <MediaPicker
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          resolver.current?.(null);
          resolver.current = null;
        }
      }}
      kind="image"
      onSelect={(m) => {
        resolver.current?.(m);
        resolver.current = null;
        setOpen(false);
      }}
    />
  );
  return { pick, element };
}

function Composer({
  blogId,
  status,
  authors,
  currentUserId,
  onPosted,
}: {
  blogId: string;
  status: LiveBlogDto['status'];
  authors: AuthorOption[];
  currentUserId: string;
  onPosted: (post: LivePostDto) => void;
}) {
  const t = useT();
  const defaultAuthor = authors.find((a) => a.userId === currentUserId)?.id ?? '';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState<ContentDoc>(EMPTY_DOC);
  const [authorId, setAuthorId] = useState(defaultAuthor);
  const [isKeyEvent, setIsKeyEvent] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useMediaPicker();
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const submit = useCallback(async () => {
    await settleEditor();
    const doc = bodyRef.current;
    if (isEmptyDoc(doc) && !title.trim()) {
      setError(t('live.admin.emptyPost'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await addLivePostAction({
        liveBlogId: blogId,
        title,
        body: doc,
        authorId: authorId || null,
        isKeyEvent,
        isPinned,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      onPosted(res.data);
      setTitle('');
      setBody(EMPTY_DOC);
      setIsKeyEvent(false);
      setIsPinned(false);
      toast.success(t('live.admin.postedToast'));
    } finally {
      setPending(false);
    }
  }, [authorId, blogId, isKeyEvent, isPinned, onPosted, t, title]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('live.admin.composer')}</CardTitle>
        {status !== 'live' ? (
          <Badge variant="warning">
            {status === 'draft' ? t('live.admin.composerDraftHint') : t('live.admin.composerEndedHint')}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FormField label={t('live.admin.postTitle')} htmlFor="live-post-title">
          <Input
            id="live-post-title"
            value={title}
            maxLength={200}
            placeholder={t('live.admin.postTitlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <div className="bg-surface border-border rounded-md border">
          <ArticleEditor
            value={body}
            onChange={setBody}
            compact
            onMediaPick={picker.pick}
            onSave={() => void submit()}
            placeholder={t('live.admin.postPlaceholder')}
            label={t('live.admin.postBody')}
          />
        </div>
        {error ? <p className="text-danger text-sm">{error}</p> : null}
        <div className="flex flex-wrap items-end gap-4">
          <FormField label={t('common.author')} htmlFor="live-post-author" className="min-w-48">
            <NativeSelect
              id="live-post-author"
              value={authorId}
              placeholder={t('live.admin.noAuthor')}
              options={authors.map((a) => ({ value: a.id, label: a.name }))}
              onChange={(e) => setAuthorId(e.target.value)}
            />
          </FormField>
          <Switch label={t('live.admin.keyEvent')} checked={isKeyEvent} onCheckedChange={setIsKeyEvent} />
          <Switch label={t('live.admin.pinned')} checked={isPinned} onCheckedChange={setIsPinned} />
          <span className="flex-1" />
          <Button variant="primary" leftIcon={<Send />} loading={pending} onClick={() => void submit()}>
            {t('live.admin.publishPost')}
          </Button>
        </div>
      </CardContent>
      {picker.element}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Timeline row                                                               */
/* -------------------------------------------------------------------------- */

function PostRow({
  post,
  media,
  now,
  authors,
  editing,
  canManage,
  onEdit,
  onCancelEdit,
  onSaved,
  onDelete,
  onTogglePin,
  onToggleKey,
}: {
  post: LivePostDto;
  media: Map<string, Media>;
  now: Date;
  authors: AuthorOption[];
  editing: boolean;
  canManage: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (post: LivePostDto) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleKey: () => void;
}) {
  const t = useT();
  const published = new Date(post.publishedAt);
  return (
    <li className={cn('bg-surface border-border rounded-md border', post.isPinned && 'border-primary/50')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs">
        <time dateTime={post.publishedAt} className="font-semibold tabular-nums">
          {formatTime(published)}
        </time>
        <span className="text-muted">{formatRelative(published, now)}</span>
        {post.authorName ? <span className="text-muted">{post.authorName}</span> : null}
        {post.isPinned ? (
          <Badge variant="info">
            <Pin /> {t('live.admin.pinned')}
          </Badge>
        ) : null}
        {post.isKeyEvent ? (
          <Badge variant="default">
            <Star /> {t('live.admin.keyEvent')}
          </Badge>
        ) : null}
        <span className="flex-1" />
        {canManage && !editing ? (
          <div className="flex items-center gap-0.5">
            <IconButton
              label={post.isPinned ? t('live.admin.unpin') : t('live.admin.pin')}
              size="sm"
              onClick={onTogglePin}
            >
              <Pin className={cn(post.isPinned && 'fill-current')} />
            </IconButton>
            <IconButton
              label={post.isKeyEvent ? t('live.admin.unmarkKey') : t('live.admin.markKey')}
              size="sm"
              onClick={onToggleKey}
            >
              <Star className={cn(post.isKeyEvent && 'fill-current')} />
            </IconButton>
            <IconButton label={t('common.edit')} size="sm" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton label={t('common.delete')} size="sm" onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </div>
        ) : null}
      </div>
      {editing ? (
        <PostEditor post={post} authors={authors} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : (
        <div className="px-4 pt-2 pb-4">
          {post.title ? <h3 className="mb-1 text-base font-semibold">{post.title}</h3> : null}
          <div className="prose-article" style={{ '--prose-size': '15px' } as CSSProperties}>
            {renderDoc(post.body, { media, articles: new Map(), embeds: 'placeholder' })}
          </div>
        </div>
      )}
    </li>
  );
}

function PostEditor({
  post,
  authors,
  onCancel,
  onSaved,
}: {
  post: LivePostDto;
  authors: AuthorOption[];
  onCancel: () => void;
  onSaved: (post: LivePostDto) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(post.title ?? '');
  const [body, setBody] = useState<ContentDoc>(post.body);
  const [authorId, setAuthorId] = useState(post.authorId ?? '');
  const [pending, setPending] = useState(false);
  const picker = useMediaPicker();

  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  async function save() {
    setPending(true);
    try {
      await settleEditor();
      const res = await updateLivePostAction({
        id: post.id,
        title,
        body: bodyRef.current,
        authorId: authorId || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onSaved(res.data);
      toast.success(t('common.saved'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
      <FormField label={t('live.admin.postTitle')}>
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <div className="bg-surface border-border rounded-md border">
        <ArticleEditor
          value={body}
          onChange={setBody}
          compact
          onMediaPick={picker.pick}
          onSave={() => void save()}
          label={t('live.admin.postBody')}
          autoFocus
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('common.author')} className="min-w-48">
          <NativeSelect
            value={authorId}
            placeholder={t('live.admin.noAuthor')}
            options={authors.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(e) => setAuthorId(e.target.value)}
          />
        </FormField>
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={pending}>
          {t('common.save')}
        </Button>
      </div>
      {picker.element}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

function SettingsCard({
  blog,
  articleTitle: initialArticleTitle,
  canManage,
  onSaved,
}: {
  blog: LiveBlogDto;
  articleTitle: string | null;
  canManage: boolean;
  onSaved: (blog: LiveBlogDto) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState(blog.title);
  const [slug, setSlug] = useState(blog.slug);
  const [description, setDescription] = useState(blog.description ?? '');
  const [articleId, setArticleId] = useState<string | null>(blog.articleId);
  const [articleTitle, setArticleTitle] = useState<string | null>(initialArticleTitle);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const dirty =
    title !== blog.title ||
    slug !== blog.slug ||
    description !== (blog.description ?? '') ||
    articleId !== blog.articleId;

  async function save() {
    setPending(true);
    setErrors({});
    try {
      const res = await updateLiveBlogAction({ id: blog.id, input: { title, slug, description, articleId } });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      onSaved(res.data);
      setSlug(res.data.slug);
      toast.success(t('common.saved'));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('live.admin.settings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormField label={t('common.title')} required error={errors.title?.[0]} htmlFor="live-title">
            <Input
              id="live-title"
              value={title}
              maxLength={200}
              disabled={!canManage}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('live.admin.slug')}
            help={t('live.admin.slugHelp')}
            error={errors.slug?.[0]}
            htmlFor="live-slug"
          >
            <Input
              id="live-slug"
              value={slug}
              maxLength={80}
              disabled={!canManage}
              onChange={(e) => setSlug(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('common.description')}
            error={errors.description?.[0]}
            htmlFor="live-description"
          >
            <Textarea
              id="live-description"
              value={description}
              maxLength={1000}
              rows={3}
              disabled={!canManage}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('live.admin.linkedArticle')}
            help={t('live.admin.linkedArticleHelp')}
            error={errors.articleId?.[0]}
          >
            <div className="flex flex-col gap-2">
              {articleId ? (
                <p className="bg-surface-2 rounded-md px-3 py-2 text-sm">{articleTitle ?? articleId}</p>
              ) : (
                <p className="text-muted text-sm">{t('live.admin.noLinkedArticle')}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canManage}
                  onClick={() => setPickerOpen(true)}
                >
                  {articleId ? t('live.admin.changeArticle') : t('live.admin.pickArticle')}
                </Button>
                {articleId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canManage}
                    onClick={() => {
                      setArticleId(null);
                      setArticleTitle(null);
                    }}
                  >
                    {t('live.admin.removeArticle')}
                  </Button>
                ) : null}
              </div>
            </div>
          </FormField>
          <Button type="submit" variant="primary" disabled={!canManage || !dirty} loading={pending}>
            {t('common.save')}
          </Button>
        </form>
      </CardContent>
      <ArticlePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('live.admin.pickArticle')}
        onSelect={(a) => {
          setArticleId(a.id);
          setArticleTitle(a.title);
          setPickerOpen(false);
        }}
      />
    </Card>
  );
}
