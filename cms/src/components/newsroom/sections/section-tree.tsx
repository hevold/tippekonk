'use client';
/**
 * SectionTree — the sections admin: an indented tree (parents, then their
 * children) with colour, slug, article counts and flags. Siblings can be
 * moved up/down (keyboard-friendly, no drag needed); rows open the edit
 * dialog, can get a child section, or be deleted (with a reassign step when
 * articles exist). The server page re-renders after every action.
 */
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  EyeOff,
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { formatNumber } from '@/components/ui/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { reorderSectionsAction } from '@/server/taxonomy/actions';

import { SectionDeleteDialog } from './section-delete-dialog';
import { SectionDialog } from './section-dialog';
import { orderedWithDepth, type SectionDto } from './types';

export type SectionTreeProps = {
  sections: SectionDto[];
  /** Origin of the public site for "open" links; empty means same origin as the admin. */
  siteUrl?: string;
};

type DialogState =
  | { kind: 'create'; parentId: string | null }
  | { kind: 'edit'; section: SectionDto }
  | { kind: 'delete'; section: SectionDto }
  | null;

export function SectionTree({ sections, siteUrl = '' }: SectionTreeProps) {
  const t = useT();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const rows = useMemo(() => orderedWithDepth(sections), [sections]);

  async function move(row: (typeof rows)[number], direction: -1 | 1) {
    const index = row.siblings.indexOf(row.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= row.siblings.length) return;
    const ids = [...row.siblings];
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setMovingId(row.id);
    const result = await reorderSectionsAction({ ids });
    setMovingId(null);
    if (!result.ok) toast.error(result.error);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end">
        <Button onClick={() => setDialog({ kind: 'create', parentId: null })} leftIcon={<Plus />}>
          {t('taxonomy.sections.new')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border">
          <EmptyState
            icon={<FolderTree />}
            title={t('taxonomy.sections.empty.title')}
            description={t('taxonomy.sections.empty.description')}
            action={
              <Button
                size="sm"
                onClick={() => setDialog({ kind: 'create', parentId: null })}
                leftIcon={<Plus />}
              >
                {t('taxonomy.sections.new')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">{t('taxonomy.sections.caption')}</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">
                  <span className="sr-only">{t('taxonomy.sections.order')}</span>
                </TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('taxonomy.field.slug')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('common.description')}</TableHead>
                <TableHead className="w-28 text-right">{t('taxonomy.articles')}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const index = row.siblings.indexOf(row.id);
                const isFirst = index <= 0;
                const isLast = index >= row.siblings.length - 1;
                const busy = movingId === row.id;
                return (
                  <TableRow key={row.id} className={cn(!row.isActive && 'opacity-70')}>
                    <TableCell className="pr-0">
                      <span className="inline-flex items-center gap-0.5">
                        <IconButton
                          label={t('taxonomy.moveUp', { name: row.name })}
                          size="sm"
                          variant="ghost"
                          disabled={isFirst || busy}
                          onClick={() => void move(row, -1)}
                        >
                          <ArrowUp />
                        </IconButton>
                        <IconButton
                          label={t('taxonomy.moveDown', { name: row.name })}
                          size="sm"
                          variant="ghost"
                          disabled={isLast || busy}
                          onClick={() => void move(row, 1)}
                        >
                          <ArrowDown />
                        </IconButton>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex min-w-0 items-center gap-2"
                        style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                      >
                        {row.depth > 0 ? (
                          <CornerDownRight className="text-subtle size-3.5 shrink-0" aria-hidden />
                        ) : null}
                        <span
                          className="border-border inline-block size-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: row.color ?? 'transparent' }}
                          aria-hidden
                        />
                        <button
                          type="button"
                          className="focus-visible:outline-ring truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                          onClick={() => setDialog({ kind: 'edit', section: row })}
                        >
                          {row.name}
                        </button>
                        {!row.isActive ? <Badge variant="muted">{t('taxonomy.inactive')}</Badge> : null}
                        {!row.showInMenu ? (
                          <Badge variant="outline" className="gap-1">
                            <EyeOff className="size-3" aria-hidden />
                            {t('taxonomy.sections.hiddenFromMenu')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted hidden font-mono text-xs md:table-cell">
                      <a
                        href={`${siteUrl}${publicPaths.section(row.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-visible:outline-ring rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        title={t('taxonomy.sections.openPublic')}
                      >
                        /{row.slug}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted hidden max-w-[24rem] truncate lg:table-cell">
                      {row.description ?? <span className="text-subtle">–</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        title={t('taxonomy.sections.countTitle', {
                          published: row.publishedCount,
                          total: row.articleCount,
                        })}
                      >
                        {formatNumber(row.articleCount)}
                        {row.publishedCount !== row.articleCount ? (
                          <span className="text-subtle text-xs"> ({formatNumber(row.publishedCount)})</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton label={t('taxonomy.actionsFor', { name: row.name })} size="sm">
                            <MoreHorizontal />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            icon={<Pencil />}
                            onSelect={() => setDialog({ kind: 'edit', section: row })}
                          >
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            icon={<Plus />}
                            onSelect={() => setDialog({ kind: 'create', parentId: row.id })}
                          >
                            {t('taxonomy.sections.addChild')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            icon={<Trash2 />}
                            destructive
                            onSelect={() => setDialog({ kind: 'delete', section: row })}
                          >
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog?.kind === 'create' ? (
        <SectionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          parentId={dialog.parentId}
          all={sections}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <SectionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          section={dialog.section}
          all={sections}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <SectionDeleteDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          section={dialog.section}
          all={sections}
        />
      ) : null}
    </div>
  );
}
