'use client';
/**
 * ChecklistCard ("Sjekkliste") — the Vær Varsom checklist from site
 * settings. Required items block publishing; ticks are stored in
 * articles.flags as `checklist:<id>` via toggleChecklistItemAction and
 * mirrored into the form so the next save carries the same value.
 */
import { Checkbox } from '@/components/ui/checkbox';
import { useT } from '@/lib/i18n/client';
import type { EditorChecklistItem } from '@/server/articles/queries';

export type ChecklistCardProps = {
  items: EditorChecklistItem[];
  enabled: boolean;
  flags: Record<string, boolean>;
  disabled: boolean;
  onToggle: (itemId: string, checked: boolean) => void;
};

export function ChecklistCard({ items, enabled, flags, disabled, onToggle }: ChecklistCardProps) {
  const t = useT();
  if (!enabled) return <p className="text-muted text-sm">{t('articles.checklist.disabled')}</p>;
  if (items.length === 0) return <p className="text-muted text-sm">{t('articles.checklist.empty')}</p>;
  const done = items.filter((i) => flags[`checklist:${i.id}`]).length;
  return (
    <div className="grid gap-3">
      <p className="text-muted text-xs">{t('articles.checklist.progress', { done, total: items.length })}</p>
      <ul className="grid gap-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <Checkbox
              id={`checklist-${item.id}`}
              checked={Boolean(flags[`checklist:${item.id}`])}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(item.id, checked === true)}
              label={
                <span>
                  {item.label}
                  {item.required ? (
                    <span className="text-danger ml-1" aria-label={t('common.required')}>
                      *
                    </span>
                  ) : null}
                  {item.vvpRef ? <span className="text-muted ml-1.5 text-xs font-normal">VVP {item.vvpRef}</span> : null}
                </span>
              }
              description={item.help}
            />
          </li>
        ))}
      </ul>
      <p className="text-muted text-xs">{t('articles.checklist.requiredHelp')}</p>
    </div>
  );
}
