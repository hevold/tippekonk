'use client';
/**
 * ArticleEditorPage — the client composition for /admin/artikler/[id]:
 * form state, dirty tracking, autosave + Mod+S, the edit lock, workflow
 * buttons, publish/schedule dialog, conflict handling and the sidebar.
 *
 * The server page loads an ArticleEditModel and hands it here; after
 * mutations that change server-side data (status, revisions, notes) we
 * call router.refresh() and re-sync from the new model when it arrives.
 */
import { Archive, CalendarClock, Check, CheckCheck, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResolvedArticle } from '@/components/forms/custom-fields';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { Article, ArticleStatus, Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import {
  assignAction,
  changeContentTypeAction,
  destroyAction,
  duplicateAction,
  publishAction,
  restoreAction,
  scheduleAction,
  toggleChecklistItemAction,
  transitionAction,
  trashAction,
} from '@/server/articles/actions';
import type { ArticleEditModel, EditorMediaInfo, EditorNote, EditorRelated } from '@/server/articles/queries';
import { canTransition, validateForPublish, type PublishIssue } from '@/server/articles/validation';

import { BylinesCard } from './bylines-card';
import { ChecklistCard } from './checklist-card';
import { ConflictDialog } from './conflict-dialog';
import { ContentTypeCard } from './content-type-card';
import { FeaturedMediaCard } from './featured-media-card';
import { LockBanner } from './lock-banner';
import { MainColumn } from './main-column';
import { NotesCard } from './notes-card';
import { PlanningCard } from './planning-card';
import { PublishCard } from './publish-card';
import { PublishDialog, type PublishDialogMode } from './publish-dialog';
import { RelatedCard } from './related-card';
import { RevisionsCard } from './revisions-card';
import { SeoCard } from './seo-card';
import { SidebarSection } from './sidebar-section';
import { StatusCard, type TransitionButton } from './status-card';
import { TaxonomyCard } from './taxonomy-card';
import { EditorTopBar } from './top-bar';
import { formValuesFromModel, serializeForm, toArticleInput, type EditorFormValues } from './types';
import { useAutosave } from './use-autosave';
import { useLock } from './use-lock';

export type ArticleEditorPageProps = {
  model: ArticleEditModel;
  settings: SiteSettings;
  currentUser: { id: string; name: string };
  canUploadMedia: boolean;
  canEditMedia: boolean;
};

type Meta = Pick<
  Article,
  'status' | 'version' | 'updatedAt' | 'publishedAt' | 'firstPublishedAt' | 'scheduledAt' | 'wordCount' | 'readingTimeMin' | 'deletedAt' | 'updatedBy'
> & { updatedByName: string | null };

function metaFromModel(model: ArticleEditModel): Meta {
  const a = model.article;
  return {
    status: a.status,
    version: a.version,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
    firstPublishedAt: a.firstPublishedAt,
    scheduledAt: a.scheduledAt,
    wordCount: a.wordCount,
    readingTimeMin: a.readingTimeMin,
    deletedAt: a.deletedAt,
    updatedBy: a.updatedBy,
    updatedByName: model.updatedBy?.name ?? null,
  };
}

function metaFromArticle(article: Article, updatedByName: string | null): Meta {
  return {
    status: article.status,
    version: article.version,
    updatedAt: new Date(article.updatedAt),
    publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
    firstPublishedAt: article.firstPublishedAt ? new Date(article.firstPublishedAt) : null,
    scheduledAt: article.scheduledAt ? new Date(article.scheduledAt) : null,
    wordCount: article.wordCount,
    readingTimeMin: article.readingTimeMin,
    deletedAt: article.deletedAt ? new Date(article.deletedAt) : null,
    updatedBy: article.updatedBy,
    updatedByName,
  };
}

export function ArticleEditorPage({ model, settings, currentUser, canUploadMedia, canEditMedia }: ArticleEditorPageProps) {
  const t = useT();
  const router = useRouter();
  const articleId = model.article.id;

  const [values, setValues] = useState<EditorFormValues>(() => formValuesFromModel(model));
  const savedValuesRef = useRef<EditorFormValues>(values);
  const [savedKey, setSavedKey] = useState(() => serializeForm(values));
  const [meta, setMeta] = useState<Meta>(() => metaFromModel(model));
  const versionRef = useRef(model.article.version);
  const [notes, setNotes] = useState<EditorNote[]>(model.notes);
  const [mediaCache, setMediaCache] = useState<Record<string, EditorMediaInfo | Media>>(model.bodyMedia);
  const [relatedKnown, setRelatedKnown] = useState<EditorRelated[]>(model.related);
  const [articleTitles, setArticleTitles] = useState<Record<string, ResolvedArticle>>({});
  const [conflict, setConflict] = useState<{ message: string; currentVersion?: number } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [publishDialog, setPublishDialog] = useState<{ open: boolean; mode: PublishDialogMode }>({ open: false, mode: 'publish' });
  const [scheduledDraft, setScheduledDraft] = useState<Date | null>(model.article.scheduledAt);
  const [confirmAction, setConfirmAction] = useState<'trash' | 'destroy' | 'unpublish' | 'archive' | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptedPublish, setAttemptedPublish] = useState(false);
  const [issuesRefresh, setIssuesRefresh] = useState(0);

  const currentKey = useMemo(() => serializeForm(values), [values]);
  const dirty = currentKey !== savedKey;
  const dirtyRef = useRef(dirty);
  const valuesRef = useRef(values);
  useEffect(() => {
    dirtyRef.current = dirty;
    valuesRef.current = values;
  });

  const trashed = Boolean(meta.deletedAt);
  const editable = model.permissions.edit && !trashed;

  /* ---------------------------------------------------------------- lock */
  const lock = useLock({
    articleId,
    initial: model.lock,
    enabled: editable,
    onLost: (state) => {
      toast.warning(t('articles.lock.lost', { name: state.lockedBy?.name ?? '' }));
    },
  });
  const canEdit = editable && lock.mine && !lock.released;
  const disabled = !canEdit;

  /* ------------------------------------------------------------- saving */
  const update = useCallback((patch: Partial<EditorFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const autosave = useAutosave({
    articleId,
    enabled: canEdit,
    intervalMs: settings.editor.autosaveIntervalSec * 1000,
    getPayload: () => toArticleInput(valuesRef.current),
    getPayloadKey: () => serializeForm(valuesRef.current),
    isDirty: () => dirtyRef.current,
    getVersion: () => versionRef.current,
    onSaved: ({ version, savedAt, slug, payloadKey, kind }) => {
      versionRef.current = version;
      // Snapshot of what was saved: the payload key belongs to the values at send time.
      const sent = valuesRef.current;
      savedValuesRef.current = { ...sent, slug };
      setSavedKey(payloadKey === serializeForm(sent) ? serializeForm({ ...sent, slug }) : payloadKey);
      setValues((prev) => (prev.slug === slug ? prev : { ...prev, slug }));
      setMeta((prev) => ({ ...prev, version, updatedAt: savedAt, updatedBy: currentUser.id, updatedByName: currentUser.name }));
      setServerErrors({});
      if (kind === 'manual') setIssuesRefresh((n) => n + 1);
    },
    onConflict: (info) => setConflict(info),
    onError: (message, fieldErrors) => {
      if (fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrors)) flat[k] = v[0] ?? '';
        setServerErrors(flat);
      }
      toast.error(message);
    },
  });

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (!dirtyRef.current) return true;
    const res = await autosave.save('manual');
    return res.ok;
  }, [autosave, canEdit]);

  // Mod+S anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  // Unsaved-changes guard.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /* --------------------------------------------- re-sync after refresh */
  const modelRef = useRef(model);
  useEffect(() => {
    if (modelRef.current === model) return;
    modelRef.current = model;
    const ours = model.article.updatedBy === currentUser.id;
    setNotes(model.notes);
    setRelatedKnown((prev) => {
      const ids = new Set(model.related.map((r) => r.id));
      return [...model.related, ...prev.filter((p) => !ids.has(p.id))];
    });
    setMediaCache((prev) => ({ ...prev, ...model.bodyMedia }));
    if (!dirtyRef.current || ours) {
      versionRef.current = model.article.version;
    }
    if (!dirtyRef.current) {
      const next = formValuesFromModel(model);
      savedValuesRef.current = next;
      setValues(next);
      setSavedKey(serializeForm(next));
      setMeta(metaFromModel(model));
    } else {
      setMeta((prev) => ({ ...metaFromModel(model), version: ours ? model.article.version : prev.version }));
    }
  }, [model, currentUser.id]);

  /* -------------------------------------------------- publish preview */
  const contentType = model.contentTypes.find((c) => c.id === values.contentTypeId) ?? model.contentType;
  const mediaMap = useMemo(() => {
    const map = new Map<string, { id: string; alt: string | null; credit: string | null }>();
    for (const m of Object.values(mediaCache)) map.set(m.id, { id: m.id, alt: m.alt, credit: m.credit });
    return map;
  }, [mediaCache]);
  const previewIssues: PublishIssue[] = useMemo(
    () =>
      validateForPublish(
        {
          title: values.title,
          lead: values.lead,
          sectionId: values.sectionId,
          body: values.body,
          featuredMediaId: values.featuredMediaId,
          featuredCredit: values.featuredCredit,
          bylines: values.bylines,
          isSponsored: values.isSponsored,
          flags: values.flags,
          customFields: values.customFields,
        },
        settings,
        mediaMap,
        contentType.fields,
      ),
    [values, settings, mediaMap, contentType.fields],
  );
  const previewErrors = previewIssues.filter((i) => i.level === 'error');
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = { ...serverErrors };
    if (attemptedPublish) for (const issue of previewErrors) if (issue.field && !out[issue.field]) out[issue.field] = issue.message;
    return out;
  }, [serverErrors, attemptedPublish, previewErrors]);
  const customFieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (k.startsWith('customFields.')) out[k.slice('customFields.'.length)] = v;
    return out;
  }, [fieldErrors]);

  /* ---------------------------------------------------- transitions */
  function adopt(article: Article) {
    versionRef.current = article.version;
    setMeta(metaFromArticle(article, currentUser.name));
    setScheduledDraft(article.scheduledAt ? new Date(article.scheduledAt) : null);
  }

  async function runTransition(to: ArticleStatus, opts: { note?: string; scheduledAt?: Date | null } = {}) {
    setBusy(true);
    try {
      if (!(await saveNow())) return;
      const res = await transitionAction({ id: articleId, to, ...opts });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      adopt(res.data);
      toast.success(t(`articles.toast.transition.${to}`));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openPublishDialog(mode: PublishDialogMode, presetAt?: Date | null) {
    setAttemptedPublish(true);
    setBusy(true);
    try {
      if (!(await saveNow())) return;
      if (presetAt !== undefined) setScheduledDraft(presetAt);
      setIssuesRefresh((n) => n + 1);
      setPublishDialog({ open: true, mode });
    } finally {
      setBusy(false);
    }
  }

  async function confirmPublish() {
    if (!(await saveNow())) return;
    const res =
      publishDialog.mode === 'schedule'
        ? await scheduleAction({ id: articleId, at: scheduledDraft })
        : await publishAction(articleId);
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.fieldErrors)) flat[k] = v[0] ?? '';
        setServerErrors(flat);
      }
      setIssuesRefresh((n) => n + 1);
      return;
    }
    adopt(res.data);
    setPublishDialog((p) => ({ ...p, open: false }));
    toast.success(publishDialog.mode === 'schedule' ? t('articles.toast.transition.scheduled') : t('articles.toast.transition.published'));
    router.refresh();
  }

  async function toggleChecklist(itemId: string, checked: boolean) {
    const key = `checklist:${itemId}`;
    const previous = valuesRef.current.flags;
    const nextFlags = { ...previous, [key]: checked };
    update({ flags: nextFlags });
    const res = await toggleChecklistItemAction({ id: articleId, itemId, checked });
    if (!res.ok) {
      update({ flags: previous });
      toast.error(res.error);
      return;
    }
    // The server stored it too, so the saved snapshot carries the same flags.
    savedValuesRef.current = { ...savedValuesRef.current, flags: { ...savedValuesRef.current.flags, [key]: checked } };
    setSavedKey(serializeForm(savedValuesRef.current));
  }

  async function commitPlanning(patch: Pick<EditorFormValues, 'assignedTo' | 'deadlineAt' | 'plannedAt'>) {
    const res = await assignAction({ id: articleId, ...patch });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    savedValuesRef.current = { ...savedValuesRef.current, ...patch };
    setSavedKey(serializeForm(savedValuesRef.current));
  }

  async function changeType(contentTypeId: string) {
    if (!(await saveNow())) return;
    const res = await changeContentTypeAction({ id: articleId, contentTypeId });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    adopt(res.data);
    const next = { ...valuesRef.current, contentTypeId: res.data.contentTypeId, customFields: res.data.customFields ?? {} };
    savedValuesRef.current = next;
    setValues(next);
    setSavedKey(serializeForm(next));
    toast.success(t('articles.toast.typeChanged'));
    router.refresh();
  }

  async function duplicate() {
    if (!(await saveNow())) return;
    const res = await duplicateAction(articleId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t('articles.toast.duplicated'));
    router.push(adminPaths.article(res.data.id));
  }

  async function doConfirmAction() {
    if (confirmAction === 'trash') {
      const res = await trashAction(articleId);
      if (!res.ok) throw new Error(res.error);
      toast.success(t('articles.toast.trashed'));
      router.push(adminPaths.articles());
    } else if (confirmAction === 'destroy') {
      const res = await destroyAction(articleId);
      if (!res.ok) throw new Error(res.error);
      toast.success(t('articles.toast.destroyed'));
      router.push(adminPaths.articles());
    } else if (confirmAction === 'unpublish') {
      await runTransition('unpublished');
    } else if (confirmAction === 'archive') {
      await runTransition('archived');
    }
  }

  async function restoreFromTrash() {
    const res = await restoreAction(articleId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t('articles.toast.restored'));
    router.refresh();
  }

  /* -------------------------------------------------- button list */
  const perms = model.permissions;
  const transitions: TransitionButton[] = [];
  if (canEdit) {
    if (canTransition(meta.status, 'in_review')) {
      transitions.push({ key: 'in_review', label: t('articles.actions.sendToDesk'), icon: <Send />, onClick: () => void runTransition('in_review') });
    }
    if (perms.publish && canTransition(meta.status, 'approved')) {
      transitions.push({ key: 'approved', label: t('articles.actions.approve'), icon: <Check />, onClick: () => void runTransition('approved') });
    }
    if (perms.publish && canTransition(meta.status, 'published')) {
      transitions.push({ key: 'published', label: t('articles.actions.publish'), variant: 'primary', icon: <CheckCheck />, onClick: () => void openPublishDialog('publish') });
    }
    if (perms.publish && canTransition(meta.status, 'scheduled')) {
      transitions.push({ key: 'scheduled', label: meta.status === 'scheduled' ? t('articles.actions.reschedule') : t('articles.actions.schedule'), icon: <CalendarClock />, onClick: () => void openPublishDialog('schedule') });
    }
    if (perms.publish && meta.status === 'published') {
      transitions.push({ key: 'unpublished', label: t('articles.actions.unpublish'), variant: 'outline', icon: <Undo2 />, onClick: () => setConfirmAction('unpublish') });
    }
    if (canTransition(meta.status, 'draft') && (meta.status === 'in_review' || meta.status === 'approved' || (perms.publish && (meta.status === 'scheduled' || meta.status === 'unpublished' || meta.status === 'archived')))) {
      transitions.push({
        key: 'draft',
        label: meta.status === 'scheduled' ? t('articles.actions.cancelSchedule') : t('articles.actions.backToDraft'),
        variant: 'ghost',
        icon: <RotateCcw />,
        onClick: () => void runTransition('draft'),
      });
    }
    if (perms.publish && canTransition(meta.status, 'archived')) {
      transitions.push({ key: 'archived', label: t('articles.actions.archive'), variant: 'ghost', icon: <Archive />, onClick: () => setConfirmAction('archive') });
    }
  }

  const relatedTitles = useMemo(() => Object.fromEntries(relatedKnown.map((r) => [r.id, r.title])), [relatedKnown]);
  const sectionSlug = model.sections.find((s) => s.id === values.sectionId)?.slug ?? null;
  const featuredMedia = values.featuredMediaId ? (mediaCache[values.featuredMediaId] ?? null) : null;
  const cacheMedia = useCallback((media: Media) => setMediaCache((prev) => ({ ...prev, [media.id]: media })), []);

  const confirmCopy: Record<NonNullable<typeof confirmAction>, { title: string; description: string; confirm: string; destructive: boolean }> = {
    trash: { title: t('articles.confirm.trashTitle'), description: t('articles.confirm.trashBody'), confirm: t('articles.menu.trash'), destructive: true },
    destroy: { title: t('articles.confirm.destroyTitle'), description: t('articles.confirm.destroyBody'), confirm: t('articles.trash.destroy'), destructive: true },
    unpublish: { title: t('articles.confirm.unpublishTitle'), description: t('articles.confirm.unpublishBody'), confirm: t('articles.actions.unpublish'), destructive: false },
    archive: { title: t('articles.confirm.archiveTitle'), description: t('articles.confirm.archiveBody'), confirm: t('articles.actions.archive'), destructive: false },
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <EditorTopBar
        articleId={articleId}
        title={values.title}
        status={meta.status}
        savingState={autosave.state}
        savedAt={autosave.savedAt ?? meta.updatedAt}
        saveError={autosave.error}
        dirty={dirty}
        publicPath={model.publicPath}
        canEdit={editable}
        canDelete={perms.delete || (perms.edit && meta.status === 'draft' && model.article.createdBy === currentUser.id)}
        canCreate={perms.create}
        holdsLock={lock.mine && !lock.released}
        trashed={trashed}
        onBack={(e) => {
          if (dirtyRef.current && !window.confirm(t('articles.leaveConfirm'))) e.preventDefault();
        }}
        onDuplicate={() => void duplicate()}
        onDelete={() => setConfirmAction('trash')}
        onReleaseLock={() => void lock.release()}
      />

      {trashed ? (
        <Alert
          variant="warning"
          className="mb-4"
          title={t('articles.trash.title')}
          actions={
            perms.delete ? (
              <>
                <Button size="sm" variant="primary" onClick={() => void restoreFromTrash()}>
                  {t('articles.trash.restore')}
                </Button>
                <Button size="sm" variant="danger" leftIcon={<Trash2 />} onClick={() => setConfirmAction('destroy')}>
                  {t('articles.trash.destroy')}
                </Button>
              </>
            ) : undefined
          }
        >
          {t('articles.trash.body')}
        </Alert>
      ) : null}

      {editable ? (
        <div className="mb-4 empty:hidden">
          <LockBanner
            lock={lock.lock}
            released={lock.released}
            busy={lock.busy}
            onTakeOver={() => {
              void lock.acquire(true).then((ok) => {
                if (ok) {
                  toast.success(t('articles.lock.tookOver'));
                  router.refresh();
                } else toast.error(t('articles.lock.takeOverFailed'));
              });
            }}
            onRetry={() => {
              void lock.acquire(false).then((ok) => {
                if (ok) router.refresh();
                else toast.info(t('articles.lock.stillLocked'));
              });
            }}
          />
        </div>
      ) : !model.permissions.edit && !trashed ? (
        <Alert variant="info" className="mb-4">
          {t('articles.status.readOnly')}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <MainColumn
            articleId={articleId}
            values={values}
            update={update}
            disabled={disabled}
            settings={settings}
            errors={fieldErrors}
            onSave={() => void saveNow()}
            onMediaPicked={cacheMedia}
            relatedTitles={relatedTitles}
            canUpload={canUploadMedia}
            canEditMedia={canEditMedia}
          />
        </div>

        <aside
          className="grid content-start gap-3 lg:sticky lg:top-[calc(var(--spacing-topbar)+3.5rem)] lg:max-h-[calc(100dvh-var(--spacing-topbar)-4rem)] lg:overflow-y-auto lg:pr-1"
          aria-label={t('articles.sidebar.label')}
        >
          <SidebarSection id="status" title={t('articles.sidebar.status')}>
            <StatusCard
              status={meta.status}
              version={meta.version}
              updatedAt={meta.updatedAt}
              updatedByName={meta.updatedByName}
              publishedAt={meta.publishedAt}
              scheduledAt={meta.scheduledAt}
              wordCount={meta.wordCount}
              readingTimeMin={meta.readingTimeMin}
              dirty={dirty}
              saving={autosave.saving}
              canEdit={canEdit}
              onSave={() => void saveNow()}
              transitions={transitions}
              busy={busy}
            />
            {canEdit && meta.status !== 'published' ? (
              <p className={previewErrors.length === 0 ? 'text-success mt-3 text-xs' : 'text-muted mt-3 text-xs'} aria-live="polite">
                {previewErrors.length === 0
                  ? t('articles.status.readyToPublish')
                  : t('articles.status.issuesRemaining', { count: previewErrors.length })}
              </p>
            ) : null}
          </SidebarSection>

          <SidebarSection id="publish" title={t('articles.sidebar.publish')}>
            <PublishCard
              values={values}
              update={update}
              disabled={disabled}
              status={meta.status}
              publishedAt={meta.publishedAt}
              firstPublishedAt={meta.firstPublishedAt}
              scheduledAt={meta.scheduledAt}
              canPublish={canEdit && perms.publish}
              paywallEnabled={settings.paywall.enabled}
              onSchedule={(at) => void openPublishDialog('schedule', at)}
              onCancelSchedule={() => void runTransition('draft')}
              busy={busy}
            />
          </SidebarSection>

          <SidebarSection id="taxonomy" title={t('articles.sidebar.taxonomy')}>
            <TaxonomyCard
              values={values}
              update={update}
              disabled={disabled}
              sections={model.sections}
              tagOptions={model.tagOptions}
              errors={fieldErrors}
              canCreateTags={perms.create}
            />
          </SidebarSection>

          <SidebarSection id="bylines" title={t('articles.sidebar.bylines')} meta={values.bylines.length || undefined}>
            <BylinesCard values={values} update={update} disabled={disabled} authors={model.authorOptions} error={fieldErrors.bylines} />
          </SidebarSection>

          <SidebarSection id="featured" title={t('articles.sidebar.featured')}>
            <FeaturedMediaCard
              values={values}
              update={update}
              disabled={disabled}
              media={featuredMedia}
              onMediaPicked={cacheMedia}
              canUpload={canUploadMedia}
              canEditMedia={canEditMedia}
              error={fieldErrors.featuredMediaId}
            />
          </SidebarSection>

          <SidebarSection id="content-type" title={t('articles.sidebar.contentType')} meta={contentType.name}>
            <ContentTypeCard
              articleId={articleId}
              contentType={contentType}
              contentTypes={model.contentTypes}
              values={values.customFields}
              onChange={(customFields) => update({ customFields })}
              errors={customFieldErrors}
              disabled={disabled}
              onChangeType={changeType}
              resolvedMedia={mediaCache}
              resolvedArticles={{ ...Object.fromEntries(relatedKnown.map((r) => [r.id, { id: r.id, title: r.title }])), ...articleTitles }}
              onMediaResolved={cacheMedia}
              onArticleResolved={(a) => setArticleTitles((prev) => ({ ...prev, [a.id]: a }))}
            />
          </SidebarSection>

          <SidebarSection id="seo" title={t('articles.sidebar.seo')} defaultOpen={false}>
            <SeoCard
              values={values}
              update={update}
              disabled={disabled}
              sectionSlug={sectionSlug}
              articleId={articleId}
              published={Boolean(meta.firstPublishedAt)}
              errors={fieldErrors}
              siteTitleSuffix={settings.seo.titleSuffix}
            />
          </SidebarSection>

          <SidebarSection id="planning" title={t('articles.sidebar.planning')} defaultOpen={false}>
            <PlanningCard values={values} update={update} disabled={disabled} members={model.members} onCommit={(patch) => void commitPlanning(patch)} />
          </SidebarSection>

          <SidebarSection
            id="checklist"
            title={t('articles.sidebar.checklist')}
            meta={model.checklist.enabled ? `${model.checklist.items.filter((i) => values.flags[`checklist:${i.id}`]).length}/${model.checklist.items.length}` : undefined}
          >
            <ChecklistCard items={model.checklist.items} enabled={model.checklist.enabled} flags={values.flags} disabled={disabled} onToggle={(id, checked) => void toggleChecklist(id, checked)} />
          </SidebarSection>

          <SidebarSection id="related" title={t('articles.sidebar.related')} meta={values.relatedIds.length || undefined}>
            <RelatedCard
              relatedIds={values.relatedIds}
              onChange={(relatedIds) => update({ relatedIds })}
              disabled={disabled}
              known={relatedKnown}
              currentId={articleId}
              onResolved={(a) => setRelatedKnown((prev) => (prev.some((p) => p.id === a.id) ? prev : [...prev, a]))}
            />
          </SidebarSection>

          <SidebarSection id="notes" title={t('articles.sidebar.notes')} meta={notes.filter((n) => !n.resolvedAt).length || undefined}>
            <NotesCard articleId={articleId} notes={notes} onNotesChange={setNotes} currentUser={currentUser} disabled={!editable} />
          </SidebarSection>

          <SidebarSection id="revisions" title={t('articles.sidebar.revisions')} defaultOpen={false}>
            <RevisionsCard articleId={articleId} count={model.revisions.count} latest={model.revisions.latest} />
          </SidebarSection>
        </aside>
      </div>

      <PublishDialog
        open={publishDialog.open}
        onOpenChange={(open) => setPublishDialog((p) => ({ ...p, open }))}
        mode={publishDialog.mode}
        articleId={articleId}
        title={values.title}
        checklist={model.checklist}
        flags={values.flags}
        onToggleChecklist={toggleChecklist}
        scheduledAt={scheduledDraft}
        onScheduledAtChange={setScheduledDraft}
        onConfirm={confirmPublish}
        refreshKey={issuesRefresh}
      />

      <ConflictDialog
        open={conflict !== null}
        message={conflict?.message ?? ''}
        busy={autosave.saving}
        canOverwrite={typeof conflict?.currentVersion === 'number' && perms.editAny}
        onReload={() => window.location.reload()}
        onOverwrite={() => {
          const version = conflict?.currentVersion;
          setConflict(null);
          if (typeof version === 'number') {
            versionRef.current = version;
            void autosave.save('manual', { version });
          }
        }}
        onDismiss={() => setConflict(null)}
      />

      {confirmAction ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmCopy[confirmAction].title}
          description={confirmCopy[confirmAction].description}
          confirmLabel={confirmCopy[confirmAction].confirm}
          destructive={confirmCopy[confirmAction].destructive}
          onConfirm={doConfirmAction}
        />
      ) : null}
    </div>
  );
}
