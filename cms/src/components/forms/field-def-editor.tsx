'use client';
/**
 * FieldDefEditor — edits a content type's custom field definitions
 * (FieldDef[] from src/lib/validation/site.ts): add, remove and reorder
 * fields (dnd-kit sortable, with keyboard support and up/down buttons), and
 * per field: label, key (generated from the label until edited), type,
 * required, help text, placeholder, options for select/multiselect, min/max
 * for numeric and text types, and "show in list".
 *
 *   <FieldDefEditor value={fields} onChange={setFields} errors={fieldErrors} />
 *
 * `errors` is keyed like Zod paths relative to the array: "0.key",
 * "2.options". The host validates with contentTypeInputSchema on submit.
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
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { cn } from '@/lib/utils';
import { fieldTypeSchema, type FieldDef, type FieldType } from '@/lib/validation/site';

export const FIELD_TYPES: FieldType[] = fieldTypeSchema.options;

/** Types whose min/max mean a numeric range. */
const NUMERIC_TYPES: FieldType[] = ['number'];
/** Types whose min/max mean a character-length range. */
const LENGTH_TYPES: FieldType[] = ['text', 'textarea', 'url', 'email'];
/** Types whose min/max mean a number of picked items. */
const COUNT_TYPES: FieldType[] = ['multiselect'];
const OPTION_TYPES: FieldType[] = ['select', 'multiselect'];

/** "Startdato (ny)" → "startdato_ny": lower-case, ascii, underscores, must start with a letter. */
export function fieldKeyFromLabel(label: string): string {
  let key = slugify(label, { maxLength: 64 }).replace(/-/g, '_');
  if (key && !/^[a-z]/.test(key)) key = `f_${key}`.slice(0, 64);
  return key;
}

export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(key);
}

/** Local row state: the FieldDef plus a stable drag id and whether the key was hand-edited. */
type Row = { uid: string; def: FieldDef; keyTouched: boolean };

let counter = 0;
function nextUid(): string {
  counter += 1;
  return `field-${Date.now().toString(36)}-${counter}`;
}

function toRows(fields: FieldDef[]): Row[] {
  return fields.map((def) => ({ uid: nextUid(), def, keyTouched: true }));
}

function emptyField(): FieldDef {
  return { key: '', label: '', type: 'text', required: false, showInList: false };
}

export type FieldDefEditorProps = {
  value: FieldDef[];
  onChange: (fields: FieldDef[]) => void;
  errors?: Record<string, string[]>;
  disabled?: boolean;
};

export function FieldDefEditor({ value, onChange, errors = {}, disabled = false }: FieldDefEditorProps) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const [openUid, setOpenUid] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const uids = useMemo(() => rows.map((r) => r.uid), [rows]);

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map((r) => r.def));
  }

  function update(uid: string, patch: Partial<FieldDef>, keyTouched?: boolean) {
    commit(
      rows.map((r) => {
        if (r.uid !== uid) return r;
        const def = { ...r.def, ...patch };
        const touched = keyTouched ?? r.keyTouched;
        if (!touched && 'label' in patch) def.key = fieldKeyFromLabel(def.label);
        return { uid: r.uid, def, keyTouched: touched };
      }),
    );
  }

  function add() {
    const row: Row = { uid: nextUid(), def: emptyField(), keyTouched: false };
    commit([...rows, row]);
    setOpenUid(row.uid);
  }

  function remove(uid: string) {
    commit(rows.filter((r) => r.uid !== uid));
    if (openUid === uid) setOpenUid(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length) return;
    commit(arrayMove(rows, from, to));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = uids.indexOf(String(active.id));
    const to = uids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) move(from, to);
  }

  const errorFor = (index: number, field: string) => errors[`${index}.${field}`]?.[0];

  return (
    <div className="grid gap-3">
      {rows.length === 0 ? (
        <div className="border-border rounded-md border border-dashed">
          <EmptyState
            compact
            title={t('contentTypes.fields.empty.title')}
            description={t('contentTypes.fields.empty.description')}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={add}
                disabled={disabled}
                leftIcon={<Plus />}
              >
                {t('contentTypes.fields.add')}
              </Button>
            }
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={uids} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2" role="list" aria-label={t('contentTypes.fields.listLabel')}>
              {rows.map((row, index) => (
                <FieldRow
                  key={row.uid}
                  row={row}
                  index={index}
                  count={rows.length}
                  open={openUid === row.uid}
                  disabled={disabled}
                  onToggle={() => setOpenUid(openUid === row.uid ? null : row.uid)}
                  onChange={(patch, keyTouched) => update(row.uid, patch, keyTouched)}
                  onRemove={() => remove(row.uid)}
                  onMove={(dir) => move(index, index + dir)}
                  errorFor={(field) => errorFor(index, field)}
                  hasErrors={Object.keys(errors).some(
                    (k) => k.startsWith(`${index}.`) || k === String(index),
                  )}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {rows.length > 0 ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={add}
            disabled={disabled || rows.length >= 50}
            leftIcon={<Plus />}
          >
            {t('contentTypes.fields.add')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type FieldRowProps = {
  row: Row;
  index: number;
  count: number;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<FieldDef>, keyTouched?: boolean) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  errorFor: (field: string) => string | undefined;
  hasErrors: boolean;
};

function FieldRow({
  row,
  index,
  count,
  open,
  disabled,
  onToggle,
  onChange,
  onRemove,
  onMove,
  errorFor,
  hasErrors,
}: FieldRowProps) {
  const t = useT();
  const baseId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.uid, disabled });
  const def = row.def;
  const style = { transform: CSS.Transform.toString(transform), transition };
  const keyInvalid = def.key !== '' && !isValidFieldKey(def.key);
  const showOptions = OPTION_TYPES.includes(def.type);
  const rangeKind = NUMERIC_TYPES.includes(def.type)
    ? 'number'
    : LENGTH_TYPES.includes(def.type)
      ? 'length'
      : COUNT_TYPES.includes(def.type)
        ? 'count'
        : null;
  const panelId = `${baseId}-panel`;

  const options = def.options ?? [];
  function setOptions(next: { value: string; label: string }[]) {
    onChange({ options: next });
  }
  function numberOrUndefined(v: string): number | undefined {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-border bg-surface rounded-md border',
        isDragging && 'ring-primary/40 relative z-10 shadow-md ring-2',
        hasErrors && 'border-danger',
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            'text-subtle hover:text-text focus-visible:outline-ring inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          aria-label={t('contentTypes.fields.dragHandle', { label: def.label || def.key || index + 1 })}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="focus-visible:outline-ring flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown className="text-subtle size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="text-subtle size-4 shrink-0" aria-hidden />
          )}
          <span className={cn('truncate font-medium', !def.label && 'text-muted italic')}>
            {def.label || t('contentTypes.fields.untitled')}
          </span>
          <span className="text-subtle hidden truncate font-mono text-xs sm:inline">{def.key}</span>
          <Badge variant="muted" className="ml-auto shrink-0">
            {t(`contentTypes.fieldType.${def.type}`)}
          </Badge>
          {def.required ? <Badge variant="info">{t('contentTypes.fields.requiredBadge')}</Badge> : null}
          {hasErrors ? <Badge variant="danger">{t('contentTypes.fields.errorBadge')}</Badge> : null}
        </button>
        <IconButton
          label={t('contentTypes.fields.moveUp')}
          size="sm"
          variant="ghost"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          label={t('contentTypes.fields.moveDown')}
          size="sm"
          variant="ghost"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </IconButton>
        <IconButton
          label={t('contentTypes.fields.remove', { label: def.label || def.key || index + 1 })}
          size="sm"
          variant="ghost"
          className="text-danger"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </IconButton>
      </div>

      {open ? (
        <div id={panelId} className="border-border grid gap-4 border-t px-3 py-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('contentTypes.fields.label')}
              htmlFor={`${baseId}-label`}
              required
              error={errorFor('label')}
            >
              <Input
                id={`${baseId}-label`}
                value={def.label}
                onChange={(e) => onChange({ label: e.target.value })}
                maxLength={120}
                disabled={disabled}
                autoFocus={!def.label}
              />
            </FormField>
            <FormField
              label={t('contentTypes.fields.key')}
              htmlFor={`${baseId}-key`}
              required
              help={keyInvalid ? t('contentTypes.fields.keyInvalid') : t('contentTypes.fields.keyHelp')}
              error={errorFor('key')}
            >
              <Input
                id={`${baseId}-key`}
                value={def.key}
                invalid={keyInvalid}
                onChange={(e) =>
                  onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }, true)
                }
                onBlur={() => def.key === '' && onChange({ key: fieldKeyFromLabel(def.label) }, false)}
                maxLength={64}
                disabled={disabled}
                className="font-mono"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('contentTypes.fields.type')}
              htmlFor={`${baseId}-type`}
              error={errorFor('type')}
            >
              <NativeSelect
                id={`${baseId}-type`}
                value={def.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  onChange({
                    type,
                    options: OPTION_TYPES.includes(type) ? (def.options ?? []) : undefined,
                    min: undefined,
                    max: undefined,
                  });
                }}
                options={FIELD_TYPES.map((ft) => ({ value: ft, label: t(`contentTypes.fieldType.${ft}`) }))}
                disabled={disabled}
              />
            </FormField>
            <div className="grid gap-2 sm:pt-6">
              <Switch
                label={t('contentTypes.fields.required')}
                size="sm"
                checked={def.required}
                onCheckedChange={(v) => onChange({ required: v })}
                disabled={disabled}
              />
              <Switch
                label={t('contentTypes.fields.showInList')}
                size="sm"
                checked={def.showInList}
                onCheckedChange={(v) => onChange({ showInList: v })}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('contentTypes.fields.placeholder')}
              htmlFor={`${baseId}-placeholder`}
              error={errorFor('placeholder')}
            >
              <Input
                id={`${baseId}-placeholder`}
                value={def.placeholder ?? ''}
                onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
                maxLength={200}
                disabled={disabled}
              />
            </FormField>
            <FormField
              label={t('contentTypes.fields.help')}
              htmlFor={`${baseId}-help`}
              error={errorFor('help')}
            >
              <Textarea
                id={`${baseId}-help`}
                value={def.help ?? ''}
                onChange={(e) => onChange({ help: e.target.value || undefined })}
                rows={1}
                maxLength={500}
                disabled={disabled}
              />
            </FormField>
          </div>

          {rangeKind ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t(`contentTypes.fields.min.${rangeKind}`)}
                htmlFor={`${baseId}-min`}
                error={errorFor('min')}
              >
                <Input
                  id={`${baseId}-min`}
                  type="number"
                  value={def.min ?? ''}
                  onChange={(e) => onChange({ min: numberOrUndefined(e.target.value) })}
                  disabled={disabled}
                />
              </FormField>
              <FormField
                label={t(`contentTypes.fields.max.${rangeKind}`)}
                htmlFor={`${baseId}-max`}
                error={errorFor('max')}
              >
                <Input
                  id={`${baseId}-max`}
                  type="number"
                  value={def.max ?? ''}
                  onChange={(e) => onChange({ max: numberOrUndefined(e.target.value) })}
                  disabled={disabled}
                />
              </FormField>
            </div>
          ) : null}

          {showOptions ? (
            <fieldset className="border-border grid gap-2 rounded-md border p-3">
              <legend className="text-muted px-1 text-xs font-medium">
                {t('contentTypes.fields.options')}
              </legend>
              {errorFor('options') ? <p className="text-danger text-xs">{errorFor('options')}</p> : null}
              {options.length === 0 ? (
                <p className="text-muted text-sm">{t('contentTypes.fields.optionsEmpty')}</p>
              ) : null}
              {options.map((opt, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <FormField
                    label={t('contentTypes.fields.optionLabel')}
                    htmlFor={`${baseId}-opt-${i}-label`}
                    className="mb-0"
                  >
                    <Input
                      id={`${baseId}-opt-${i}-label`}
                      size="sm"
                      value={opt.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        const autoValue = !opt.value || opt.value === fieldKeyFromLabel(opt.label);
                        setOptions(
                          options.map((o, j) =>
                            j === i ? { label, value: autoValue ? fieldKeyFromLabel(label) : o.value } : o,
                          ),
                        );
                      }}
                      maxLength={120}
                      disabled={disabled}
                    />
                  </FormField>
                  <FormField
                    label={t('contentTypes.fields.optionValue')}
                    htmlFor={`${baseId}-opt-${i}-value`}
                    className="mb-0"
                  >
                    <Input
                      id={`${baseId}-opt-${i}-value`}
                      size="sm"
                      value={opt.value}
                      onChange={(e) =>
                        setOptions(options.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)))
                      }
                      maxLength={120}
                      disabled={disabled}
                      className="font-mono"
                    />
                  </FormField>
                  <IconButton
                    label={t('contentTypes.fields.optionRemove', { label: opt.label || i + 1 })}
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={disabled}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus />}
                  disabled={disabled}
                  onClick={() => setOptions([...options, { value: '', label: '' }])}
                >
                  {t('contentTypes.fields.optionAdd')}
                </Button>
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
