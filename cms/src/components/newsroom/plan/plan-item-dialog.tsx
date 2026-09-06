'use client';
/**
 * PlanItemDialog — "Planlegging" for one story: planned date, deadline and
 * assignee, saved through updatePlanningAction (only the fields that changed
 * are sent). Used from the calendar chips and the attention panel.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { updatePlanningAction } from '@/server/plan/actions';

import type { PlanArticleDto, PlanOption } from './types';

export type PlanItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: PlanArticleDto;
  members: PlanOption[];
  /** Which field to put first / focus (e.g. 'plannedAt' from "Flytt"). */
  focus?: 'plannedAt' | 'deadlineAt' | 'assignedTo';
};

const toDate = (v: string | null) => (v ? new Date(v) : null);
const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function PlanItemDialog({ open, onOpenChange, article, members, focus = 'plannedAt' }: PlanItemDialogProps) {
  const t = useT();
  const [plannedAt, setPlannedAt] = useState<Date | null>(toDate(article.plannedAt));
  const [deadlineAt, setDeadlineAt] = useState<Date | null>(toDate(article.deadlineAt));
  const [assignedTo, setAssignedTo] = useState<string>(article.assignedTo ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function save() {
    const patch: Record<string, unknown> = { id: article.id };
    if (!sameInstant(plannedAt, toDate(article.plannedAt))) patch.plannedAt = plannedAt;
    if (!sameInstant(deadlineAt, toDate(article.deadlineAt))) patch.deadlineAt = deadlineAt;
    if ((assignedTo || null) !== article.assignedTo) patch.assignedTo = assignedTo || null;
    if (Object.keys(patch).length === 1) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setErrors({});
    const result = await updatePlanningAction(patch);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(t('plan.toast.saved'));
    onOpenChange(false);
  }

  const title = article.title.trim() || t('plan.untitled');
  const fields = {
    plannedAt: (
      <FormField key="plannedAt" label={t('plan.field.plannedAt')} htmlFor="plan-planned" help={t('plan.field.plannedHelp')} error={errors.plannedAt?.[0]}>
        <DateTimeInput id="plan-planned" value={plannedAt} onChange={setPlannedAt} />
      </FormField>
    ),
    deadlineAt: (
      <FormField key="deadlineAt" label={t('plan.field.deadlineAt')} htmlFor="plan-deadline" error={errors.deadlineAt?.[0]}>
        <DateTimeInput id="plan-deadline" value={deadlineAt} onChange={setDeadlineAt} />
      </FormField>
    ),
    assignedTo: (
      <FormField key="assignedTo" label={t('plan.field.assignedTo')} htmlFor="plan-assignee" error={errors.assignedTo?.[0]}>
        <NativeSelect
          id="plan-assignee"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder={t('plan.unassigned')}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      </FormField>
    ),
  };
  const order: (keyof typeof fields)[] = [focus, ...(['plannedAt', 'deadlineAt', 'assignedTo'] as const).filter((k) => k !== focus)];

  return (
    <Dialog
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title={t('plan.dialog.title')}
      description={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {order.map((k) => fields[k])}
      </form>
    </Dialog>
  );
}
