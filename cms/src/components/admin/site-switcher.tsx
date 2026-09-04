'use client';
/**
 * SiteSwitcher — topbar dropdown for multi-site installations. Shows the
 * active site; picking another one calls the `switchSite` server action
 * (sets the `desken_site` cookie) and refreshes the router. With a single
 * site it renders a static label.
 */
import { Check, ChevronsUpDown, ExternalLink, Newspaper } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { switchSite } from './shell-actions';
import type { ShellSite } from './shell-types';

export type SiteSwitcherProps = {
  site: ShellSite;
  sites: ShellSite[];
  className?: string;
};

export function SiteSwitcher({ site, sites, className }: SiteSwitcherProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const multiple = sites.length > 1;

  function choose(target: ShellSite) {
    if (target.id === site.id) return;
    startTransition(async () => {
      const result = await switchSite(target.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t('shell.switchedSite', { site: target.name }));
      router.push('/admin');
      router.refresh();
    });
  }

  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <Newspaper className="text-muted size-4 shrink-0" aria-hidden />
      <span className="truncate text-sm font-medium">{site.name}</span>
    </span>
  );

  if (!multiple) {
    return (
      <div
        className={cn('flex h-8 min-w-0 items-center px-2', className)}
        aria-label={t('shell.currentSite', { site: site.name })}
      >
        {label}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={t('shell.switchSite')}
        className={cn(
          'hover:bg-surface-2 flex h-8 max-w-56 min-w-0 items-center gap-1.5 rounded-md px-2 transition-colors',
          'focus-visible:outline-ring data-[state=open]:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
      >
        {label}
        {pending ? (
          <Spinner size="sm" className="text-muted" />
        ) : (
          <ChevronsUpDown className="text-muted size-3.5 shrink-0" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('shell.switchSite')}</DropdownMenuLabel>
        {sites.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => choose(s)}
            icon={s.id === site.id ? <Check /> : <span className="size-4" />}
          >
            {s.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={<ExternalLink />}>
          <a href={publicPaths.front()} target="_blank" rel="noreferrer">
            {t('shell.viewSite')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
