'use client';
/**
 * SidebarSection — a collapsible card for the editor's right column. The
 * header is a real button (aria-expanded) so it works with the keyboard;
 * open/closed state is remembered per section in localStorage.
 */
import { ChevronDown } from 'lucide-react';
import { useCallback, useId, useSyncExternalStore, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

const STORAGE_PREFIX = 'desken:editor:section:';
const SECTION_EVENT = 'desken:editor:section';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(SECTION_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SECTION_EVENT, callback);
  };
}

function readStored(id: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + id);
    return stored === '1' ? true : stored === '0' ? false : null;
  } catch {
    return null;
  }
}

export type SidebarSectionProps = {
  /** Stable key for remembering the collapsed state. */
  id: string;
  title: ReactNode;
  /** Small element next to the title (count, badge). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function SidebarSection({ id, title, meta, defaultOpen = true, children, className }: SidebarSectionProps) {
  const contentId = useId();
  // Hydration-safe: the server (and first client render) use the default; the stored choice applies after.
  const getSnapshot = useCallback(() => readStored(id) ?? defaultOpen, [id, defaultOpen]);
  const open = useSyncExternalStore(subscribe, getSnapshot, () => defaultOpen);

  function toggle() {
    const next = !open;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0');
    } catch {
      /* localStorage may be blocked; the event below still updates this tab */
    }
    window.dispatchEvent(new Event(SECTION_EVENT));
  }

  return (
    <section className={cn('bg-surface border-border rounded-lg border shadow-xs', className)} aria-labelledby={`${contentId}-title`}>
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className="hover:bg-surface-2 focus-visible:outline-ring flex w-full items-center gap-2 rounded-t-lg px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <span id={`${contentId}-title`} className="text-text flex-1 text-[13px] font-semibold tracking-wide uppercase">
            {title}
          </span>
          {meta ? <span className="text-muted text-xs">{meta}</span> : null}
          <ChevronDown className={cn('text-muted size-4 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
        </button>
      </h2>
      <div id={contentId} hidden={!open} className="border-border border-t px-4 py-3">
        {children}
      </div>
    </section>
  );
}
