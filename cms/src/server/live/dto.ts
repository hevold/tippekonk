/**
 * Serialisable live blog shapes shared by server actions, pages and client
 * components (server action files may only export async functions).
 */
import type { LiveBlog } from '@/db/schema';

export type LiveBlogDto = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  articleId: string | null;
  status: LiveBlog['status'];
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toLiveBlogDto(b: LiveBlog): LiveBlogDto {
  return {
    id: b.id,
    title: b.title,
    slug: b.slug,
    description: b.description,
    articleId: b.articleId,
    status: b.status,
    startedAt: b.startedAt ? b.startedAt.toISOString() : null,
    endedAt: b.endedAt ? b.endedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
