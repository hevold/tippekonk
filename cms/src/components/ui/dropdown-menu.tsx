'use client';
/**
 * DropdownMenu — Radix DropdownMenu with the Desken look.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><Button variant="ghost">Mer</Button></DropdownMenuTrigger>
 *     <DropdownMenuContent align="end">
 *       <DropdownMenuItem icon={<Pencil />} onSelect={edit}>Rediger</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem destructive icon={<Trash />} onSelect={remove}>Slett</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */
import { Check, ChevronRight, Circle } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const menuContentClass = cn(
  'bg-surface border-border text-text z-50 min-w-[10rem] overflow-hidden rounded-md border p-1 shadow-md',
  'animate-slide-down data-[state=closed]:animate-fade-out',
);

export const menuItemClass = cn(
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
  'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:text-muted [&_svg]:size-4 [&_svg]:shrink-0',
);

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(menuContentClass, 'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  destructive?: boolean;
  icon?: ReactNode;
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  shortcut?: ReactNode;
  inset?: boolean;
};

export function DropdownMenuItem({
  className,
  destructive,
  icon,
  shortcut,
  inset,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        menuItemClass,
        inset && 'pl-8',
        destructive && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="text-subtle ml-auto pl-4 text-xs tracking-wide">{shortcut}</span> : null}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn(menuItemClass, 'pl-8', className)} checked={checked} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(menuItemClass, 'pl-8', className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="fill-primary text-primary size-2" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('text-muted px-2 py-1.5 text-xs font-medium tracking-wide', inset && 'pl-8', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(menuItemClass, 'data-[state=open]:bg-surface-2', inset && 'pl-8', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(menuContentClass, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}
