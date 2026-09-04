/**
 * Auth and user management schemas: login, invitations, password rules,
 * profile. The password rule is shared so the server and the form agree.
 */
import { z } from 'zod';

import { emailSchema, formBoolean, nullableText, optionalUuidSchema, trimmed, uuidSchema } from './common';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Returns a bokmål error message, or null when the password is acceptable. */
export function passwordStrengthError(plain: string): string | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) {
    return `Passordet må ha minst ${PASSWORD_MIN_LENGTH} tegn`;
  }
  if (plain.length > PASSWORD_MAX_LENGTH)
    return `Passordet kan ikke være lengre enn ${PASSWORD_MAX_LENGTH} tegn`;
  if (!/\p{L}/u.test(plain)) return 'Passordet må inneholde minst én bokstav';
  if (!/\p{N}/u.test(plain)) return 'Passordet må inneholde minst ett tall';
  return null;
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const error = passwordStrengthError(value);
  if (error) ctx.addIssue({ code: 'custom', message: error });
});

export const memberRoleSchema = z.enum(['admin', 'editor', 'journalist', 'contributor', 'viewer']);
export const localeSchema = z.enum(['nb', 'nn', 'en']);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Passord må fylles ut').max(PASSWORD_MAX_LENGTH),
  remember: formBoolean.default(false),
  /** Return path after login; must be a local path. */
  next: z
    .string()
    .max(500)
    .refine((v) => v === '' || (v.startsWith('/') && !v.startsWith('//')), 'Ugyldig returadresse')
    .default(''),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Koden må være 6 siffer');

export const inviteSchema = z.object({
  email: emailSchema,
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  role: memberRoleSchema.default('journalist'),
  /** Also create an author (byline) for the user. */
  createAuthor: formBoolean.default(true),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passordene er ikke like',
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passordene er ikke like',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Skriv inn nåværende passord'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passordene er ikke like',
  });

export const profileSchema = z.object({
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  email: emailSchema,
  locale: localeSchema.default('nb'),
  avatarMediaId: optionalUuidSchema.default(null),
  /** Optional byline details when the user has an author profile. */
  title: nullableText(120, 'Tittelen').default(null),
  bio: nullableText(3000, 'Biografien').default(null),
  phone: nullableText(40, 'Telefonnummeret').default(null),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const membershipUpdateSchema = z.object({
  userId: uuidSchema,
  role: memberRoleSchema,
});

export const userUpdateSchema = z.object({
  id: uuidSchema,
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut').optional(),
  email: emailSchema.optional(),
  role: memberRoleSchema.optional(),
  isActive: formBoolean.optional(),
});
