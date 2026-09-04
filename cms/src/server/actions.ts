/**
 * Shared server-action result type and helpers.
 *
 *   'use server'
 *   export async function saveThing(input: unknown): Promise<ActionResult<Thing>> {
 *     return runAction(async () => {
 *       const ctx = await requirePermission('article:edit_any');
 *       const data = thingSchema.parse(input);       // ZodError → fieldErrors
 *       ...
 *       return thing;
 *     });
 *   }
 *
 * Client code checks `result.ok` and shows `result.error` via toast, or maps
 * `result.fieldErrors` onto the form.
 */
import { ZodError } from 'zod';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ActionErrorCode; fieldErrors?: Record<string, string[]> };

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

export class ActionError extends Error {
  constructor(
    message: string,
    public code: ActionErrorCode = 'internal',
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export class UnauthorizedError extends ActionError {
  constructor(message = 'Du må logge inn.') {
    super(message, 'unauthorized');
  }
}
export class ForbiddenError extends ActionError {
  constructor(message = 'Du har ikke tilgang til dette.') {
    super(message, 'forbidden');
  }
}
export class NotFoundError extends ActionError {
  constructor(message = 'Fant ikke det du lette etter.') {
    super(message, 'not_found');
  }
}
export class ConflictError extends ActionError {
  constructor(message = 'Konflikt: innholdet er endret av noen andre.') {
    super(message, 'conflict');
  }
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, code: ActionErrorCode = 'internal', fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, code, fieldErrors };
}

function zodFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Run an action body, converting known errors into an ActionResult. Next.js redirect()/notFound() are re-thrown. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    if (err instanceof ZodError) {
      return fail('Sjekk feltene og prøv igjen.', 'validation', zodFieldErrors(err));
    }
    if (err instanceof ActionError) {
      return fail(err.message, err.code, err.fieldErrors);
    }
    console.error('[action]', err);
    return fail('Noe gikk galt. Prøv igjen.', 'internal');
  }
}

/** Next.js signals redirects and notFound() by throwing; never swallow those. */
export function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND' || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'));
}
