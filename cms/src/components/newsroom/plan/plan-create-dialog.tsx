'use client';
/**
 * PlanCreateDialog — "Ny planlagt sak" from the plan: title, section,
 * assignee, planned date (prefilled from the day clicked) and deadline. The
 * draft is created through the editor's createArticleAction so every rule
 * about slugs, default content type and revisions applies; afterwards the
 * user lands in the editor or stays on the plan.
 */
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { createArticleAction } from '@/server/articles/actions';

import type { PlanOption } from './types';

export type PlanCreateDialogProps = {
  members: PlanOption[];
  sections: PlanOption[];
  /** Default planned instant (ISO); the day cell passes 09:00 Oslo of that day. */
  defaultPlannedAt?: string | null;
  /** Render as the small "+" in a day cell instead of a full button. */
  compact?: boolean;
  /** Preselect the current user as assignee. */
  currentUserId: string;
};

export function PlanCreateDialog({ members, sections, defaultPlannedAt, compact = false, currentUserId }: PlanCreateDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUserId);
  const [plannedAt, setPlannedAt] = useState<Date | null>(defaultPlannedAt ? new Date(defaultPlannedAt) : null);
  const [deadlineAt, setDeadlineAt] = useState<Date | null>(null);
  const [openAfter, setOpenAfter] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setTitle('');
    setSectionId('');
    setAssignedTo(currentUserId);
    setPlannedAt(defaultPlannedAt ? new Date(defaultPlannedAt) : null);
    setDeadlineAt(null);
    setErrors({});
  }

  async function submit() {
    if (!title.trim()) {
      setErrors({ title: [t('plan.create.titleRequired')] });
      return;
    }
    setSaving(true);
    setErrors({});
    const result = await createArticleAction({
      title: title.trim(),
      sectionId: sectionId || null,
      assignedTo: assignedTo || null,
      plannedAt,
      deadlineAt,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(t('plan.toast.created', { title: title.trim() }));
    setOpen(false);
    reset();
    if (openAfter) router.push(adminPaths.article(result.data.id));
    else router.refresh();
  }

  return (
    <>
      {compact ? (
        <IconButton
          label={t('plan.create.forDay')}
          size="sm"
          className="text-subtle hover:text-text opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setOpen(true)}
        >
          <Plus />
        </IconButton>
      ) : (
        <Button onClick={() => setOpen(true)} leftIcon={<Plus />}>
          {t('plan.create.button')}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) reset();
        }}
        title={t('plan.create.title')}
        description={t('plan.create.description')}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              {t('plan.create.submit')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FormField label={t('plan.create.field.title')} htmlFor="plan-new-title" required error={errors.title?.[0]}>
            <Input id="plan-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('plan.create.titlePlaceholder')} autoFocus maxLength={300} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('plan.create.field.section')} htmlFor="plan-new-section" error={errors.sectionId?.[0]}>
              <NativeSelect
                id="plan-new-section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                placeholder={t('plan.create.noSection')}
                options={sections.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormField>
            <FormField label={t('plan.field.assignedTo')} htmlFor="plan-new-assignee" error={errors.assignedTo?.[0]}>
              <NativeSelect
                id="plan-new-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder={t('plan.unassigned')}
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('plan.field.plannedAt')} htmlFor="plan-new-planned" error={errors.plannedAt?.[0]}>
              <DateTimeInput id="plan-new-planned" value={plannedAt} onChange={setPlannedAt} />
            </FormField>
            <FormField label={t('plan.field.deadlineAt')} htmlFor="plan-new-deadline" error={errors.deadlineAt?.[0]}>
              <DateTimeInput id="plan-new-deadline" value={deadlineAt} onChange={setDeadlineAt} />
            </FormField>
          </div>
          <Checkbox label={t('plan.create.openAfter')} checked={openAfter} onCheckedChange={(v) => setOpenAfter(v === true)} />
        </form>
      </Dialog>
    </>
  );
}
