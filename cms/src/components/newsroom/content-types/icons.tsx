/**
 * Curated lucide icons a content type may use (stored as the icon's name in
 * content_types.icon). A fixed list keeps the bundle small and the picker
 * meaningful for a newsroom. Unknown or empty names render the generic
 * FileText glyph. Server-safe.
 */
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Camera,
  Car,
  FileText,
  Flower2,
  GraduationCap,
  HeartPulse,
  Landmark,
  ListChecks,
  Megaphone,
  MessageSquareQuote,
  Mic,
  Music,
  Newspaper,
  PenLine,
  Quote,
  Radio,
  ScrollText,
  Sparkles,
  Star,
  StickyNote,
  Trophy,
  Utensils,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';

export const CONTENT_TYPE_ICONS: Record<string, LucideIcon> = {
  FileText,
  Newspaper,
  MessageSquareQuote,
  Quote,
  StickyNote,
  Flower2,
  CalendarDays,
  Megaphone,
  Mic,
  Radio,
  Camera,
  Video,
  BookOpen,
  ScrollText,
  ListChecks,
  Star,
  Sparkles,
  Trophy,
  Landmark,
  Briefcase,
  HeartPulse,
  GraduationCap,
  Music,
  Utensils,
  Car,
  PenLine,
};

export const CONTENT_TYPE_ICON_NAMES = Object.keys(CONTENT_TYPE_ICONS);

export function contentTypeIcon(name: string | null | undefined): LucideIcon {
  return (name && CONTENT_TYPE_ICONS[name]) || FileText;
}

export function ContentTypeIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  // createElement instead of <Icon/> because the component is picked from a static map at render time.
  return createElement(contentTypeIcon(name), { className, 'aria-hidden': true });
}
