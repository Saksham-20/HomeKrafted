/**
 * Real session storage (M8.4a) — the one place the JWT access/refresh
 * token pair and the signed-in consumer's `PublicUser` snapshot live.
 * Split out of `AuthContext.tsx` so `lib/api/http.ts` (imported by every
 * domain `lib/api/*.ts` module, including from Server Components) can read
 * the current access token without importing a `"use client"` React
 * context module.
 *
 * **Several tabs share one session (2026-09-19).** `localStorage` is shared
 * by every tab of the origin, and the in-memory copy below is not — so a
 * tab whose memory said `R0` after another tab had rotated to `R1` posted
 * the dead `R0` to `/auth/refresh`, was refused, and wiped the storage the
 * healthy tab was still using. That was the admin "keeps getting logged
 * out". Three pieces keep the copies honest: a `storage` listener so memory
 * follows the store, `syncFromStorage()` for the moment a caller is about to
 * act on the refresh token and must not trust memory, and
 * `withRefreshLock()` so two tabs do not rotate the same token at once.
 *
 * **Token storage model**: the server (`server/src/auth/`) returns both
 * tokens in the JSON body — it never sets a cookie itself (confirmed:
 * `AuthController`'s `register`/`login`/`otp/verify`/`social/:provider`/
 * `refresh` all just return `{accessToken, refreshToken, user}`/
 * `{accessToken, refreshToken}`). Per the brief ("httpOnly cookie if the
 * server sets one, else a storage fallback"), since it doesn't set one:
 *  - Both tokens + the user snapshot persist to `localStorage`
 *    (`hk_session_v1`) so a hard reload survives without forcing a fresh
 *    login — the access token's own short TTL (15 min default) is the
 *    real safety net, and `http.ts` transparently refreshes on a `401`.
 *  - The access token is *also* mirrored into a plain, non-httpOnly
 *    `hk_access` cookie, same pattern and same explicitly-not-a-security-
 *    boundary caveat `middleware.ts`'s `hk_role` cookie already documents
 *    — it exists only so a Server Component running in `lib/api/*.ts`
 *    (e.g. public catalog reads that also want to attach a token when
 *    present) can read *a* token during SSR, where `localStorage` isn't
 *    reachable. Every genuinely owner-scoped read/write in this app (cart,
 *    wallet, wishlist, orders, addresses, referrals, notifications...) is
 *    fetched from a Client Component on mount instead (same pattern
 *    `OrdersListClient` already established pre-M8.4 for session-scoped
 *    data) specifically so it always uses the live, refreshable in-memory
 *    token rather than a possibly-stale SSR cookie snapshot.
 */

import type { AdminScope, User } from "@/lib/types";

export interface SessionUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "consumer" | "seller" | "admin";
  referralCode: string;
  createdAt: string;
  suspended?: boolean;
  /**
   * Whether the contact has been proved by a code (M25). Optional because
   * a session persisted before M25 has neither field, and treating a
   * missing value as `false` would tell a returning user their verified
   * address is unverified.
   */
  emailVerified?: boolean;
  phoneVerified?: boolean;
  /** Their profile picture, if they have chosen one (2026-09-04). */
  avatarSrc?: string;
  /**
   * The password on this account was issued by an admin and has to be
   * replaced before anything else works (M32).
   *
   * Optional for the same reason as the two above — a session persisted
   * before M32 has no such field, and a missing value must read as "no",
   * never as "yes", or every returning user is sent to a password screen
   * they do not need. The server enforces the real thing regardless
   * (`JwtAuthGuard`); this only decides where the browser goes.
   */
  mustChangePassword?: boolean;
  /**
   * Which parts of the admin panel this admin covers (M47).
   *
   * Optional for the same reason as the three above: a session persisted
   * before M47 has no such field. **A missing value must read as "all
   * sections", not "none"** — the opposite of the database column, and
   * deliberately so. On the server, empty means no access, and every
   * pre-M47 admin was backfilled with the full set so that could be the
   * safe direction. Here the value is only deciding which nav links to
   * draw, and the failure of guessing wrong is an operator staring at an
   * empty sidebar after a deploy. The server refuses every route
   * regardless.
   */
  adminScopes?: AdminScope[];
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const STORAGE_KEY = "hk_session_v1";
const ACCESS_COOKIE = "hk_access";
const REFRESH_LOCK_NAME = "hk-auth-refresh";
/** Slightly under the server's 15m default access-token TTL — see `.env.example`'s `JWT_ACCESS_TTL`. */
const ACCESS_COOKIE_MAX_AGE_S = 60 * 14;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// Module-scope in-memory cache — safe here because this module only ever
// runs the *mutation* path (`setSession`/`clearSession`) in the browser,
// one tab = one user. A Server Component render never calls these setters,
// only `getServerAccessToken()` below (request-scoped, reads the incoming
// cookie fresh every time — never this module-level variable).
//
// It is a per-tab **cache of `localStorage`, not a second source of truth**:
// the `storage` listener below keeps it following the store, and anything
// about to spend the refresh token calls `syncFromStorage()` first.
let memory: StoredSession | null = null;

/** What `localStorage` holds, or `null` for nothing usable. Never touches `memory`. */
function parseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadStoredSession(): StoredSession | null {
  if (!isBrowser()) return null;
  if (memory) return memory;
  try {
    const parsed = parseStored(window.localStorage.getItem(STORAGE_KEY));
    if (!parsed) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Re-read `localStorage` and make this tab's memory match it.
 *
 * `loadStoredSession()` answers from `memory` once it is set, which is
 * right for a render and wrong for the one decision that is expensive to
 * get wrong: which refresh token to present. The `storage` event below is
 * the ordinary way memory catches up, but it is a queued task and a
 * request can start before it runs, so this is the on-demand read.
 *
 * **Storage that cannot be read is not an empty session.** A blocked or
 * throwing `localStorage` (a locked-down profile) leaves memory as the only
 * copy there is; discarding it would sign somebody out because the *cache*
 * misbehaved.
 */
export function syncFromStorage(): StoredSession | null {
  if (!isBrowser()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memory;
  }
  memory = parseStored(raw);
  return memory;
}

type SessionChangeListener = (session: StoredSession | null) => void;
const sessionChangeListeners = new Set<SessionChangeListener>();

/**
 * Told when **another tab** changed the stored session — a sign-out, a
 * sign-in, a token rotation. `null` is the session having ended. Never
 * fired for this tab's own writes (the browser does not deliver a
 * `storage` event to the tab that caused it), which is what lets a
 * subscriber treat every call as news from elsewhere.
 */
export function onSessionChangedElsewhere(listener: SessionChangeListener): () => void {
  sessionChangeListeners.add(listener);
  return () => {
    sessionChangeListeners.delete(listener);
  };
}

function handleStorageEvent(event: StorageEvent): void {
  // `key === null` is `localStorage.clear()` — the session went with it.
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  memory = event.key === null ? null : parseStored(event.newValue);
  for (const listener of [...sessionChangeListeners]) listener(memory);
}

// Registered once at module load, browser only. HMR re-evaluating this file
// stacks a duplicate; the handler is idempotent, so that is harmless.
if (isBrowser()) {
  window.addEventListener("storage", handleStorageEvent);
}

/**
 * Run `work` while no other tab is refreshing the same session.
 *
 * Without it every tab whose access token expired in the same minute
 * posted its own copy of the refresh token; the server rotates on first
 * use, so all but one of them was presenting a token that had just been
 * spent. Web Locks are origin-wide, so the second tab simply waits, then
 * re-reads storage and finds the first tab's result there.
 *
 * Feature-detected: where `navigator.locks` is missing the work runs
 * unguarded, and the caller's re-read of storage is the fallback.
 */
export async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  if (isBrowser() && typeof navigator !== "undefined" && navigator.locks?.request) {
    return await navigator.locks.request(REFRESH_LOCK_NAME, work);
  }
  return work();
}

export function getSession(): StoredSession | null {
  return isBrowser() ? (memory ?? loadStoredSession()) : null;
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getSession()?.refreshToken ?? null;
}

export function getSessionUser(): SessionUser | null {
  return getSession()?.user ?? null;
}

function writeAccessCookie(token: string | null) {
  if (!isBrowser()) return;
  if (token) {
    document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${ACCESS_COOKIE_MAX_AGE_S}; samesite=lax`;
  } else {
    document.cookie = `${ACCESS_COOKIE}=; path=/; max-age=0`;
  }
}

/** Full session replace — sign-in/social/OTP-verify/register. */
export function setSession(session: StoredSession): void {
  memory = session;
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  writeAccessCookie(session.accessToken);
}

/** Token-only replace after a `/auth/refresh` rotation — keeps the existing `user` snapshot. */
export function updateTokens(accessToken: string, refreshToken: string): void {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, accessToken, refreshToken });
}

export function updateSessionUser(user: SessionUser): void {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, user });
}

/**
 * Best-effort JWT `exp` decode (no signature verification — this only
 * decides whether it's worth *asking* the server for a fresh token, the
 * server is still the one actually enforcing expiry). Used by
 * `AuthContext`'s hydration to skip `POST /auth/refresh` when the stored
 * access token is still comfortably valid.
 *
 * **Why this matters**: `server/src/auth/auth.service.ts#refresh` hashes
 * the *newly-signed* JWT (`sub`+`role`+`iat`+`exp`, second-granularity) as
 * the `RefreshToken.tokenHash` unique key — two refresh calls for the same
 * user inside the same wall-clock second mint byte-identical tokens and
 * the second insert 500s on a unique-constraint violation (verified live:
 * `POST /auth/refresh` twice in a row `curl`'d back to back). That's a
 * server-side bug outside this milestone's scope (`server/` is untouched
 * by M8.4a) — the mitigation here is simply calling refresh far less
 * often, since a real page-navigation-triggered remount of `AuthProvider`
 * used to call it unconditionally on every mount.
 */
function decodeJwtExpMs(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the stored access token is missing, unparseable, or within `graceMs` of expiring (default 30s). */
export function isAccessTokenStale(token: string, graceMs = 30_000): boolean {
  const expMs = decodeJwtExpMs(token);
  if (expMs === null) return true;
  return Date.now() >= expMs - graceMs;
}

export function clearSession(): void {
  memory = null;
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  writeAccessCookie(null);
}

/** Maps the server's `PublicUser`-shaped `SessionUser` onto the app-wide `User` type. `walletId`/`loyaltyAccountId`/`authProviders` have no server equivalent yet — synthesized placeholders; nothing in the consumer UI dereferences them (wallet/loyalty state comes from `useWallet()`/`lib/api/referrals.ts`, not `user.walletId`). Shared by `AuthContext` and `lib/api/site.ts#getCurrentUser`/`updateUser`. */
export function toAppUser(sessionUser: SessionUser): User {
  return {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    phone: sessionUser.phone,
    avatarSrc: sessionUser.avatarSrc,
    authProviders: [],
    createdAt: sessionUser.createdAt,
    walletId: `wallet-${sessionUser.id}`,
    loyaltyAccountId: `loyalty-${sessionUser.id}`,
    referralCode: sessionUser.referralCode,
    role: sessionUser.role,
    suspended: sessionUser.suspended,
    mustChangePassword: sessionUser.mustChangePassword,
    adminScopes: sessionUser.adminScopes,
  };
}
