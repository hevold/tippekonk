/**
 * AuthCard — title + description header used inside the (auth) layout card,
 * and a "the link is dead" variant for expired tokens.
 */
import { LinkIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-text text-xl leading-7 font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted text-sm leading-5">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function InvalidLinkCard({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        className="bg-warning-soft text-warning flex size-12 items-center justify-center rounded-full"
        aria-hidden
      >
        <LinkIcon className="size-5" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-text text-xl leading-7 font-semibold tracking-tight">{title}</h1>
        <p className="text-muted text-sm leading-5">{description}</p>
      </div>
      <Button asChild className="mt-2">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}
