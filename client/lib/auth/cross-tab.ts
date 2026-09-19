/**
 * What this tab should do when **another tab** changed the stored session.
 *
 * Pure, so the rule is checkable without a React tree. `session.ts` already
 * keeps the token cache honest; this decides what the *interface* does about
 * it (`AuthContext`).
 *
 * - `sign-out` — the session ended elsewhere (a sign-out, or a refresh the
 *   server refused). Forget the identity; the shells' own gates say so.
 * - `re-restore` — a *different* account signed in. This tab is showing one
 *   person's data over another person's tokens; re-run session restore
 *   rather than guess which of them is meant.
 * - `none` — a token rotation or profile update for the same account. Nothing
 *   this tab displays has changed. This is the ordinary case, and the one
 *   that must not do anything: a rotation every fifteen minutes per tab that
 *   remounted the interface would be worse than the bug.
 *
 * A tab that is not signed in (`knownUserId` undefined) ignores a sign-in
 * elsewhere on purpose: re-running restore there would flash the loading
 * state over a sign-in form somebody may be typing into.
 */
export type CrossTabAction = "sign-out" | "re-restore" | "none";

export function crossTabAction(
  next: { user: { id: string } } | null,
  knownUserId: string | undefined,
): CrossTabAction {
  if (next === null) return "sign-out";
  if (knownUserId && next.user.id !== knownUserId) return "re-restore";
  return "none";
}
