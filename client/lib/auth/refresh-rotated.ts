/**
 * The refusal a losing refresh gets, and how long it waits for the winner.
 *
 * The server rotates a refresh token on first use. A second request that
 * presents the same token a moment later — another tab, a tab on a bundle
 * from before tabs took a lock, a browser without Web Locks — is refused
 * with 401. Most refusals mean the session is over. This one does not: it
 * means **somebody else just rotated it and holds the successor**, whose
 * response is on its way to shared storage. The server says so with its own
 * code (`server/src/auth/auth.service.ts`, `REFRESH_ROTATED_CODE`), inside a
 * ten-second window or on a concurrent rotation it lost.
 *
 * Without the code the loser could not tell the two apart. It re-read
 * storage, found the winner's write had not landed yet, called the refusal
 * final and deleted the session the winner was about to store.
 *
 * Pure constants, shared by the web and native HTTP clients (the native app
 * compiles this file), so the two cannot disagree about the code.
 */

/** Mirrors `REFRESH_ROTATED_CODE` in `server/src/auth/auth.service.ts`. */
export const REFRESH_ROTATED_CODE = "REFRESH_TOKEN_ROTATED";

/**
 * How long a tab that lost a rotation waits for the winner's tokens to reach
 * storage before giving up **without** ending the session. The winner's
 * request was in flight at the same moment as ours, so this is a round trip
 * and a write; two seconds covers a slow connection, and giving up is not
 * destructive — the next request re-reads storage and tries again.
 */
export const SIBLING_ROTATION_WAIT_MS = 2_000;

/** How often the wait re-reads storage. */
export const SIBLING_ROTATION_POLL_MS = 100;
