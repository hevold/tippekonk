/** Serialisable author row for the authors admin (dates dropped, photo resolved to a URL). */
import { mediaUrl } from '@/server/media/urls';
import type { AuthorWithCount, MemberOption } from '@/server/taxonomy/queries';

export type AuthorDto = {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  imageMediaId: string | null;
  /** Small variant URL for the avatar, or null. */
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  articleCount: number;
};

export type { MemberOption };

export function toAuthorDto(a: AuthorWithCount): AuthorDto {
  return {
    id: a.id,
    name: a.name,
    slug: a.slug,
    title: a.title,
    bio: a.bio,
    email: a.email,
    phone: a.phone,
    userId: a.userId,
    userName: a.userName,
    userEmail: a.userEmail,
    imageMediaId: a.imageMediaId,
    imageUrl: a.image && !a.image.deletedAt ? mediaUrl(a.image, 160) : null,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    articleCount: a.articleCount,
  };
}
