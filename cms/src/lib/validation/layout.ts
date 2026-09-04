/**
 * Layout (front page) validation: the document schema lives with the engine;
 * this module re-exports it and adds the save/publish payloads.
 */
import { z } from 'zod';

import {
  blockSettingsSchema,
  layoutBlockSchema,
  layoutBlockTypeSchema,
  layoutDocSchema,
  layoutItemOverridesSchema,
  layoutItemSchema,
  layoutRowSchema,
  parseLayoutDoc,
} from '@/lib/layout/engine';

import { trimmed, uuidSchema } from './common';

export {
  blockSettingsSchema,
  layoutBlockSchema,
  layoutBlockTypeSchema,
  layoutDocSchema,
  layoutItemOverridesSchema,
  layoutItemSchema,
  layoutRowSchema,
  parseLayoutDoc,
};

/** 'front' or 'section:<uuid>'. */
export const layoutKeySchema = z
  .string()
  .trim()
  .refine((v) => v === 'front' || /^section:[0-9a-f-]{36}$/i.test(v), 'Ugyldig layoutnøkkel');

export const layoutSaveSchema = z.object({
  key: layoutKeySchema,
  name: trimmed(120, 'Navnet').optional(),
  doc: layoutDocSchema,
});
export type LayoutSaveInput = z.infer<typeof layoutSaveSchema>;

export const layoutPublishSchema = z.object({
  key: layoutKeySchema,
});

export const layoutItemPinSchema = z.object({
  key: layoutKeySchema,
  blockId: z.string().min(1).max(64),
  articleId: uuidSchema,
});
