/**
 * Real HTTP client (M8.4a) — every domain module under `lib/api/*.ts`
 * (except `lib/api/seller.ts`/`lib/api/admin.ts`, left on mock until
 * M8.4b) calls through `http.get/post/patch/delete` instead of resolving
 * `lib/data` directly. Talks to `server/` (NestJS, `docs/API.md`) at
 * `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).
 *
 * **Auth attach**: reads the current access token from
 * `lib/auth/session.ts` — in the browser, the live in-memory token; on
 * the server (a Server Component's `await getX()` during SSR), the
 * `hk_access` cookie on the incoming request (see `getServerAccessToken`
 * below) — same non-httpOnly-cookie caveat `session.ts`'s file header
 * documents.
 *
 * **401 handling**: on a `401` from an authed request, attempts exactly
 * one `POST /auth/refresh` (de-duplicated across concurrent callers via
 * `refreshPromise`) and retries the original request once with the new
 * token. Refresh is only attempted in the browser (a
 * Server Component render has no refresh token available — see
 * `session.ts`); a server-side `401` just propagates as an `ApiError` for
 * the caller to handle (every M8.4a swap of an owner-scoped `lib/api`
 * function is called from a Client Component on mount specifically to
 * avoid this case in practice — see `session.ts`'s file header).
 *
 * **A refresh has three answers, and only one of them ends the session
 * (2026-09-19).** `refreshOnce` resolves a `RefreshOutcome`: `ok`, `rejected`
 * or `unavailable`. Until then `doRefresh` returned a boolean and every
 * failure — a 429 from the throttler, a 502 while pm2 restarts the API, a
 * dropped connection — was `false`, which `request` read as "the session is
 * over": `clearSession()` and a redirect to `/login`. A failed request is
 * never an answer (`lib/auth/session-answer.ts`); only the server saying
 * 401/403 to the refresh token *and* no other tab having rotated it in the
 * meantime is `rejected`. `unavailable` keeps the session and rejects the
 * one request with the same `status: 0` error an unreachable API produces.
 *
 * **Several tabs, one refresh token.** It is re-read from `localStorage`
 * under a Web Lock before it is posted (`session.ts`), because the server
 * rotates on first use and a tab presenting the copy in its own memory after
 * a sibling rotated it is presenting a spent token. If storage already holds
 * a newer pair the tab adopts it and retries; posting the stale one is what
 * used to end the whole session. A refusal the server marks
 * `REFRESH_TOKEN_ROTATED` ("a sibling rotated it moments ago") is waited on,
 * not obeyed: the winner's tokens are about to reach storage, and deleting the
 * session first is what a tab without Web Locks used to do to it.
 *
 * **What an `unavailable` refresh tells the person is decided by whether the
 * server answered.** A `fetch` that rejected goes through `classifyAndReport`
 * (is our own origin up? beacon it if so) — that question is only meaningful
 * when there was no response. A 429 says so, with the wait; any other answer
 * that was not a usable token pair is "us, not you" with no probe and no
 * beacon, because nothing was rejected and a 5xx is already logged with a
 * reference on the server.
 *
 * **Error envelope**: server errors are `{ error: { code, message } }`
 * (`docs/API.md` "Conventions") — surfaced here as `ApiError` with
 * `.status`/`.code`/`.message` so callers can branch on `code` (e.g.
 * `INSUFFICIENT_BALANCE` on a wallet-pay attempt) without string-matching
 * the message.
 *
 * **Unreachable server**: a rejected `fetch` (offline, API down, DNS gone,
 * CORS) has no status and no envelope, so it becomes an `ApiError` with
 * status `0` rather than reaching the screens as raw browser text. Since
 * 2026-08-11 it is one of **two** codes, because treating them as one
 * blamed a visitor for our outage: `NETWORK_ERROR` when the browser really
 * is offline, and `SERVER_UNREACHABLE` when the page's own origin still
 * answers — which means the network is fine and the fault is ours. The
 * latter is beaconed to `/api/client-errors`. See `lib/api/unreachable.ts`
 * and the `catch` in `doFetch`.
 */

import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  SET_PASSWORD_PATH,
} from "@/lib/auth/must-change-password";
import { withReturnTo } from "@/lib/auth/return-to";
import {
  REFRESH_ROTATED_CODE,
  SIBLING_ROTATION_POLL_MS,
  SIBLING_ROTATION_WAIT_MS,
} from "@/lib/auth/refresh-rotated";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  isAccessTokenStale,
  syncFromStorage,
  updateTokens,
  withRefreshLock,
} from "@/lib/auth/session";
import { classifyAndReport, type Reachability } from "@/lib/api/unreachable";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  /**
   * Server-assigned id for a 5xx, present only on those. Quoting it in a
   * bug report finds the exact log line — see the filter in
   * `server/src/common/filters/all-exceptions.filter.ts`.
   */
  reference?: string;

  constructor(status: number, code: string, message: string, reference?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.reference = reference;
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Server-side (Server Component) token read — request-scoped via
 * `next/headers`, never a module-level variable (a Node process is
 * shared across every visitor's request, so that would leak one user's
 * token to another's render). Dynamically imported so `next/headers`
 * never ends up in the client bundle (it throws if actually called from
 * client code — this branch never runs there, `isBrowser()` guards it).
 */
async function getServerAccessToken(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get("hk_access")?.value ?? null;
  } catch {
    return null;
  }
}

async function resolveAccessToken(): Promise<string | null> {
  if (isBrowser()) return getAccessToken();
  return getServerAccessToken();
}

/**
 * What a refresh attempt established.
 *
 * - `ok` — this tab now holds a token pair it can use (its own rotation, or
 *   one another tab had already made).
 * - `rejected` — the session is over: the server refused the refresh token
 *   and nothing newer was waiting in storage, or there is no session left.
 * - `unavailable` — nobody usable answered: no connection, a 5xx, a 429, a
 *   timeout, a body that is not our JSON. **Nothing here says the credential
 *   is dead**, so nothing here may delete it.
 */
export type RefreshOutcome = "ok" | "rejected" | "unavailable";

/**
 * A refresh's outcome plus, for `unavailable` only, whether the server
 * answered. `answer` is the HTTP response that was not a usable token pair (a
 * 429, a 5xx, a body that is not ours); **absent on `unavailable`** means no
 * response arrived at all — the connection dropped or the request timed out.
 * `request()` words the failure by which of the two it was.
 */
interface RefreshAttempt {
  outcome: RefreshOutcome;
  answer?: Response;
}

/**
 * Long enough for a slow phone, short enough that a hung request cannot hold
 * the cross-tab lock — and with it every other tab's refresh — for ever.
 */
const REFRESH_TIMEOUT_MS = 15_000;

let refreshPromise: Promise<RefreshAttempt> | null = null;

/** De-duplicated `/auth/refresh` — concurrent 401s from several in-flight requests only trigger one refresh call. */
function refreshOnce(): Promise<RefreshAttempt> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Did the server refuse this refresh token *because another request rotated it moments ago*? Reads the body; anything unreadable is "no". */
async function isRotatedRefusal(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: { code?: string } } | null;
    return body?.error?.code === REFRESH_ROTATED_CODE;
  } catch {
    return false;
  }
}

/**
 * Wait for the tab that won a rotation to write its tokens to storage.
 * `ok` once storage holds a token other than the spent one; `rejected` if the
 * session was cleared meanwhile (it ended elsewhere); `unavailable` if nothing
 * arrived in time — which keeps the session, because the winner may simply be
 * slow, and the next request looks again.
 */
async function awaitSiblingRotation(spent: string): Promise<RefreshOutcome> {
  const deadline = Date.now() + SIBLING_ROTATION_WAIT_MS;
  for (;;) {
    const latest = syncFromStorage();
    if (!latest) return "rejected";
    if (latest.refreshToken !== spent) return "ok";
    if (Date.now() >= deadline) return "unavailable";
    await new Promise<void>((resolve) => setTimeout(resolve, SIBLING_ROTATION_POLL_MS));
  }
}

async function doRefresh(): Promise<RefreshAttempt> {
  // The token this tab was holding when the request that 401'd was made.
  // Read before waiting on the lock, so "storage has moved on since" is
  // something the lock's holder can have changed underneath us.
  const presented = getRefreshToken();
  if (!presented) return { outcome: "rejected" };

  return withRefreshLock(async (): Promise<RefreshAttempt> => {
    // Never trust this tab's memory for the token being spent: a sibling
    // tab may have rotated it, and the server treats a spent token as
    // reuse.
    const held = syncFromStorage();
    if (!held) return { outcome: "rejected" };
    // Already rotated by another tab. Adopt it and let the caller retry —
    // unless what it wrote is itself about to expire (a tab that slept
    // through several rotations), in which case spend the current one.
    if (held.refreshToken !== presented && !isAccessTokenStale(held.accessToken)) return { outcome: "ok" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: held.refreshToken }),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        // Refused — but a tab without Web Locks can lose the race to a
        // sibling whose result is already in storage. Look before ending it.
        const latest = syncFromStorage();
        if (latest && latest.refreshToken !== held.refreshToken) return { outcome: "ok" };
        // Not there yet, but the server says a sibling has just rotated it:
        // its response is in flight to storage. Wait for it rather than
        // deleting the session it is about to write.
        if (await isRotatedRefusal(res)) {
          const settled = await awaitSiblingRotation(held.refreshToken);
          return settled === "unavailable" ? { outcome: "unavailable", answer: res } : { outcome: settled };
        }
        return { outcome: "rejected" };
      }
      if (!res.ok) return { outcome: "unavailable", answer: res };
      const data = (await res.json().catch(() => undefined)) as
        | { accessToken?: string; refreshToken?: string }
        | undefined;
      if (!data?.accessToken || !data.refreshToken) return { outcome: "unavailable", answer: res };
      updateTokens(data.accessToken, data.refreshToken);
      return { outcome: "ok" };
    } catch {
      return { outcome: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * The refresh, for a caller that is not a `request()` and needs a token it
 * can trust — session restore in `AuthContext`, the upload XHR. Same
 * single-flight, same lock, same three-way answer, so neither can spend a
 * stale refresh token or end a session on a failed request.
 */
export async function refreshSessionNow(): Promise<RefreshOutcome> {
  return (await refreshOnce()).outcome;
}

/** The `status: 0` error for "no usable answer" — one place, so a refresh that could not complete reads exactly like an API that could not be reached. */
function unreachableError(kind: Reachability): ApiError {
  return new ApiError(
    0,
    kind === "server-unreachable" ? "SERVER_UNREACHABLE" : "NETWORK_ERROR",
    kind === "server-unreachable"
      ? "Something on our end isn't responding. This one is us, not you — please try again in a moment."
      : "You appear to be offline. Check your connection and try again.",
  );
}

/**
 * The error for a refresh that produced no usable token pair — worded by
 * what actually happened, not by the fact that it failed.
 *
 * No response at all is the one case `classifyAndReport` exists for. A
 * response that was not usable is not "a fetch was rejected": probing the
 * favicon and beaconing `api-unreachable` for it would report a fault that did
 * not occur (and spend the page's three-report budget), and a failed probe
 * would tell somebody they are offline over a request the server answered.
 */
async function refreshUnavailableError(answer: Response | undefined): Promise<ApiError> {
  if (!answer) return unreachableError(await classifyAndReport(`${API_BASE_URL}/auth/refresh`));
  if (answer.status === 429) return new ApiError(429, "RATE_LIMITED", rateLimitMessage(answer));
  return unreachableError("server-unreachable");
}

/**
 * The server refuses every route but two while `User.mustChangePassword`
 * is set (M32), and says so with a code it invents specifically so a
 * client can act on it: `PASSWORD_CHANGE_REQUIRED`.
 *
 * Until M39 **nothing in this client had ever heard of that code** — a
 * repo-wide grep returned zero hits. So the 403 surfaced as whatever
 * each screen made of a failed request, and on the portal that was "you
 * are not a HomeKrafter". Handling it here rather than screen by screen
 * is deliberate: this is the one place every authed request passes
 * through, and the answer is the same wherever it lands.
 *
 * Unlike `handleSessionExpired` this keeps the session — it is valid,
 * and `/set-password` needs it to authenticate the change.
 */
function handlePasswordChangeRequired(): void {
  if (!isBrowser()) return;
  if (window.location.pathname.startsWith(SET_PASSWORD_PATH)) return;
  window.location.href = SET_PASSWORD_PATH;
}

function handleSessionExpired(): void {
  clearSession();
  if (isBrowser() && !window.location.pathname.startsWith("/login")) {
    // Carry the page they were on. A refresh token that has expired or
    // been revoked lands here mid-task, and dropping the destination
    // means somebody halfway through checkout signs in again and arrives
    // at their account overview.
    window.location.href = withReturnTo(
      "/login",
      window.location.pathname + window.location.search,
    );
  }
}

/**
 * Human-readable copy for a `429`, with the wait when the server states one.
 *
 * **Not a retry.** The obvious fix here is to sleep for `Retry-After` and
 * try again, and it does not work: `@nestjs/throttler` returns the whole
 * remaining window, which is `THROTTLE_TTL_SECONDS` — measured at 60 on
 * this server. Sleeping 60s inside a fetch is indistinguishable from a
 * hang, and a retry capped below that never fires, so it would be dead
 * code that reads like a safety net.
 *
 * What the throttler actually cost was legibility: `docs/DEPLOY.md`
 * records 429s surfacing as blank modules or "Missing bearer token",
 * which reads as a UI bug and sends people looking in the wrong place.
 * Both limits key on client IP (`THROTTLE_LIMIT` 120/min,
 * `THROTTLE_AUTH_LIMIT` 20/min), so one office behind a NAT shares a
 * budget — this is a real user-facing state, not only a load-test
 * artefact, and it deserves to say so.
 */
function rateLimitMessage(res: Response): string {
  const seconds = Number(res.headers.get("Retry-After"));
  if (Number.isFinite(seconds) && seconds > 0) {
    const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} minute(s)` : `${seconds} seconds`;
    return `Too many requests. Try again in about ${wait}.`;
  }
  return "Too many requests just now — wait a moment and try again.";
}

export interface RequestOptions {
  /** Attach the bearer token when present. Default `true` — pass `false` for `@Public()` endpoints called with no session (harmless either way, but explicit). */
  auth?: boolean;
  /** Idempotency-Key header — money-mutating endpoints (`docs/API.md` "Idempotency"). */
  idempotencyKey?: string;
  /** Extra query params, appended + URL-encoded. */
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, idempotencyKey, query, signal } = options;
  const url = buildUrl(path, query);

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (auth) {
      const token = await resolveAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    try {
      return await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (cause) {
      // A dropped connection, a killed API or a phone in a lift rejects
      // `fetch` with a `TypeError`, not an HTTP status — so it never
      // reached the envelope handling below and arrived at the screens as
      // its raw browser text. Nineteen of them render `err.message`
      // straight into their error region, which meant "Failed to fetch"
      // (Chrome), "Load failed" (Safari) or "NetworkError when attempting
      // to fetch resource" (Firefox) shown where a refusal belongs: it
      // reads as the server rejecting what was typed, so people edit a
      // form that was never wrong.
      //
      // Status `0` because there is no response — the number is
      // deliberately not a plausible HTTP one, so a caller branching on
      // `status >= 500` never mistakes an unreachable server for a
      // failing one.
      // An abort is somebody navigating away or a caller cancelling, not
      // a failure — swallowing it into an error message would put "check
      // your connection" on a screen nobody is looking at any more.
      if (cause instanceof Error && cause.name === "AbortError") throw cause;

      // Which of the two this is decides the wording, and the wording
      // matters: this message used to tell a visitor to check a connection
      // that was working, because a CORS block and a dead network reject
      // `fetch` identically. `classifyAndReport` asks whether our own
      // origin still answers, and beacons the case that is our fault.
      // See `lib/api/unreachable.ts` for the incident.
      throw unreachableError(await classifyAndReport(url));
    }
  };

  let res = await doFetch();

  if (res.status === 401 && auth && isBrowser()) {
    const attempt = await refreshOnce();
    if (attempt.outcome === "ok") {
      res = await doFetch();
    } else if (attempt.outcome === "rejected") {
      handleSessionExpired();
    } else {
      // The refresh got no usable answer, which is not the same as the
      // server saying the session is over — so the session stays. This
      // request fails the way any unreachable call does, and the next one
      // tries the refresh again.
      throw await refreshUnavailableError(attempt.answer);
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const envelope = data as
      | { error?: { code?: string; message?: string; reference?: string } }
      | undefined;

    // Send them to the one screen that can clear this, from wherever they
    // hit it. Still throws below — the caller's own error handling runs,
    // and the navigation is what actually resolves the state.
    if (res.status === 403 && envelope?.error?.code === PASSWORD_CHANGE_REQUIRED_CODE && auth) {
      handlePasswordChangeRequired();
    }
    // The bare throttler says only "ThrottlerException: Too Many Requests",
    // which is not copy to put in front of somebody. The OTP caps write
    // their own message (they know the window) and it is kept.
    const fallback =
      res.status === 429 ? rateLimitMessage(res) : `Request to ${path} failed (${res.status})`;
    const serverMessage = envelope?.error?.message;
    const message =
      res.status === 429 && (!serverMessage || /throttler|too many requests$/i.test(serverMessage))
        ? fallback
        : (serverMessage ?? fallback);
    // The server attaches a reference to 5xx only, and the message it
    // sends with one is deliberately generic ("Something went wrong") —
    // so without showing the reference, every 500 report is
    // indistinguishable from every other. Appended to the message rather
    // than left on the object because nineteen screens render
    // `err.message` straight into their error region and would otherwise
    // drop it silently; `.reference` is also on the error for anything
    // that wants to present it properly.
    const reference = envelope?.error?.reference;
    throw new ApiError(
      res.status,
      envelope?.error?.code ?? (res.status === 429 ? "RATE_LIMITED" : "ERROR"),
      reference ? `${message} (reference ${reference})` : message,
      reference,
    );
  }

  return data as T;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>("POST", path, body ?? {}, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>("PATCH", path, body ?? {}, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>("PUT", path, body ?? {}, options),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>("DELETE", path, undefined, options),
};

/** `true` when `NEXT_PUBLIC_USE_MOCK` is explicitly set — every domain module checks this before deciding real-vs-mock (see each file's top). Defaults to real (`false`) once the client points at a live `server/`. */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}
