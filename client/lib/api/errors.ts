import { ApiError } from "./http";

/**
 * The message to show a person when a mutation failed.
 *
 * **Why this exists.** The 2026-08-07 audit found four screens — profile,
 * the address book, notification preferences and support — whose save
 * handlers were `try { … } finally { setBusy(false) }` with no `catch` at
 * all. The server refused with a perfectly clear reason and the UI showed
 * nothing: the form stayed open, the button un-greyed, and the only trace
 * was an unhandled rejection in the console. To the person using it,
 * pressing Save did nothing, twice, forever.
 *
 * `ApiError.message` is already the server's own sentence (and, for a 429,
 * the wait-and-retry copy `http.ts` composes), so the right thing to show
 * is almost always that. The fallback is for a genuine network failure,
 * where there is no server sentence to quote.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}
