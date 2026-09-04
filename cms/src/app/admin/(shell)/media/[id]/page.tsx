/**
 * /admin/media/[id] — one file: large preview, metadata form, focal point,
 * generated variants, where it is used, and trash/restore/destroy.
 */
import { FileAudio, FileText, FileVideo } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FocalPointEditor } from '@/components/media/focal-point-picker';
import { MediaDetailActions } from '@/components/media/media-detail-actions';
import { MediaDetailsForm } from '@/components/media/media-details-form';
import { MediaImage } from '@/components/media/media-image';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime, formatRelative } from '@/components/ui/format';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminPaths } from '@/config/routes';
import { db } from '@/db';
import { users } from '@/db/schema';
import { t } from '@/lib/i18n';
// INTEGRATION: provided by the auth area (SPEC 4.2).
import { getAdminContext } from '@/server/auth/context';
import { formatBytes } from '@/server/media/mime';
import { getMedia, listFolders, mediaUsage } from '@/server/media/queries';
import { mediaOriginalUrl, sortedVariants, storageKeyUrl } from '@/server/media/urls';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await getAdminContext();
  const { id } = await params;
  const media = await getMedia(ctx.site.id, id);
  return { title: media ? media.filename : 'Mediearkiv' };
}

export default async function MediaDetailPage({ params }: { params: Params }) {
  const ctx = await getAdminContext();
  const { id } = await params;
  const media = await getMedia(ctx.site.id, id);
  if (!media) notFound();

  const [usage, folders, uploader] = await Promise.all([
    mediaUsage(ctx.site.id, media.id),
    listFolders(ctx.site.id),
    media.uploadedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, media.uploadedBy)).limit(1)
      : Promise.resolve([]),
  ]);
  const uploaderName = uploader[0]?.name ?? null;
  const variants = sortedVariants(media.variants);
  const trashed = Boolean(media.deletedAt);
  const can = { edit: ctx.can('media:edit') && !trashed, delete: ctx.can('media:delete') };
  const now = new Date();

  const facts: { label: string; value: string }[] = [
    { label: t('media.facts.kind'), value: t(`media.kind.${media.kind}`) },
    { label: t('media.facts.mime'), value: media.mime },
    { label: t('media.facts.size'), value: formatBytes(media.size) },
    ...(media.width && media.height
      ? [{ label: t('media.facts.dimensions'), value: `${media.width} × ${media.height} px` }]
      : []),
    ...(media.duration
      ? [{ label: t('media.facts.duration'), value: `${Math.round(media.duration)} s` }]
      : []),
    {
      label: t('media.facts.uploaded'),
      value: `${formatDateTime(media.createdAt)}${uploaderName ? ` · ${uploaderName}` : ''}`,
    },
    { label: t('media.facts.updated'), value: formatRelative(media.updatedAt, now) },
    { label: t('media.facts.key'), value: media.storageKey },
  ];

  return (
    <>
      <PageHeader
        title={media.filename}
        breadcrumbs={[{ label: t('media.title'), href: adminPaths.media() }, { label: media.filename }]}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="muted">{t(`media.kind.${media.kind}`)}</Badge>
            {media.folder ? (
              <Link
                href={`${adminPaths.media()}?folder=${encodeURIComponent(media.folder)}`}
                className="hover:underline"
              >
                {media.folder}
              </Link>
            ) : null}
            {media.kind === 'image' && !media.alt ? (
              <Badge variant="warning">{t('media.card.missingAlt')}</Badge>
            ) : null}
          </span>
        }
        actions={<MediaDetailActions media={media} usageCount={usage.length} can={can} />}
      />

      {trashed ? (
        <Alert variant="warning" title={t('media.detail.trashedTitle')} className="mb-4">
          {t('media.detail.trashedDescription', { date: formatDateTime(media.deletedAt!) })}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent className="p-3">
              {media.kind === 'image' ? (
                <MediaImage
                  media={media}
                  aspect="auto"
                  fit="contain"
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  priority
                  className="max-h-[36rem] rounded"
                  imgClassName="object-contain"
                />
              ) : media.kind === 'video' ? (
                <video
                  controls
                  preload="metadata"
                  className="max-h-[36rem] w-full rounded bg-black"
                  src={mediaOriginalUrl(media)}
                >
                  {t('media.detail.noPlayer')}
                </video>
              ) : media.kind === 'audio' ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <FileAudio className="text-muted size-10" aria-hidden />
                  <audio
                    controls
                    preload="metadata"
                    src={mediaOriginalUrl(media)}
                    className="w-full max-w-md"
                  >
                    {t('media.detail.noPlayer')}
                  </audio>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-10">
                  <FileText className="text-muted size-10" aria-hidden />
                  <a
                    href={mediaOriginalUrl(media)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t('media.detail.openFile')}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {media.kind === 'image' ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('media.focal.title')}</CardTitle>
                <CardDescription>{t('media.focal.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <FocalPointEditor media={media} canEdit={can.edit} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('media.usage.title')}</CardTitle>
              <CardDescription>
                {usage.length === 0 ? t('media.usage.none') : t('media.usage.count', { count: usage.length })}
              </CardDescription>
            </CardHeader>
            {usage.length > 0 ? (
              <CardContent className="px-0 pb-0">
                <Table className="border-0 [&_tr:last-child]:border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.title')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('media.usage.where')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-[24rem]">
                          <Link
                            href={adminPaths.article(a.id)}
                            className="block truncate font-medium hover:underline"
                          >
                            {a.title.trim() || t('media.usage.untitled')}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell className="text-muted hidden sm:table-cell">
                          {[a.featured && t('media.usage.featured'), a.inBody && t('media.usage.body')]
                            .filter(Boolean)
                            .join(' · ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            ) : null}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('media.detail.metadata')}</CardTitle>
            </CardHeader>
            <CardContent>
              <MediaDetailsForm media={media} folders={folders.map((f) => f.name)} canEdit={can.edit} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('media.detail.facts')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {facts.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="min-w-0 break-all">{f.value}</dd>
                  </div>
                ))}
                {media.takenAt ? (
                  <div className="contents">
                    <dt className="text-muted">{t('media.field.takenAt')}</dt>
                    <dd>{formatDateTime(media.takenAt)}</dd>
                  </div>
                ) : null}
                {media.dominantColor ? (
                  <div className="contents">
                    <dt className="text-muted">{t('media.facts.dominantColor')}</dt>
                    <dd className="inline-flex items-center gap-2">
                      <span
                        className="border-border inline-block size-4 rounded-sm border"
                        style={{ backgroundColor: media.dominantColor }}
                        aria-hidden
                      />
                      {media.dominantColor}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {media.kind === 'image' ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('media.variants.title')}</CardTitle>
                <CardDescription>
                  {t('media.variants.description', { count: variants.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Table className="border-0 [&_tr:last-child]:border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('media.variants.width')}</TableHead>
                      <TableHead>{t('media.variants.format')}</TableHead>
                      <TableHead className="text-right">{t('media.facts.size')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <a
                          href={mediaOriginalUrl(media)}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {t('media.variants.original')} ({media.width} × {media.height})
                        </a>
                      </TableCell>
                      <TableCell className="text-muted">{media.mime.replace('image/', '')}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBytes(media.size)}</TableCell>
                    </TableRow>
                    {variants.map((v) => (
                      <TableRow key={v.key}>
                        <TableCell>
                          <a
                            href={storageKeyUrl(v.key)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {v.width} × {v.height}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted">{v.format}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBytes(v.size)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : media.kind === 'video' ? (
            <Card>
              <CardContent className="text-muted flex items-center gap-2 text-sm">
                <FileVideo className="size-4" aria-hidden />
                {t('media.detail.videoHint')}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
