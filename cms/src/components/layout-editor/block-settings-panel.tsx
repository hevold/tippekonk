'use client';
/**
 * Settings for the selected block: the fields BLOCK_DEFINITIONS exposes for
 * its type (title, section/tag/content type, limit, toggles, variant, days,
 * slot id, link, rich text) plus span and the pinned-article list.
 */
import { Copy, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ArticleEditor } from '@/components/editor/article-editor';
import { MediaPicker } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { Media } from '@/db/schema';
import { sanitizeDoc } from '@/lib/content/schema';
import type { ContentDoc } from '@/lib/content/types';
import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import { DEFAULT_LIMITS, MAX_BLOCK_LIMIT } from '@/lib/layout/engine';
import type { LayoutBlock, LayoutBlockSettings, LayoutItemOverrides, LayoutRow } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import type { LayoutArticleInfo } from '@/server/layouts/actions';

import { BlockIcon } from './block-icons';
import { PinnedItems } from './pinned-items';
import type { LayoutEditorOptions } from './types';

export type BlockSettingsPanelProps = {
  block: LayoutBlock;
  row: LayoutRow;
  options: LayoutEditorOptions;
  articleInfo: Record<string, LayoutArticleInfo>;
  disabled?: boolean;
  onSettingsChange: (
    patch: Partial<Record<keyof LayoutBlockSettings, unknown>>,
    coalesceKey?: string,
  ) => void;
  onSpanChange: (span: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUnpin: (articleId: string) => void;
  onMovePinned: (articleId: string, toIndex: number) => void;
  onOverridesChange: (articleId: string, overrides: LayoutItemOverrides) => void;
  onOpenSearch: () => void;
};

const VARIANTS = ['default', 'muted', 'accent', 'dark'] as const;

const TOGGLES: { key: keyof LayoutBlockSettings; labelKey: string; defaultValue: boolean }[] = [
  { key: 'showImages', labelKey: 'layout.settings.showImages', defaultValue: true },
  { key: 'showLead', labelKey: 'layout.settings.showLead', defaultValue: false },
  { key: 'showKicker', labelKey: 'layout.settings.showKicker', defaultValue: true },
  { key: 'showBylines', labelKey: 'layout.settings.showBylines', defaultValue: false },
  { key: 'dedupe', labelKey: 'layout.settings.dedupe', defaultValue: true },
  { key: 'manualOnly', labelKey: 'layout.settings.manualOnly', defaultValue: false },
];

export function BlockSettingsPanel({
  block,
  row,
  options,
  articleInfo,
  disabled,
  onSettingsChange,
  onSpanChange,
  onDuplicate,
  onRemove,
  onUnpin,
  onMovePinned,
  onOverridesChange,
  onOpenSearch,
}: BlockSettingsPanelProps) {
  const t = useT();
  const def = BLOCK_DEFINITIONS[block.type];
  const fields = new Set(def.settingFields);
  const s = block.settings;
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaResolve, setMediaResolve] = useState<((m: Media | null) => void) | null>(null);

  const pickMedia = useCallback(
    () =>
      new Promise<Media | null>((resolve) => {
        setMediaResolve(() => resolve);
        setMediaOpen(true);
      }),
    [],
  );

  const textDoc = useMemo<ContentDoc>(() => sanitizeDoc(s.text), [s.text]);
  const sectionList = options.sections;
  const sectionOptions = useMemo(() => {
    const byParent = new Map<string | null, typeof sectionList>();
    for (const sec of sectionList) {
      const list = byParent.get(sec.parentId) ?? [];
      list.push(sec);
      byParent.set(sec.parentId, list);
    }
    const out: { value: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const sec of byParent.get(parentId) ?? []) {
        out.push({ value: sec.id, label: `${'— '.repeat(depth)}${sec.name}` });
        walk(sec.id, depth + 1);
      }
    };
    walk(null, 0);
    // Sections whose parent is inactive/missing still need to be selectable.
    for (const sec of sectionList)
      if (!out.some((o) => o.value === sec.id)) out.push({ value: sec.id, label: sec.name });
    return out;
  }, [sectionList]);

  const pinnedIdsInBlock = (block.items ?? []).map((i) => i.articleId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="bg-surface-2 text-muted flex size-9 shrink-0 items-center justify-center rounded">
          <BlockIcon type={block.type} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{def.label}</h2>
          <p className="text-muted text-xs">{def.description}</p>
        </div>
      </div>

      {fields.has('title') ? (
        <FormField
          label={t('layout.settings.title')}
          help={block.type === 'heading' ? t('layout.settings.titleHeadingHelp') : undefined}
        >
          <Input
            value={s.title ?? ''}
            disabled={disabled}
            maxLength={200}
            onChange={(e) => onSettingsChange({ title: e.target.value }, `title:${block.id}`)}
          />
        </FormField>
      ) : null}

      {fields.has('sectionId') ? (
        <FormField
          label={t('layout.settings.section')}
          help={block.type === 'section-feed' ? t('layout.settings.sectionRequired') : undefined}
        >
          <NativeSelect
            value={s.sectionId ?? ''}
            disabled={disabled}
            placeholder={
              block.type === 'section-feed'
                ? t('layout.settings.pickSection')
                : t('layout.settings.allSections')
            }
            options={sectionOptions}
            onChange={(e) => onSettingsChange({ sectionId: e.target.value })}
          />
        </FormField>
      ) : null}

      {fields.has('tagId') ? (
        <FormField
          label={t('layout.settings.tag')}
          help={block.type === 'tag-feed' ? t('layout.settings.tagRequired') : undefined}
        >
          <NativeSelect
            value={s.tagId ?? ''}
            disabled={disabled}
            placeholder={t('layout.settings.pickTag')}
            options={options.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            onChange={(e) => onSettingsChange({ tagId: e.target.value })}
          />
        </FormField>
      ) : null}

      {fields.has('contentTypeKey') ? (
        <FormField label={t('layout.settings.contentType')}>
          <NativeSelect
            value={s.contentTypeKey ?? ''}
            disabled={disabled}
            placeholder={t('layout.settings.anyContentType')}
            options={options.contentTypes.map((ct) => ({ value: ct.key, label: ct.name }))}
            onChange={(e) => onSettingsChange({ contentTypeKey: e.target.value })}
          />
        </FormField>
      ) : null}

      {fields.has('access') ? (
        <FormField label={t('layout.settings.access')} help={t('layout.settings.accessHelp')}>
          <NativeSelect
            value={s.access ?? 'open'}
            disabled={disabled}
            options={[
              { value: 'open', label: t('layout.settings.access.open') },
              { value: 'plus', label: t('layout.settings.access.plus') },
            ]}
            onChange={(e) => onSettingsChange({ access: e.target.value })}
          />
        </FormField>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {fields.has('limit') ? (
          <FormField
            label={t('layout.settings.limit')}
            help={t('layout.settings.limitHelp', { n: DEFAULT_LIMITS[block.type] })}
          >
            <Input
              type="number"
              min={0}
              max={MAX_BLOCK_LIMIT}
              inputMode="numeric"
              value={s.limit ?? ''}
              placeholder={String(DEFAULT_LIMITS[block.type])}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                onSettingsChange(
                  { limit: v === '' ? undefined : Math.max(0, Math.min(MAX_BLOCK_LIMIT, Number(v))) },
                  `limit:${block.id}`,
                );
              }}
            />
          </FormField>
        ) : null}
        {fields.has('days') ? (
          <FormField label={t('layout.settings.days')}>
            <Input
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              value={s.days ?? ''}
              placeholder="7"
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                onSettingsChange(
                  { days: v === '' ? undefined : Math.max(1, Math.min(365, Number(v))) },
                  `days:${block.id}`,
                );
              }}
            />
          </FormField>
        ) : null}
        {row.columns > 1 ? (
          <FormField label={t('layout.editor.spanFull')}>
            <NativeSelect
              value={String(Math.min(block.span ?? 1, row.columns))}
              disabled={disabled}
              options={Array.from({ length: row.columns }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
              onChange={(e) => onSpanChange(Number(e.target.value))}
            />
          </FormField>
        ) : null}
        {fields.has('variant') ? (
          <FormField label={t('layout.settings.variant')}>
            <NativeSelect
              value={s.variant ?? 'default'}
              disabled={disabled}
              options={VARIANTS.map((v) => ({ value: v, label: t(`layout.settings.variant.${v}`) }))}
              onChange={(e) =>
                onSettingsChange({ variant: e.target.value === 'default' ? undefined : e.target.value })
              }
            />
          </FormField>
        ) : null}
      </div>

      {TOGGLES.some((tg) => fields.has(tg.key)) ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
            {t('layout.settings.display')}
          </legend>
          {TOGGLES.filter((tg) => fields.has(tg.key)).map((tg) => {
            const current = s[tg.key];
            const checked = typeof current === 'boolean' ? current : tg.defaultValue;
            return (
              <Switch
                key={tg.key}
                size="sm"
                label={t(tg.labelKey)}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => onSettingsChange({ [tg.key]: v })}
              />
            );
          })}
        </fieldset>
      ) : null}

      {fields.has('slotId') ? (
        <FormField label={t('layout.settings.slotId')} help={t('layout.settings.slotIdHelp')}>
          <Input
            value={s.slotId ?? ''}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => onSettingsChange({ slotId: e.target.value }, `slot:${block.id}`)}
          />
        </FormField>
      ) : null}

      {fields.has('href') ? (
        <FormField label={t('layout.settings.href')} help={t('layout.settings.hrefHelp')}>
          <Input
            value={s.href ?? ''}
            disabled={disabled}
            maxLength={1000}
            placeholder="/nyhetsbrev"
            onChange={(e) => onSettingsChange({ href: e.target.value }, `href:${block.id}`)}
          />
        </FormField>
      ) : null}

      {fields.has('text') ? (
        <FormField label={t('layout.settings.text')}>
          <div className="bg-surface border-border rounded-md border">
            <ArticleEditor
              key={block.id}
              value={textDoc}
              compact
              readOnly={disabled}
              placeholder={t('layout.settings.textPlaceholder')}
              label={t('layout.settings.text')}
              onMediaPick={pickMedia}
              onChange={(doc) => onSettingsChange({ text: doc }, `text:${block.id}`)}
            />
          </div>
        </FormField>
      ) : null}

      {def.supportsItems ? (
        <PinnedItems
          block={block}
          articleInfo={articleInfo}
          disabled={disabled}
          onUnpin={onUnpin}
          onMove={onMovePinned}
          onOverridesChange={onOverridesChange}
          onOpenSearch={onOpenSearch}
          pinnedIds={pinnedIdsInBlock}
        />
      ) : null}

      <div className="border-border flex items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" leftIcon={<Copy />} disabled={disabled} onClick={onDuplicate}>
          {t('layout.editor.duplicateBlock')}
        </Button>
        <Button variant="danger" size="sm" leftIcon={<Trash2 />} disabled={disabled} onClick={onRemove}>
          {t('layout.editor.removeBlock')}
        </Button>
      </div>

      <MediaPicker
        open={mediaOpen}
        onOpenChange={(open) => {
          setMediaOpen(open);
          if (!open && mediaResolve) {
            mediaResolve(null);
            setMediaResolve(null);
          }
        }}
        kind="image"
        onSelect={(m) => {
          mediaResolve?.(m);
          setMediaResolve(null);
          setMediaOpen(false);
        }}
      />
    </div>
  );
}
