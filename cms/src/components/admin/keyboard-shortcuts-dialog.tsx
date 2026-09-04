'use client';
/**
 * KeyboardShortcutsDialog — the "?" overlay listing the admin's keyboard
 * shortcuts. Opened by the shell on "?" (outside inputs) and from the user menu.
 */
import { Dialog } from '@/components/ui/dialog';
import { Kbd, useModKeyLabel } from '@/components/ui/kbd';
import { useT } from '@/lib/i18n/client';

export type KeyboardShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Shortcut = { keys: string[]; labelKey: string };
type Group = { titleKey: string; shortcuts: Shortcut[] };

const GROUPS: Group[] = [
  {
    titleKey: 'shell.shortcutGroup.general',
    shortcuts: [
      { keys: ['Mod', 'K'], labelKey: 'shell.shortcut.palette' },
      { keys: ['?'], labelKey: 'shell.shortcut.help' },
      { keys: ['Esc'], labelKey: 'shell.shortcut.close' },
      { keys: ['['], labelKey: 'shell.shortcut.sidebar' },
    ],
  },
  {
    titleKey: 'shell.shortcutGroup.editor',
    shortcuts: [
      { keys: ['Mod', 'S'], labelKey: 'shell.shortcut.save' },
      { keys: ['Mod', 'B'], labelKey: 'shell.shortcut.bold' },
      { keys: ['Mod', 'I'], labelKey: 'shell.shortcut.italic' },
      { keys: ['Mod', 'Z'], labelKey: 'shell.shortcut.undo' },
      { keys: ['/'], labelKey: 'shell.shortcut.slash' },
    ],
  },
  {
    titleKey: 'shell.shortcutGroup.lists',
    shortcuts: [
      { keys: ['J'], labelKey: 'shell.shortcut.next' },
      { keys: ['K'], labelKey: 'shell.shortcut.previous' },
      { keys: ['↵'], labelKey: 'shell.shortcut.open' },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const t = useT();
  const mod = useModKeyLabel();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('shell.shortcuts')}
      description={t('shell.shortcutsDescription')}
      size="md"
    >
      <div className="grid gap-5 pb-3 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.titleKey} aria-labelledby={`shortcuts-${group.titleKey}`}>
            <h3
              id={`shortcuts-${group.titleKey}`}
              className="text-subtle mb-2 text-[11px] font-semibold tracking-wide uppercase"
            >
              {t(group.titleKey)}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.shortcuts.map((s) => (
                <div key={s.labelKey} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-text">{t(s.labelKey)}</dt>
                  <dd className="flex items-center gap-1">
                    {s.keys.map((k, i) => (
                      <Kbd key={i}>{k === 'Mod' ? mod : k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
