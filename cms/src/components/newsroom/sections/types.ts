/** Serialisable section row for the sections admin (no Date objects). */
import type { SectionWithCount } from '@/server/taxonomy/queries';

export type SectionDto = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  showInMenu: boolean;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  articleCount: number;
  publishedCount: number;
};

export function toSectionDto(s: SectionWithCount): SectionDto {
  return {
    id: s.id,
    parentId: s.parentId,
    name: s.name,
    slug: s.slug,
    description: s.description,
    color: s.color,
    sortOrder: s.sortOrder,
    showInMenu: s.showInMenu,
    isActive: s.isActive,
    seoTitle: s.seoTitle,
    seoDescription: s.seoDescription,
    articleCount: s.articleCount,
    publishedCount: s.publishedCount,
  };
}

/** Flatten rows into display order (parents first, then their children), with depth. */
export function orderedWithDepth(rows: SectionDto[]): (SectionDto & { depth: number; siblings: string[] })[] {
  const ids = new Set(rows.map((r) => r.id));
  const childrenOf = (parent: string | null) => rows.filter((r) => (r.parentId && ids.has(r.parentId) ? r.parentId : null) === parent);
  const out: (SectionDto & { depth: number; siblings: string[] })[] = [];
  const walk = (parent: string | null, depth: number) => {
    const siblings = childrenOf(parent);
    const siblingIds = siblings.map((s) => s.id);
    for (const s of siblings) {
      out.push({ ...s, depth, siblings: siblingIds });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
