import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { authors, memberships, sessions, users } from '@/db/schema';
import { resetRateLimits } from '@/server/rate-limit';
import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

const { sentMailLog } = await import('@/server/email');
const { acceptInvite, inviteUser, previewInvite, requestPasswordReset, resetPassword } =
  await import('./invites');
const { attemptLogin } = await import('./login');
const { issueSession, resolveSession } = await import('./session');

let db: Db;
let seed: SeedMinimalResult;

function lastMail() {
  return sentMailLog[sentMailLog.length - 1]!;
}

function linkToken(text: string, path: string): string {
  const m = new RegExp(`${path}/([A-Za-z0-9_-]+)`).exec(text);
  if (!m) throw new Error(`no ${path} link in mail`);
  return m[1]!;
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  resetRateLimits();
  sentMailLog.length = 0;
  seed = await seedMinimal(db);
});

describe('invitations', () => {
  it('creates user + membership + author, e-mails a link, and accepting sets the password', async () => {
    const actor = { user: seed.admin, site: seed.site, ip: null };
    const outcome = await inviteUser(actor, {
      email: 'Ny.Person@Test.local',
      name: 'Ny Person',
      role: 'journalist',
      createAuthor: true,
    });
    expect(outcome).toMatchObject({ created: true, invited: true });
    expect(outcome.user.email).toBe('ny.person@test.local');
    expect(outcome.user.passwordHash).toBeNull();

    const member = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, outcome.user.id), eq(memberships.siteId, seed.site.id)));
    expect(member[0]?.role).toBe('journalist');
    const author = await db.select().from(authors).where(eq(authors.userId, outcome.user.id));
    expect(author[0]?.slug).toBe('ny-person');

    const mail = lastMail();
    expect(mail.to).toBe('ny.person@test.local');
    expect(mail.subject).toContain(seed.site.name);
    const token = linkToken(mail.text, '/admin/invitasjon');

    const preview = await previewInvite(token);
    expect(preview?.site?.id).toBe(seed.site.id);
    expect(preview?.role).toBe('journalist');

    // Cannot log in before accepting.
    expect(
      await attemptLogin({ email: 'ny.person@test.local', password: 'Hemmelig123', ip: null }),
    ).toMatchObject({ ok: false });

    const user = await acceptInvite({ token, name: 'Ny Person Hansen', password: 'Hemmelig123', ip: null });
    expect(user.passwordHash).not.toBeNull();
    expect(
      await attemptLogin({ email: 'ny.person@test.local', password: 'Hemmelig123', ip: null }),
    ).toMatchObject({ ok: true });
    await expect(acceptInvite({ token, name: 'x', password: 'Hemmelig123', ip: null })).rejects.toThrow();
    const [updatedAuthor] = await db.select().from(authors).where(eq(authors.userId, user.id));
    expect(updatedAuthor?.name).toBe('Ny Person Hansen');
  });

  it('adds a membership for an existing user and rejects duplicates', async () => {
    const actor = { user: seed.admin, site: seed.site, ip: null };
    await expect(
      inviteUser(actor, { email: seed.journalist.email, name: 'x', role: 'editor', createAuthor: false }),
    ).rejects.toThrow(/allerede medlem/);

    const [other] = await db
      .insert(users)
      .values({ email: 'annen@test.local', name: 'Annen', passwordHash: seed.editor.passwordHash })
      .returning();
    const outcome = await inviteUser(actor, {
      email: 'annen@test.local',
      name: 'Annen',
      role: 'viewer',
      createAuthor: false,
    });
    expect(outcome).toMatchObject({ created: false, invited: false });
    expect(outcome.user.id).toBe(other!.id);
    expect(lastMail().subject).toContain('tilgang');
  });
});

describe('password reset', () => {
  it('sends a link for known addresses, stays silent for unknown, and resets + logs out everywhere', async () => {
    expect(await requestPasswordReset('finnes.ikke@test.local', null)).toBe('unknown');
    expect(sentMailLog).toHaveLength(0);

    const { raw } = await issueSession(seed.editor.id);
    expect(await requestPasswordReset(seed.editor.email, null)).toBe('sent');
    const token = linkToken(lastMail().text, '/admin/tilbakestill');

    await resetPassword({ token, password: 'NyttPassord2026', ip: null });
    expect(
      await attemptLogin({ email: seed.editor.email, password: 'NyttPassord2026', ip: null }),
    ).toMatchObject({ ok: true });
    expect(await attemptLogin({ email: seed.editor.email, password: seed.password, ip: null })).toMatchObject(
      { ok: false },
    );
    expect(await resolveSession(raw)).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, seed.editor.id))).toHaveLength(0);
    await expect(resetPassword({ token, password: 'NyttPassord2026', ip: null })).rejects.toThrow();
  });

  it('rate limits reset requests per ip+email', async () => {
    for (let i = 0; i < 5; i++) expect(await requestPasswordReset(seed.editor.email, '5.5.5.5')).toBe('sent');
    expect(await requestPasswordReset(seed.editor.email, '5.5.5.5')).toBe('rate_limited');
  });
});
