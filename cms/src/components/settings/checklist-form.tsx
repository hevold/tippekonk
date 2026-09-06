'use client';
/**
 * Sjekkliste — enable/disable the pre-publish checklist and edit its items
 * (label, required, VVP reference, help). Items are sortable with dnd-kit
 * (keyboard: focus the handle, space, arrows) and can be reset to
 * DEFAULT_CHECKLIST.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import { GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState, type CSSProperties } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';

import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n/client';
import { DEFAULT_CHECKLIST, type SiteSettings } from '@/lib/validation/site';
import { cn } from '@/lib/utils';
import {
  checklistSectionSchema,
  type ChecklistSectionInput,
  type ChecklistSectionOutput,
} from '@/server/settings/schema';

import { SettingsCard, SettingsSaveBar, useSettingsSave, useUnsavedChangesGuard } from './settings-form';

function valuesFrom(s: SiteSettings): ChecklistSectionInput {
  return {
    checklist: {
      enabled: s.checklist.enabled,
      items: s.checklist.items.map((i) => ({
        id: i.id,
        label: i.label,
        required: i.required,
        vvpRef: i.vvpRef ?? '',
        help: i.help ?? '',
      })),
    },
  };
}

function newItem() {
  return { id: `item-${nanoid(8)}`, label: '', required: false, vvpRef: '', help: '' };
}

type ItemRowProps = {
  id: string;
  index: number;
  register: UseFormRegister<ChecklistSectionInput>;
  control: Control<ChecklistSectionInput>;
  errors: FieldErrors<ChecklistSectionInput>;
  onRemove: () => void;
};

function ItemRow({ id, index, register, control, errors, onRemove }: ItemRowProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const itemErrors = errors.checklist?.items?.[index];
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-border bg-surface grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr]',
        isDragging && 'z-10 shadow-lg',
      )}
      aria-label={t('settings.checklist.item', { index: index + 1 })}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="text-muted hover:text-text focus-visible:outline-ring flex h-9 w-7 cursor-grab touch-none items-center justify-center rounded focus-visible:outline-2 active:cursor-grabbing"
        aria-label={t('settings.checklist.dragHandle')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
          <FormField label={t('settings.checklist.label')} required error={itemErrors?.label?.message}>
            <Input
              {...register(`checklist.items.${index}.label`)}
              placeholder={t('settings.checklist.labelPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('settings.checklist.vvpRef')}
            help={t('settings.checklist.vvpRefHelp')}
            error={itemErrors?.vvpRef?.message}
          >
            <Input
              {...register(`checklist.items.${index}.vvpRef`)}
              placeholder="4.14"
              className="font-mono"
            />
          </FormField>
          <div className="flex items-end justify-end gap-1 pb-1 sm:pt-6">
            <IconButton label={t('settings.checklist.remove')} onClick={onRemove}>
              <Trash2 />
            </IconButton>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
          <Controller
            control={control}
            name={`checklist.items.${index}.required`}
            render={({ field }) => (
              <Checkbox
                label={t('settings.checklist.required')}
                description={t('settings.checklist.requiredHelp')}
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                className="sm:pt-1"
              />
            )}
          />
          <FormField label={t('settings.checklist.help')} error={itemErrors?.help?.message}>
            <Input
              {...register(`checklist.items.${index}.help`)}
              placeholder={t('settings.checklist.helpPlaceholder')}
            />
          </FormField>
        </div>
      </div>
    </li>
  );
}

export function ChecklistSettingsForm({ settings }: { settings: SiteSettings }) {
  const t = useT();
  const form = useForm<ChecklistSectionInput, unknown, ChecklistSectionOutput>({
    resolver: zodResolver(checklistSectionSchema),
    defaultValues: valuesFrom(settings),
  });
  const { register, control, handleSubmit, formState, reset, setValue } = form;
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'checklist.items',
    keyName: 'key',
  });
  const { save, saving } = useSettingsSave<ChecklistSectionInput>('checklist');
  useUnsavedChangesGuard(formState.isDirty);
  const [resetOpen, setResetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from === -1 || to === -1) return;
    move(from, to);
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      checklist: {
        enabled: values.checklist.enabled,
        items: values.checklist.items.map((i) => ({
          id: i.id,
          label: i.label,
          required: i.required,
          ...(i.vvpRef ? { vvpRef: i.vvpRef } : {}),
          ...(i.help ? { help: i.help } : {}),
        })),
      },
    };
    const result = await save(form, payload);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  const listError =
    formState.errors.checklist?.items?.root?.message ?? formState.errors.checklist?.items?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.checklist.title')}>
      <SettingsCard title={t('settings.checklist.title')} description={t('settings.checklist.description')}>
        <Controller
          control={control}
          name="checklist.enabled"
          render={({ field }) => (
            <Switch
              label={t('settings.checklist.enabled')}
              description={t('settings.checklist.enabledHelp')}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <a
          href="https://presse.no/pfu/etiske-regler/vaer-varsom-plakaten/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          {t('settings.checklist.vvpLink')}
        </a>
      </SettingsCard>

      <SettingsCard
        title={t('settings.checklist.items')}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw />}
              onClick={() => setResetOpen(true)}
            >
              {t('settings.checklist.reset')}
            </Button>
            <Button type="button" size="sm" leftIcon={<Plus />} onClick={() => append(newItem())}>
              {t('settings.checklist.addItem')}
            </Button>
          </div>
        }
      >
        {fields.length === 0 ? (
          <EmptyState compact title={t('settings.checklist.empty')} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ol className="grid gap-3">
                {fields.map((field, index) => (
                  <ItemRow
                    key={field.key}
                    id={field.id}
                    index={index}
                    register={register}
                    control={control}
                    errors={formState.errors}
                    onRemove={() => remove(index)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        {listError ? <p className="text-danger text-[13px] font-medium">{listError}</p> : null}
      </SettingsCard>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('settings.checklist.resetConfirmTitle')}
        description={t('settings.checklist.resetConfirm')}
        confirmLabel={t('settings.checklist.reset')}
        onConfirm={() => {
          setValue(
            'checklist.items',
            DEFAULT_CHECKLIST.map((i) => ({
              id: i.id,
              label: i.label,
              required: i.required,
              vvpRef: i.vvpRef ?? '',
              help: i.help ?? '',
            })),
            { shouldDirty: true, shouldValidate: true },
          );
        }}
      />
    </form>
  );
}
