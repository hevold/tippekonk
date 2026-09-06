'use client';
/**
 * PlanningCard ("Planlegging") — assignee, deadline and planned publication
 * for the redaksjonsplan. Saved through assignAction immediately (so the
 * assignee gets notified) and mirrored into the form values.
 */
import { DateTimeInput } from '@/components/ui/date-time-input';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { useT } from '@/lib/i18n/client';
import type { EditorPerson } from '@/server/articles/queries';

import type { EditorFormValues } from './types';

export type PlanningCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  members: EditorPerson[];
  /** Persist planning fields right away (assignment notifications). */
  onCommit: (patch: Pick<EditorFormValues, 'assignedTo' | 'deadlineAt' | 'plannedAt'>) => void;
};

export function PlanningCard({ values, update, disabled, members, onCommit }: PlanningCardProps) {
  const t = useT();
  function commit(patch: Partial<Pick<EditorFormValues, 'assignedTo' | 'deadlineAt' | 'plannedAt'>>) {
    const next = { assignedTo: values.assignedTo, deadlineAt: values.deadlineAt, plannedAt: values.plannedAt, ...patch };
    update(next);
    onCommit(next);
  }
  return (
    <div className="grid gap-4">
      <FormField label={t('articles.planning.assignedTo')} htmlFor="plan-assigned">
        <NativeSelect
          id="plan-assigned"
          value={values.assignedTo ?? ''}
          disabled={disabled}
          placeholder={t('articles.planning.unassigned')}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(e) => commit({ assignedTo: e.target.value || null })}
        />
      </FormField>
      <FormField label={t('articles.planning.deadline')} htmlFor="plan-deadline">
        <DateTimeInput id="plan-deadline" value={values.deadlineAt} disabled={disabled} onChange={(d) => commit({ deadlineAt: d })} />
      </FormField>
      <FormField label={t('articles.planning.plannedAt')} htmlFor="plan-planned" help={t('articles.planning.plannedHelp')}>
        <DateTimeInput id="plan-planned" value={values.plannedAt} disabled={disabled} onChange={(d) => commit({ plannedAt: d })} />
      </FormField>
    </div>
  );
}
