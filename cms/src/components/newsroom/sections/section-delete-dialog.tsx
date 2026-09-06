'use client';
/**
 * SectionDeleteDialog — deleting a section that still has articles requires
 * deciding where they go (another section or "no section"); an empty section
 * just asks for confirmation. Child sections move up to the deleted section's
 * parent (the service does that).
 */
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { deleteSectionAction } from '@/server/taxonomy/actions';

import { descendantIds, type SectionDto } from './types';

export type SectionDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SectionDto;
  all: SectionDto[];
};

export function SectionDeleteDialog({ open, onOpenChange, section, all }: SectionDeleteDialogProps) {
  const t = useT();
  const [reassignTo, setReassignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const hasArticles = section.articleCount > 0;
  const excluded = descendantIds(all, section.id);
  const targets = all.filter((s) => !excluded.has(s.id));

  async function confirm() {
    setBusy(true);
    const result = await deleteSectionAction(
      hasArticles ? { id: section.id, reassignTo: reassignTo || null } : { id: section.id },
    );
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('taxonomy.sections.toast.deleted', { name: section.name }));
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      preventClose={busy}
      title={t('taxonomy.sections.delete.title', { name: section.name })}
      description={
        hasArticles
          ? t('taxonomy.sections.delete.hasArticles', { count: section.articleCount })
          : t('taxonomy.sections.delete.empty')
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy}>
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        {hasArticles ? (
          <FormField
            label={t('taxonomy.sections.delete.reassign')}
            htmlFor="section-reassign"
            help={t('taxonomy.sections.delete.reassignHelp')}
          >
            <NativeSelect
              id="section-reassign"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              options={[
                { value: '', label: t('taxonomy.sections.delete.noSection') },
                ...targets.map((s) => ({ value: s.id, label: s.parentId ? `– ${s.name}` : s.name })),
              ]}
            />
          </FormField>
        ) : null}
        {all.some((s) => s.parentId === section.id) ? (
          <Alert variant="info">{t('taxonomy.sections.delete.children')}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
