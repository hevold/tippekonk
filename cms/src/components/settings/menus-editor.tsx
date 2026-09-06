'use client';
/**
 * MenusEditor — edit the primary, footer and topbar menus. Each menu is a
 * nested, sortable tree (dnd-kit within a sibling list; indent/outdent and
 * up/down buttons for keyboard users) saved as a whole with saveMenuAction.
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
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  CornerLeftUp,
  ExternalLink,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type CSSProperties } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import type { MenuItem } from '@/lib/validation/site';
import { cn } from '@/lib/utils';
import { saveMenuAction } from '@/server/menus/actions';
import { MENU_KEYS, MENU_MAX_DEPTH, type MenuKey, type SiteMenus } from '@/server/menus/schema';

import {
  MenuItemDialog,
  type MenuItemDraft,
  type MenuSectionOption,
  type MenuTagOption,
} from './menu-item-dialog';
import {
  allIds,
  appendItem,
  findPath,
  indentItem,
  moveByOffset,
  moveSibling,
  newMenuItemId,
  outdentItem,
  removeItem,
  siblingsAt,
  subtreeDepth,
  updateItem,
} from './menu-tree';
import { useUnsavedChangesGuard } from './settings-form';

type DialogState = { parentId: string | null; item: MenuItem | null } | null;

type RowProps = {
  item: MenuItem;
  items: MenuItem[];
  depth: number;
  onEdit: (item: MenuItem) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (item: MenuItem) => void;
  onChange: (next: MenuItem[]) => void;
};

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');
}

function MenuRow({ item, items, depth, onEdit, onAddChild, onDelete, onChange }: RowProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const path = findPath(items, item.id) ?? [];
  const siblings = siblingsAt(items, path);
  const index = path[path.length - 1] ?? 0;
  const canIndent = index > 0 && depth + subtreeDepth(item) <= MENU_MAX_DEPTH;
  const canOutdent = depth > 1;
  const canAddChild = depth < MENU_MAX_DEPTH;
  const childCount = item.children?.length ?? 0;

  return (
    <li ref={setNodeRef} style={style} className={cn('grid gap-2', isDragging && 'z-10 opacity-90')}>
      <div
        className={cn(
          'border-border bg-surface flex items-center gap-2 rounded-md border px-2 py-1.5 shadow-xs',
          isDragging && 'shadow-lg',
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="text-muted hover:text-text focus-visible:outline-ring flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded focus-visible:outline-2 active:cursor-grabbing"
          aria-label={t('settings.menus.dragHandle', { label: item.label })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-text truncate text-sm font-medium">{item.label}</span>
          <span className="text-muted truncate font-mono text-[12px]">{item.href}</span>
          {isExternal(item.href) ? (
            <Badge variant="muted">
              <ExternalLink aria-hidden /> {t('settings.menus.external')}
            </Badge>
          ) : null}
          {item.target === '_blank' ? <Badge variant="outline">{t('settings.menus.newTab')}</Badge> : null}
          {childCount > 0 ? (
            <Badge variant="muted">{t('settings.menus.children', { count: childCount })}</Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            size="sm"
            label={t('settings.menus.moveUp')}
            disabled={index === 0}
            onClick={() => onChange(moveByOffset(items, item.id, -1))}
          >
            <ArrowUp />
          </IconButton>
          <IconButton
            size="sm"
            label={t('settings.menus.moveDown')}
            disabled={index >= siblings.length - 1}
            onClick={() => onChange(moveByOffset(items, item.id, 1))}
          >
            <ArrowDown />
          </IconButton>
          <IconButton
            size="sm"
            label={t('settings.menus.indent')}
            disabled={!canIndent}
            onClick={() => onChange(indentItem(items, item.id, MENU_MAX_DEPTH))}
          >
            <CornerDownRight />
          </IconButton>
          <IconButton
            size="sm"
            label={t('settings.menus.outdent')}
            disabled={!canOutdent}
            onClick={() => onChange(outdentItem(items, item.id))}
          >
            <CornerLeftUp />
          </IconButton>
          <IconButton
            size="sm"
            label={t('settings.menus.addChild')}
            disabled={!canAddChild}
            onClick={() => onAddChild(item.id)}
          >
            <Plus />
          </IconButton>
          <IconButton size="sm" label={t('settings.menus.editItem')} onClick={() => onEdit(item)}>
            <Pencil />
          </IconButton>
          <IconButton size="sm" label={t('settings.menus.deleteItem')} onClick={() => onDelete(item)}>
            <Trash2 />
          </IconButton>
        </div>
      </div>
      {item.children && item.children.length > 0 ? (
        <MenuList
          items={items}
          list={item.children}
          depth={depth + 1}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onChange={onChange}
        />
      ) : null}
    </li>
  );
}

function MenuList({ items, list, depth, ...rest }: Omit<RowProps, 'item'> & { list: MenuItem[] }) {
  return (
    <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
      <ol className={cn('grid gap-2', depth > 1 && 'border-border ml-6 border-l pl-3')}>
        {list.map((item) => (
          <MenuRow key={item.id} item={item} items={items} depth={depth} {...rest} />
        ))}
      </ol>
    </SortableContext>
  );
}

function SingleMenuEditor({
  menuKey,
  initial,
  sections,
  tags,
  onDirtyChange,
}: {
  menuKey: MenuKey;
  initial: MenuItem[];
  sections: MenuSectionOption[];
  tags: MenuTagOption[];
  onDirtyChange: (key: MenuKey, dirty: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [saved, setSaved] = useState<MenuItem[]>(initial);
  const [items, setItems] = useState<MenuItem[]>(initial);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  const change = useCallback(
    (next: MenuItem[]) => {
      setItems(next);
      onDirtyChange(menuKey, JSON.stringify(next) !== JSON.stringify(saved));
    },
    [menuKey, onDirtyChange, saved],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    change(moveSibling(items, String(active.id), String(over.id)));
  }

  function submitDialog(draft: MenuItemDraft) {
    if (!dialog) return;
    if (dialog.item) {
      const patch: Partial<MenuItem> = { label: draft.label, href: draft.href, target: draft.target };
      change(updateItem(items, dialog.item.id, patch).map(stripUndefinedTarget));
    } else {
      const id = newMenuItemId(draft.label, allIds(items));
      change(
        appendItem(items, dialog.parentId, {
          id,
          label: draft.label,
          href: draft.href,
          ...(draft.target ? { target: draft.target } : {}),
        }),
      );
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await saveMenuAction({ key: menuKey, items });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(result.data.items);
      setItems(result.data.items);
      onDirtyChange(menuKey, false);
      toast.success(t('settings.menus.savedToast', { menu: t(`settings.menus.${menuKey}`) }));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>{t(`settings.menus.${menuKey}`)}</CardTitle>
          <CardDescription>{t(`settings.menus.${menuKey}Help`)}</CardDescription>
        </div>
        <Button size="sm" leftIcon={<Plus />} onClick={() => setDialog({ parentId: null, item: null })}>
          {t('settings.menus.addItem')}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.length === 0 ? (
          <EmptyState compact title={t('settings.menus.empty')} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <MenuList
              items={items}
              list={items}
              depth={1}
              onEdit={(item) => setDialog({ parentId: null, item })}
              onAddChild={(parentId) => setDialog({ parentId, item: null })}
              onDelete={setDeleting}
              onChange={change}
            />
          </DndContext>
        )}
        <p className="text-muted text-[12px]">{t('settings.menus.maxDepth', { depth: MENU_MAX_DEPTH })}</p>
        <div className="border-border flex items-center justify-end gap-2 border-t pt-4">
          {dirty ? <Badge variant="warning">{t('settings.form.unsaved')}</Badge> : null}
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setItems(saved);
              onDirtyChange(menuKey, false);
            }}
          >
            {t('settings.form.discard')}
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!dirty && !saving}>
            {t('settings.form.save')}
          </Button>
        </div>
      </CardContent>

      <MenuItemDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        item={dialog?.item ?? null}
        sections={sections}
        tags={tags}
        onSubmit={submitDialog}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('settings.menus.deleteItem')}
        description={deleting ? t('settings.menus.deleteItemConfirm', { label: deleting.label }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (deleting) change(removeItem(items, deleting.id));
          setDeleting(null);
        }}
      />
    </Card>
  );
}

function stripUndefinedTarget(item: MenuItem): MenuItem {
  const next: MenuItem = { id: item.id, label: item.label, href: item.href };
  if (item.target === '_blank') next.target = '_blank';
  if (item.children) next.children = item.children.map(stripUndefinedTarget);
  return next;
}

export function MenusEditor({
  menus,
  sections,
  tags,
}: {
  menus: SiteMenus;
  sections: MenuSectionOption[];
  tags: MenuTagOption[];
}) {
  const t = useT();
  const [dirtyKeys, setDirtyKeys] = useState<Set<MenuKey>>(new Set());
  useUnsavedChangesGuard(dirtyKeys.size > 0);
  const onDirtyChange = useCallback((key: MenuKey, dirty: boolean) => {
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return (
    <Tabs defaultValue="primary">
      <TabsList aria-label={t('settings.menus.title')}>
        {MENU_KEYS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {t(`settings.menus.${key}`)}
            {dirtyKeys.has(key) ? (
              <span
                className="bg-warning size-1.5 rounded-full"
                aria-label={t('settings.menus.unsaved', { menu: t(`settings.menus.${key}`) })}
              />
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {MENU_KEYS.map((key) => (
        <TabsContent
          key={key}
          value={key}
          forceMount
          hidden={undefined}
          className="data-[state=inactive]:hidden"
        >
          <SingleMenuEditor
            menuKey={key}
            initial={menus[key]}
            sections={sections}
            tags={tags}
            onDirtyChange={onDirtyChange}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
