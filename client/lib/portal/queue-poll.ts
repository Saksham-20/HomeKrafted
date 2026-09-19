/**
 * When the admin nav's queue badges may be fetched again.
 *
 * Pure, and it takes `now`, so the rule is testable and a component never
 * has to reason about time inside an event handler.
 *
 * **Why this is a function and not a line in the component (2026-09-19).**
 * `AdminShell` kept the last-fetched time in `useState` and read it from a
 * focus handler registered once, so the handler saw the `0` it was created
 * with for the life of the page. `now - 0` is never under a minute: every
 * window focus fired `GET /admin/dashboard`, the documented 60-second
 * throttle did not exist, and a cosmetic badge poll became the request that
 * tripped over an expired token on every alt-tab.
 */

/** How long a fetched set of queue counts is trusted before a focus refreshes it. */
export const QUEUE_STALE_MS = 60_000;

export function shouldRefetchQueues(input: {
  now: number;
  /** When the last poll **started** (0 = never). Started, not succeeded: a failing poll must not be retried on every focus. */
  lastPollAt: number;
  /** `document.visibilityState === "visible"`. A hidden tab that receives a programmatic focus is not somebody looking at a badge. */
  visible: boolean;
}): boolean {
  if (!input.visible) return false;
  return input.now - input.lastPollAt > QUEUE_STALE_MS;
}
