/**
 * Did the server **answer** that this session is over?
 *
 * The one question `AuthContext`'s session restore has to get right, and
 * it got it wrong until 2026-09-06: a bare `catch` around `getMe()` ran
 * `clearSession()` on **every** failure, so a `status: 0` — our own code
 * for no response at all (offline, our box down, or CORS) — destroyed a
 * valid refresh token. Measured in a browser: `hk_session_v1`, 874 bytes
 * of live tokens, was gone after a single page load with the API
 * unreachable, every account screen said "You're signed out" to somebody
 * who was not, and the network coming back did **not** heal it, because
 * the credential it would have healed with had been deleted.
 *
 * That is M39's lesson — *a failed request is never an answer* — one
 * layer below where M39 fixed it, and destructive rather than merely
 * confusing. On a phone the unanswered case is routine, not rare; and
 * for a HomeKrafter signed out this way the door back needs SMS that is
 * not wired.
 *
 * **`401`/`403` are answers.** The token is revoked, expired or reused,
 * and clearing is the M8.5 fix that ended the "You're all set" loop with
 * no sign-in form in it. Keep that behaviour exactly.
 *
 * **Everything else is not.** Status 0, any 5xx, a timeout, and anything
 * that is not an `ApiError` at all. An unrecognised failure is not
 * evidence that a credential is dead, and the two directions cost very
 * different amounts: failing toward "keep them signed in" costs one
 * retry, failing the other way costs somebody their account.
 *
 * Pure and shared, so the native app's auth fork answers it identically —
 * a rule about when to delete a credential must not exist twice.
 */
import { ApiError } from "@/lib/api/http";

/** The statuses at which the server has genuinely refused the session. */
export const SESSION_ENDED_STATUSES: readonly number[] = [401, 403];

export function isSessionAnswer(cause: unknown): boolean {
  return cause instanceof ApiError && SESSION_ENDED_STATUSES.includes(cause.status);
}
