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
 * token. If the refresh itself fails (expired/revoked refresh token), the
 * session is cleared and the browser is redirected to `/login` — mirrors
 * a real session expiring. Refresh is only attempted in the browser (a
 * Server Component render has no refresh token available — see
 * `session.ts`); a server-side `401` just propagates as an `ApiError` for
 * the caller to handle (every M8.4a swap of an owner-scoped `lib/api`
 * function is called from a Client Component on mount specifically to
 * avoid this case in practice — see `session.ts`'s file header).
 *
 * **Error envelope**: server errors are `{ error: { code, message } }`
 * (`docs/API.md` "Conventions") — surfaced here as `ApiError` with
 * `.status`/`.code`/`.message` so callers can branch on `code` (e.g.
 * `INSUFFICIENT_BALANCE` on a wallet-pay attempt) without string-matching
 * the message.
 *
 * **Unreachable server**: a rejected `fetch` (offline, API down, DNS
 * gone) has no status and no envelope, so it became an `ApiError` with
 * status `0` and code `NETWORK_ERROR` rather than reaching the screens
 * as raw browser text. See the `catch` in `doFetch`.
 */

import { clearSession, getAccessToken, getRefreshToken, updateTokens } from "@/lib/auth/session";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

let refreshPromise: Promise<boolean> | null = null;

/** De-duplicated `/auth/refresh` — concurrent 401s from several in-flight requests only trigger one refresh call. Browser-only (see file header). */
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    updateTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function handleSessionExpired(): void {
  clearSession();
  if (isBrowser() && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
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
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Can't reach Homekrafted right now. Check your connection and try again.",
      );
    }
  };

  let res = await doFetch();

  if (res.status === 401 && auth && isBrowser()) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await doFetch();
    } else {
      handleSessionExpired();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const envelope = data as { error?: { code?: string; message?: string } } | undefined;
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
    throw new ApiError(
      res.status,
      envelope?.error?.code ?? (res.status === 429 ? "RATE_LIMITED" : "ERROR"),
      message,
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
