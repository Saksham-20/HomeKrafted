import { getSession } from "./session";

/** Where somebody holding an admin-issued password is sent (M32). */
export const SET_PASSWORD_PATH = "/set-password";

/**
 * Does the signed-in account still owe us a password of its own?
 *
 * Read from the stored session rather than from React state on purpose.
 * The decision is made in the same tick as the sign-in that produced it —
 * `redirectForRole` runs immediately after `completeRealSignIn` — and a
 * `useState` set in that tick has not necessarily been read back yet.
 * `setSession` writes to `localStorage` synchronously, so this is the one
 * source that is already true when the redirect is chosen.
 *
 * Absent reads as `false`: a session persisted before M32 has no such
 * field, and defaulting the other way would send every returning user to
 * a password screen they do not need.
 */
export function sessionMustChangePassword(): boolean {
  return getSession()?.user.mustChangePassword === true;
}
