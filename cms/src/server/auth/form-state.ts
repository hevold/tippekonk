/**
 * Shared shape for `useActionState` forms in the auth area. Plain data only,
 * so it can cross the server/client boundary.
 */
export type FormState = {
  /** Form-level error message (bokmål). */
  error?: string;
  /** Field → first error message. */
  fieldErrors?: Record<string, string>;
  /** Echoed input values so the form keeps what the user typed. */
  values?: Record<string, string>;
  /** Set when the action completed without redirecting. */
  success?: boolean;
  /** Extra info for success screens (e.g. remaining recovery codes). */
  info?: string;
};

export const EMPTY_FORM_STATE: FormState = {};
