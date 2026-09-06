/** Serialisable tag row for the tags admin (no Date objects). */
import type { TagWithCount } from '@/server/taxonomy/queries';

export type TagDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  articleCount: number;
  createdAt: string;
};

export function toTagDto(tag: TagWithCount): TagDto {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    articleCount: tag.articleCount,
    createdAt: tag.createdAt.toISOString(),
  };
}
