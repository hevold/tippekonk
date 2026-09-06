'use server';
/**
 * Live blog server actions (/admin/direkte). All need `live:manage`.
 */
import { z } from 'zod';

import { liveBlogStatusSchema } from '@/lib/validation/live';
import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { toLiveBlogDto, type LiveBlogDto } from './dto';
import {
  addPost,
  getLiveBlog,
  createLiveBlog,
  deleteLiveBlog,
  deletePost,
  listPosts,
  setLiveBlogStatus,
  toPostDto,
  updateLiveBlog,
  updatePost,
  type LivePostDto,
} from './index';

const idSchema = z.object({ id: uuidSchema });
const statusSchema = z.object({ id: uuidSchema, status: liveBlogStatusSchema });
const updateSchema = z.object({ id: uuidSchema, input: z.unknown() });
const postsSchema = z.object({
  liveBlogId: uuidSchema,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function createLiveBlogAction(input: unknown): Promise<ActionResult<LiveBlogDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    return toLiveBlogDto(await createLiveBlog(ctx, input));
  });
}

export async function updateLiveBlogAction(input: unknown): Promise<ActionResult<LiveBlogDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    const { id, input: data } = updateSchema.parse(input);
    return toLiveBlogDto(await updateLiveBlog(ctx, id, data));
  });
}

export async function setLiveBlogStatusAction(input: unknown): Promise<ActionResult<LiveBlogDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    const { id, status } = statusSchema.parse(input);
    return toLiveBlogDto(await setLiveBlogStatus(ctx, id, status));
  });
}

export async function deleteLiveBlogAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    const { id } = idSchema.parse(input);
    await deleteLiveBlog(ctx, id);
  });
}

export async function addLivePostAction(input: unknown): Promise<ActionResult<LivePostDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    return toPostDto(await addPost(ctx, input));
  });
}

export async function updateLivePostAction(input: unknown): Promise<ActionResult<LivePostDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    return toPostDto(await updatePost(ctx, input));
  });
}

export async function deleteLivePostAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    const { id } = idSchema.parse(input);
    await deletePost(ctx, id);
  });
}

/** Timeline refresh for the admin composer (polled every 15 s). */
export async function listLivePostsAction(input: unknown): Promise<ActionResult<LivePostDto[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('live:manage');
    const { liveBlogId, limit } = postsSchema.parse(input);
    const blog = await getLiveBlog(ctx.site.id, liveBlogId);
    if (!blog) return [];
    return (await listPosts(liveBlogId, { limit })).map(toPostDto);
  });
}
