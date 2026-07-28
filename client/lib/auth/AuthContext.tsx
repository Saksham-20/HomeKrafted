"use client";

/**
 * Auth store (M8.4a real consumer auth, extended M8.5 for real seller
 * auth + the seller dual-mode switch; admin stays mock, M8.4b scope).
 *
 * **Consumer + seller** sign-in (phone OTP, email, social, "demo user"/
 * "demo seller") both go through real `POST /auth/*` calls
 * (`lib/api/auth.ts`) against `server/` — see that module + `docs/API.md`'s
 * "Auth model". `role` is no longer hardcoded per sign-in method; it's
 * read straight off the server's returned `user.role` (`"consumer"` or
 * `"seller"` — the JWT itself already carries `role`+`sellerId`, see
 * `server/src/auth/auth.service.ts#signTokenPair`). The resulting
 * `{accessToken, refreshToken, user}` is owned by `lib/auth/session.ts`
 * (in-memory + `localStorage` + a non-httpOnly `hk_access` cookie mirror
 * for Server Component reads — see that file's header for the full
 * rationale). `ready`/`isSignedIn`/`user`/`role`/`seller` keep the exact
 * same shape every call site already consumes; only what happens *inside*
 * sign-in/out changed.
 *
 * **Seller identity vs. seller data**: a signed-in seller's *account*
 * (`User.role === "seller"`, name/email/phone) is now real — but the
 * seller's *business* data (listings, orders, payouts — everything
 * `SellerShell`'s dashboard renders) is still `lib/data`/`lib/api/seller.ts`
 * mock (M8.4b, out of this milestone's scope). The bridge: the three
 * seeded demo sellers' server `User.id`s (`user-seller-demo` etc.,
 * `server/prisma/seed.ts`) were deliberately made to match the mock
 * `Seller.userId`s already seeded in `lib/data/sellers.ts` — so
 * `getSellerByUserId(sessionUser.id)` resolves the right mock `Seller`
 * record for whichever real seller account just signed in, no separate
 * "seller type" selection needed at sign-in time.
 *
 * **Seller dual-mode (M8.5)**: a signed-in seller's session grants both
 * `/seller/*` and full consumer shopping — see `middleware.ts`, which
 * gates purely on `role`, never on the mode below. `sellerMode`
 * (`"shopping" | "selling"`) is a client-side view preference only, not
 * a security boundary: it decides what the persistent header/shell toggle
 * offers next and which chrome a seller lands in by default, persisted in
 * the same `hk_auth_v1` localStorage blob as `role`/`sellerType` so it
 * survives a reload. `switchToShopping()`/`switchToSelling()` just flip
 * this flag — the calling UI (`HeaderClient`'s seller pill, `SellerShell`'s
 * topbar link) does the actual `router.push`.
 *
 * **Preserving the pre-M8.4 "fresh browser = signed in as the demo
 * consumer" default** (every M0–M7 screen was built assuming this): on
 * first mount, if there's no persisted explicit sign-out and no restorable
 * session, this transparently logs in as the seeded demo account
 * (`ananya.iyer@example.com` / `Passw0rd!123`, `server/prisma/seed.ts`) —
 * same UX as before, now backed by a real session instead of an assumed
 * one. Explicitly calling `signOut()` persists that choice (mirrors the
 * pre-M8.4 `StoredAuth.signedIn: false` shape exactly), so a reload after
 * signing out stays signed out instead of silently logging back in.
 *
 * **Admin sign-in (M8.4b)** — `signInAsAdmin` now also goes through a real
 * `POST /auth/login` against the seeded admin account
 * (`admin@homekrafted.example`, `server/prisma/seed.ts`), the same
 * `completeRealSignIn` tail every other real sign-in method uses; admin
 * stays internal-only (not part of the public role chooser) but is no
 * longer a pure local state flip. Session restore on reload (`hydrate`
 * below) no longer special-cases `role === "admin"` — a persisted admin
 * session restores through the exact same `loadStoredSession`/`getMe()`
 * path a consumer/seller session already does.
 *
 * **`NEXT_PUBLIC_USE_MOCK=true`** short-circuits every method below back
 * to the pre-M8.4a pure-local-state behavior (no network calls at all) —
 * see each method's `if (mock)` branch.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  adminUser,
  currentUser,
  getSellerByUserId,
  laundryPartnerUser,
  sellerUser,
  sellers,
  snackSellerUser,
} from "@/lib/data";
import {
  getMe,
  loginWithEmail,
  logoutSession,
  refreshSession,
  registerWithEmail,
  requestPhoneOtp,
  socialLogin,
  verifyPhoneOtp,
  type AuthResultDto,
} from "@/lib/api/auth";
import { isMockMode } from "@/lib/api/http";
import {
  clearSession,
  getRefreshToken,
  getSession,
  isAccessTokenStale,
  loadStoredSession,
  setSession,
  toAppUser,
  updateSessionUser,
  updateTokens,
  type SessionUser,
} from "@/lib/auth/session";
import type { Seller, SellerType, User, UserRole } from "@/lib/types";

const STORAGE_KEY = "hk_auth_v1";
const ROLE_COOKIE = "hk_role";
const ROLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/** Seeded demo consumer — `server/prisma/seed.ts`'s `DEMO_PASSWORD`, shared by every seeded account. Used for the "fresh browser" auto-sign-in + the explicit "Sign in as demo user" button. */
const DEMO_EMAIL = "ananya.iyer@example.com";
const DEMO_PASSWORD = "Passw0rd!123";

const SOCIAL_ACCOUNT_ID_KEY = "hk_social_account_ids_v1";

/** Client-side view preference for a signed-in seller — see the file header's "Seller dual-mode" section. Meaningless (`undefined`) for any other role. */
export type SellerMode = "shopping" | "selling";

/** The three seeded demo sellers' real emails (`server/prisma/seed.ts`) — every seeded account shares `DEMO_PASSWORD`, so "continue as demo maker/laundry/snack" is a real `POST /auth/login`, not a local state flip. */
const SELLER_DEMO_EMAILS: Record<SellerType, string> = {
  maker: "anjali@anjaliskitchen.example",
  laundry: "ravi@freshfoldlaundry.example",
  snack: "meera@meerassnackbox.example",
};

/** The seeded admin account (`server/prisma/seed.ts`) — shares `DEMO_PASSWORD` like every other seeded account. Used for "continue as demo admin" (M8.4b: a real `POST /auth/login`, not a local state flip). */
const ADMIN_EMAIL = "admin@homekrafted.example";

export interface AuthContextValue {
  user: User | undefined;
  /** Undefined when signed out. `"consumer"` for the shopper flow, `"seller"` for a real (or demo) seller account. */
  role: UserRole | undefined;
  /** Populated only when `role === "seller"` — the signed-in seller's owner-scoping record (`Seller.vendorId` etc.). */
  seller: Seller | undefined;
  /** Populated only when `role === "seller"` — the active dual-mode view, see the file header. `undefined` for consumer/admin. */
  sellerMode: SellerMode | undefined;
  isSignedIn: boolean;
  /** True once the session has been hydrated/bootstrapped on the client. */
  ready: boolean;
  /** True while a real network sign-in/sign-up call is in flight. */
  busy: boolean;
  /** Consumer phone sign-in, step 1 — `POST /auth/otp/request`. */
  requestOtp: (phone: string) => Promise<void>;
  /** Consumer phone sign-in, step 2 — `POST /auth/otp/verify`; creates the account on first verify. Resolves the account's `role` so the caller can redirect (`/account` vs `/seller`). */
  verifyOtp: (phone: string, code: string, name?: string) => Promise<UserRole>;
  /** Email sign-in — role-agnostic, tries `POST /auth/login` first, falls back to `POST /auth/register` when no account exists yet for that email (see `LoginClient`'s added password field). Works for both the shopper and seller tabs; the resulting `role` comes from the account, not from which tab was used — resolves it so the caller can redirect accordingly. */
  signInWithEmail: (email: string, password: string, name?: string) => Promise<UserRole>;
  /** Explicit account creation (`/signup`'s shopper tab) — always `POST /auth/register`, no login-first fallback, so a duplicate email surfaces as a real error instead of silently signing the visitor into the existing account. */
  register: (name: string, email: string, password: string) => Promise<UserRole>;
  /** Consumer social sign-in (stub — see `lib/api/auth.ts#socialLogin`'s doc comment). Resolves the account's `role`. */
  signInSocial: (provider: "google" | "apple") => Promise<UserRole>;
  /** "Sign in as demo user" — real login against the seeded demo consumer account. */
  signInDemo: () => Promise<UserRole>;
  /** "Continue as demo maker/laundry/snack" — real `POST /auth/login` against the matching seeded seller account (mock-mode: local state flip only). Resolves `"seller"`. */
  signInAsSeller: (type?: SellerType) => Promise<UserRole>;
  /** "Continue as demo admin" — real `POST /auth/login` against the seeded admin account (mock-mode: local state flip only), internal-only. Resolves `"admin"`. */
  signInAsAdmin: () => Promise<UserRole>;
  /** Flips a signed-in seller's active view to consumer shopping — persisted, does not navigate (callers `router.push` themselves). No-op for non-sellers. */
  switchToShopping: () => void;
  /** Flips a signed-in seller's active view to their dashboard — persisted, does not navigate. No-op for non-sellers. */
  switchToSelling: () => void;
  /** Re-fetches `GET /users/me` and updates the stored snapshot — called after a Profile edit. No-op for admin (mock) sessions. */
  refreshUser: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface StoredAuth {
  signedIn: boolean;
  role?: UserRole;
  /** Only meaningful when `role === "seller"` and there's no real session backing it (legacy/mock fallback — see `hydrate`). */
  sellerType?: SellerType;
  /** Only meaningful when `role === "seller"` — the persisted dual-mode view (M8.5), see file header. */
  sellerMode?: SellerMode;
}

function readStorage(): StoredAuth {
  if (typeof window === "undefined") return { signedIn: true, role: "consumer" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { signedIn: true, role: "consumer" }; // fresh browser: account pages assume signed in as consumer
    const parsed = JSON.parse(raw) as StoredAuth;
    return {
      signedIn: parsed.signedIn ?? true,
      role: parsed.role ?? "consumer",
      sellerType: parsed.sellerType,
      sellerMode: parsed.sellerMode,
    };
  } catch {
    return { signedIn: true, role: "consumer" };
  }
}

function writeStorage(stored: StoredAuth) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/** Mirrors `role` into `hk_role` so `middleware.ts` (server-side, no `localStorage` access) can gate `/seller/*`/`/admin/*`. Not a security boundary — see file header + `middleware.ts`. */
function writeRoleCookie(role: UserRole | undefined) {
  if (typeof document === "undefined") return;
  if (!role) {
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
    return;
  }
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=${ROLE_COOKIE_MAX_AGE_S}`;
}

/** The demo `User` record for each seller type — `resolveDemoSeller` looks the matching `Seller` up by whichever of these the signed-in `sellerType` points at. */
function demoSellerUserFor(type: SellerType): User {
  switch (type) {
    case "laundry":
      return laundryPartnerUser;
    case "snack":
      return snackSellerUser;
    default:
      return sellerUser;
  }
}

/** Resolves the seeded demo `Seller` (`lib/data/sellers.ts`) matching `type` — defaults to `"maker"` (`sl1`) when unset, e.g. a stale pre-M10b `localStorage` value with no `sellerType`. */
function resolveDemoSeller(type: SellerType = "maker"): Seller | undefined {
  const demoUser = demoSellerUserFor(type);
  return sellers.find((s) => s.userId === demoUser.id);
}

function applyAuthResult(result: AuthResultDto) {
  setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
}

/** Stable per-provider fake OAuth id so repeated "Continue with Google/Apple" clicks resolve to the same demo account in one browser (see `lib/api/auth.ts#socialLogin`'s stub-payload comment). */
function getOrCreateSocialAccountId(provider: "google" | "apple"): string {
  if (typeof window === "undefined") return `${provider}-ssr`;
  try {
    const raw = window.localStorage.getItem(SOCIAL_ACCOUNT_ID_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (map[provider]) return map[provider];
    const id = `${provider}-${crypto.randomUUID()}`;
    map[provider] = id;
    window.localStorage.setItem(SOCIAL_ACCOUNT_ID_KEY, JSON.stringify(map));
    return id;
  } catch {
    return `${provider}-${Date.now()}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mock = isMockMode();
  const [signedIn, setSignedIn] = useState(true);
  const [role, setRole] = useState<UserRole | undefined>("consumer");
  const [sellerType, setSellerType] = useState<SellerType | undefined>(undefined);
  const [sellerMode, setSellerModeState] = useState<SellerMode | undefined>(undefined);
  const [sessionUser, setSessionUserState] = useState<SessionUser | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);

  // Hydrate on mount: mock mode restores exactly the pre-M8.4 local-state
  // behavior. Real mode — now covering consumer, seller (M8.5) *and* admin
  // (M8.4b) — tries to restore/refresh a persisted real session first, or
  // auto-signs-in as the demo consumer — see file header.
  useEffect(() => {
    async function hydrate() {
      const stored = readStorage();

      if (mock) {
        setSignedIn(stored.signedIn);
        setRole(stored.signedIn ? stored.role : undefined);
        setSellerType(stored.signedIn && stored.role === "seller" ? stored.sellerType : undefined);
        setSellerModeState(stored.signedIn && stored.role === "seller" ? (stored.sellerMode ?? "selling") : undefined);
        setReady(true);
        hydrated.current = true;
        return;
      }

      // Consumer, seller, or admin — all 3 are real sessions now. Only calls
      // `POST /auth/refresh` when the stored access token is actually
      // stale (expired/near-expiry) — see `isAccessTokenStale`'s doc
      // comment for why calling it unconditionally on every mount tripped
      // a real server-side bug (a same-second repeat refresh 500s on a
      // `RefreshToken.tokenHash` unique-constraint collision, since fixed
      // with a random `jti` per signed token — `auth.service.ts`). A
      // still-valid access token is trusted as-is; `getMe()` (a plain
      // `GET`, not subject to that bug) still runs either way to catch a
      // `suspended` flip.
      const persisted = loadStoredSession();
      if (persisted) {
        try {
          if (isAccessTokenStale(persisted.accessToken)) {
            const tokens = await refreshSession(persisted.refreshToken);
            updateTokens(tokens.accessToken, tokens.refreshToken);
          }
          const me = await getMe();
          updateSessionUser(me);
          setSignedIn(true);
          setRole(me.role);
          setSessionUserState(me);
          setSellerType(undefined);
          setSellerModeState(me.role === "seller" ? (stored.sellerMode ?? "selling") : undefined);
          setReady(true);
          hydrated.current = true;
          return;
        } catch {
          clearSession();
        }
      }

      if (!stored.signedIn) {
        // Explicit prior sign-out — stay signed out.
        setSignedIn(false);
        setRole(undefined);
        setReady(true);
        hydrated.current = true;
        return;
      }

      if (stored.role === "seller") {
        // Flagged seller but no real session survived (stale pre-M8.5
        // localStorage, or a session that failed to restore above) —
        // fall back to the local flags, no network. A real
        // `signInAsSeller`/seller sign-in always persists a real session
        // (see below), so this is a defensive fallback, not the common
        // path.
        setSignedIn(true);
        setRole("seller");
        setSellerType(stored.sellerType);
        setSellerModeState(stored.sellerMode ?? "selling");
        setReady(true);
        hydrated.current = true;
        return;
      }

      if (stored.role === "admin") {
        // Flagged admin but no real session survived (stale pre-M8.4b
        // localStorage, or a session that failed to restore above) — same
        // defensive local-flags fallback as the seller branch above,
        // rather than falling through to the demo-consumer auto-sign-in
        // below.
        setSignedIn(true);
        setRole("admin");
        setReady(true);
        hydrated.current = true;
        return;
      }

      // Fresh browser (or a lost/expired session that was never explicitly
      // signed out of) — auto-sign-in as the seeded demo consumer, same
      // default UX every pre-M8.4 screen assumed.
      try {
        const result = await loginWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
        applyAuthResult(result);
        setSignedIn(true);
        setRole("consumer");
        setSessionUserState(result.user);
      } catch {
        setSignedIn(false);
        setRole(undefined);
      } finally {
        setReady(true);
        hydrated.current = true;
      }
    }

    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist role/signedIn/sellerMode (mock bookkeeping + the `hk_role`
  // cookie middleware reads) on every change, once initial hydration has
  // happened.
  useEffect(() => {
    if (!hydrated.current) return;
    writeStorage({ signedIn, role, sellerType, sellerMode });
    writeRoleCookie(signedIn ? role : undefined);
  }, [signedIn, role, sellerType, sellerMode]);

  async function requestOtp(phone: string) {
    if (mock) return;
    setBusy(true);
    try {
      await requestPhoneOtp(phone);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Shared tail of every real sign-in call (consumer or seller — role
   * comes from `result.user.role`, never from which tab/method was used).
   * A first-time seller sign-in defaults `sellerMode` to `"selling"`
   * (their dashboard); a repeat sign-in that already has a persisted mode
   * (`readStorage()` ran on mount, `sellerMode` state already reflects it)
   * keeps whatever the user last had active, since `setSellerModeState`
   * here only fires as `(prev) => prev ?? "selling"`.
   */
  function completeRealSignIn(result: AuthResultDto): UserRole {
    applyAuthResult(result);
    setSessionUserState(result.user);
    setSignedIn(true);
    setRole(result.user.role);
    setSellerType(undefined);
    if (result.user.role === "seller") {
      setSellerModeState((prev) => prev ?? "selling");
    } else {
      setSellerModeState(undefined);
    }
    return result.user.role;
  }

  async function verifyOtp(phone: string, code: string, name?: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setSellerType(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      const result = await verifyPhoneOtp(phone, code, name);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithEmail(email: string, password: string, name?: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setSellerType(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      let result: AuthResultDto;
      try {
        result = await loginWithEmail(email, password);
      } catch {
        // No account for this email yet — sign-up-or-sign-in fallback,
        // see `signInWithEmail`'s doc comment above. Only ever creates a
        // *consumer* account (`registerWithEmail` has no role param) —
        // an unrecognized email on the seller tab correctly fails rather
        // than silently minting a shopper account there; see
        // `LoginClient`'s seller-tab copy.
        result = await registerWithEmail(name?.trim() || email.split("@")[0], email, password);
      }
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  async function register(name: string, email: string, password: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setSellerType(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      const result = await registerWithEmail(name, email, password);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  async function signInSocial(provider: "google" | "apple"): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setSellerType(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      const providerAccountId = getOrCreateSocialAccountId(provider);
      const result = await socialLogin(provider, { providerAccountId });
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  async function signInDemo(): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setSellerType(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      const result = await loginWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Continue as demo maker/laundry/snack" — a real `POST /auth/login`
   * against the matching seeded seller account (M8.5; previously a local
   * state flip only). Mock mode keeps the pre-M8.5 local-only behavior,
   * same as every other sign-in method above.
   */
  async function signInAsSeller(type: SellerType = "maker"): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("seller");
      setSellerType(type);
      setSellerModeState((prev) => prev ?? "selling");
      return "seller";
    }
    setBusy(true);
    try {
      const result = await loginWithEmail(SELLER_DEMO_EMAILS[type], DEMO_PASSWORD);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Continue as demo admin" — a real `POST /auth/login` against the
   * seeded admin account (M8.4b; previously a local state flip only).
   * Mock mode keeps the pre-M8.4b local-only behavior, same as every
   * other sign-in method above.
   */
  async function signInAsAdmin(): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("admin");
      setSellerType(undefined);
      setSellerModeState(undefined);
      return "admin";
    }
    setBusy(true);
    try {
      const result = await loginWithEmail(ADMIN_EMAIL, DEMO_PASSWORD);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  /** No-op unless a seller is signed in — see `AuthContextValue.switchToShopping`'s doc comment. */
  function switchToShopping() {
    if (role !== "seller") return;
    setSellerModeState("shopping");
  }

  /** No-op unless a seller is signed in — see `AuthContextValue.switchToSelling`'s doc comment. */
  function switchToSelling() {
    if (role !== "seller") return;
    setSellerModeState("selling");
  }

  async function refreshUser() {
    if (mock || role === undefined) return;
    try {
      const me = await getMe();
      updateSessionUser(me);
      setSessionUserState(me);
    } catch {
      // best-effort — a transient failure here just leaves the last-known snapshot in place
    }
  }

  function signOut() {
    if (!mock && (role === "consumer" || role === "seller" || role === "admin")) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        void logoutSession(refreshToken).catch(() => {
          // best-effort revoke — the access token's own short TTL is the real backstop
        });
      }
      clearSession();
    }
    setSignedIn(false);
    setRole(undefined);
    setSellerType(undefined);
    setSellerModeState(undefined);
    setSessionUserState(undefined);
  }

  // Real sessions (consumer, seller, or admin) resolve their `User` snapshot
  // from the server response, not the mock `lib/data` records — `sessionUser`
  // (post sign-in, this render) falling back to `getSession()?.user`
  // (post-reload, before the hydrate effect's `setSessionUserState` has
  // run). `resolveDemoSeller`/`demoSellerUserFor`/`adminUser` are the
  // fallback only for a legacy local-only flip (mock mode, or the
  // defensive no-real-session-survived hydrate branch).
  const activeSessionUser = mock ? undefined : (sessionUser ?? getSession()?.user);

  const seller: Seller | undefined =
    signedIn && role === "seller"
      ? (activeSessionUser ? getSellerByUserId(activeSessionUser.id) : undefined) ??
        resolveDemoSeller(sellerType)
      : undefined;

  const user: User | undefined = !signedIn
    ? undefined
    : activeSessionUser
      ? toAppUser(activeSessionUser)
      : role === "admin"
        ? adminUser
        : role === "seller"
          ? demoSellerUserFor(sellerType ?? "maker")
          : mock
            ? currentUser
            : undefined;

  const value: AuthContextValue = {
    user,
    role: signedIn ? role : undefined,
    seller,
    sellerMode: signedIn && role === "seller" ? sellerMode : undefined,
    isSignedIn: signedIn,
    ready,
    busy,
    requestOtp,
    verifyOtp,
    signInWithEmail,
    register,
    signInSocial,
    signInDemo,
    signInAsSeller,
    signInAsAdmin,
    switchToShopping,
    switchToSelling,
    refreshUser,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
