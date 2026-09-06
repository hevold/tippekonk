'use client';
/**
 * NewArticleLauncher — /admin/artikler/ny. With one active content type (or
 * a valid ?type=key) it creates the draft right away and replaces the URL
 * with the editor; with several it shows a small chooser. Creation happens
 * from the client so link prefetching can never create stray drafts.
 */
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { createArticleAction } from '@/server/articles/actions';
import type { EditorContentType } from '@/server/articles/queries';

export type NewArticleLauncherProps = {
  types: EditorContentType[];
  /** Content type key from ?type=. */
  preselectedKey: string | null;
};

export function NewArticleLauncher({ types, preselectedKey }: NewArticleLauncherProps) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const preselected = preselectedKey ? types.find((c) => c.key === preselectedKey) : undefined;
  const auto = preselected ?? (types.length === 1 ? types[0] : undefined);

  async function create(type: EditorContentType) {
    setCreating(type.id);
    setError(null);
    const res = await createArticleAction({ contentTypeId: type.id });
    if (!res.ok) {
      setError(res.error);
      setCreating(null);
      return;
    }
    router.replace(adminPaths.article(res.data.id));
  }

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void create(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto?.id]);

  if (types.length === 0) {
    return <Alert variant="warning">{t('articles.new.noTypes')}</Alert>;
  }

  if (auto && !error) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Spinner label={t('articles.new.creating')} />
        <span className="text-muted text-sm">{t('articles.new.creating')}</span>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert variant="danger" live>{error}</Alert> : null}
      <p className="text-muted text-sm">{t('articles.new.chooseType')}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {types.map((type) => (
          <li key={type.id}>
            <Button
              variant="outline"
              className="h-auto w-full flex-col items-start gap-1 px-4 py-3 text-left whitespace-normal"
              loading={creating === type.id}
              disabled={creating !== null && creating !== type.id}
              onClick={() => void create(type)}
            >
              <span className="flex items-center gap-2 font-semibold">
                <FileText className="size-4" aria-hidden />
                {type.name}
                {type.isDefault ? <span className="text-muted text-xs font-normal">({t('articles.new.default')})</span> : null}
              </span>
              {type.description ? <span className="text-muted text-sm font-normal">{type.description}</span> : null}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
