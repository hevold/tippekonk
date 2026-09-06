'use client';
/**
 * TagMergeDialog — merge one tag into another: every article tagged with
 * the source gets the target instead, then the source is deleted.
 */
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { mergeTagsAction } from '@/server/taxonomy/actions';

import type { TagDto } from './types';

export type TagMergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: TagDto;
  all: TagDto[];
};

export function TagMergeDialog({ open, onOpenChange, source, all }: TagMergeDialogProps) {
  const t = useT();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = all.find((x) => x.id === targetId) ?? null;

  async function merge() {
    if (!targetId) {
      setError(t('taxonomy.tags.merge.pickTarget'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await mergeTagsAction({ sourceId: source.id, targetId });
    setBusy(false);
    if (!result.ok) {
      setError(result.fieldErrors?.targetId?.[0] ?? null);
      toast.error(result.error);
      return;
    }
    toast.success(
      t('taxonomy.tags.toast.merged', {
        source: source.name,
        target: result.data.target.name,
        count: result.data.moved,
      }),
    );
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      preventClose={busy}
      title={t('taxonomy.tags.merge.title', { name: source.name })}
      description={t('taxonomy.tags.merge.description')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void merge()} loading={busy} disabled={!targetId}>
            {t('taxonomy.tags.merge.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <FormField label={t('taxonomy.tags.merge.target')} htmlFor="tag-merge-target" error={error} required>
          <Combobox
            id="tag-merge-target"
            value={targetId}
            onChange={setTargetId}
            placeholder={t('taxonomy.tags.merge.targetPlaceholder')}
            searchPlaceholder={t('taxonomy.tags.searchPlaceholder')}
            options={all
              .filter((x) => x.id !== source.id)
              .map((x) => ({
                value: x.id,
                label: x.name,
                description: t('taxonomy.tags.count', { count: x.articleCount }),
                keywords: [x.slug],
              }))}
          />
        </FormField>
        {target ? (
          <Alert variant="warning">
            {t('taxonomy.tags.merge.summary', {
              source: source.name,
              target: target.name,
              count: source.articleCount,
            })}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
