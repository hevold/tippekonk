/**
 * lucide icons for the block palette, keyed by the icon names used in
 * BLOCK_DEFINITIONS (src/lib/layout/blocks.ts).
 */
import {
  Clock,
  FolderTree,
  Heading,
  LayoutGrid,
  LayoutTemplate,
  List,
  Mail,
  Megaphone,
  MessageSquareQuote,
  Newspaper,
  Radio,
  Star,
  Tag,
  TrendingUp,
  Type,
  type LucideIcon,
} from 'lucide-react';

import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import type { LayoutBlockType } from '@/lib/layout/types';

const ICONS: Record<string, LucideIcon> = {
  Newspaper,
  LayoutTemplate,
  LayoutGrid,
  List,
  FolderTree,
  Tag,
  Clock,
  TrendingUp,
  MessageSquareQuote,
  Radio,
  Star,
  Mail,
  Megaphone,
  Type,
  Heading,
};

export function blockIcon(type: LayoutBlockType): LucideIcon {
  return ICONS[BLOCK_DEFINITIONS[type]?.icon ?? ''] ?? LayoutGrid;
}

/** The palette icon for a block type (decorative). */
export function BlockIcon({ type, className }: { type: LayoutBlockType; className?: string }) {
  const Icon = ICONS[BLOCK_DEFINITIONS[type]?.icon ?? ''] ?? LayoutGrid;
  return <Icon className={className} aria-hidden />;
}
