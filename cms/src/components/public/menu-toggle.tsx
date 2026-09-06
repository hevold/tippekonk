'use client';
/**
 * Mobile menu toggle for the masthead. The menu markup is rendered on the
 * server and passed as children; this component only manages open/closed
 * state, the `aria-expanded` attribute, Escape to close and click-outside.
 * Without JavaScript the menu stays reachable through the footer links.
 */
import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';

export function MenuToggle({ children }: { children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const panelId = `mobile-menu-${id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t('public.menu.close') : t('public.menu.open')}
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-surface text-text hover:bg-surface-2 inline-flex size-10 items-center justify-center rounded-[var(--site-radius)] border"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        <span className="sr-only">{t('public.menu')}</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="border-border bg-surface absolute inset-x-0 top-full z-40 border-b shadow-lg"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
