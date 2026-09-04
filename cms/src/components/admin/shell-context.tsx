'use client';
/**
 * Shared UI state for the admin shell: which overlays are open (command
 * palette, shortcuts dialog, mobile navigation) and whether the sidebar is
 * collapsed. Any client component under <AdminShell> can call useShell().
 */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import { readSidebarCollapsed, writeSidebarCollapsed } from './nav-helpers';

export type ShellState = {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

const noop = () => {};

export const ShellContext = createContext<ShellState>({
  paletteOpen: false,
  setPaletteOpen: noop,
  shortcutsOpen: false,
  setShortcutsOpen: noop,
  mobileNavOpen: false,
  setMobileNavOpen: noop,
  collapsed: false,
  setCollapsed: noop,
});

export function useShell(): ShellState {
  return useContext(ShellContext);
}

const SIDEBAR_EVENT = 'desken:sidebar';

function subscribeSidebar(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SIDEBAR_EVENT, callback);
  };
}

/** In-memory mirror so toggling works even when localStorage is blocked. */
let memoryCollapsed: boolean | null = null;

function readSidebar(): boolean {
  return memoryCollapsed ?? readSidebarCollapsed(window.localStorage);
}

/**
 * Persisted sidebar state backed by localStorage. Hydration-safe: the server
 * snapshot is "expanded"; the client value applies right after hydration and
 * stays in sync across tabs via the storage event.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memoryCollapsed = next;
    writeSidebarCollapsed(window.localStorage, next);
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }, []);
  return [collapsed, setCollapsed];
}
