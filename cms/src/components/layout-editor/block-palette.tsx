'use client';
/**
 * Palette dialog: pick a block type (grouped by category from
 * BLOCK_DEFINITIONS) to add to a row.
 */
import { Dialog } from '@/components/ui/dialog';
import { blockDefinitionsByCategory } from '@/lib/layout/blocks';
import type { LayoutBlockType } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { BlockIcon } from './block-icons';

export type BlockPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: LayoutBlockType) => void;
};

export function BlockPalette({ open, onOpenChange, onPick }: BlockPaletteProps) {
  const t = useT();
  const groups = blockDefinitionsByCategory();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('layout.palette.title')}
      description={t('layout.palette.description')}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.category} aria-labelledby={`palette-${group.category}`}>
            <h3
              id={`palette-${group.category}`}
              className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase"
            >
              {group.label}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.blocks.map((def) => {
                return (
                  <li key={def.type}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(def.type);
                        onOpenChange(false);
                      }}
                      className={cn(
                        'bg-surface border-border hover:border-primary hover:bg-primary-soft/40 flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      )}
                    >
                      <span className="bg-surface-2 text-muted flex size-8 shrink-0 items-center justify-center rounded">
                        <BlockIcon type={def.type} className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{def.label}</span>
                        <span className="text-muted block text-xs">{def.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
