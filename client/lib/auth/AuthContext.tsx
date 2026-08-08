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
 * **Admin sign-in** — `/admin/login` runs a real `POST /auth/login` with
 * the credentials the visitor typed and then checks the role the server
 * returns, through the same `completeRealSignIn` tail every other sign-in
 * method uses. Before M17 that form discarded its inputs and signed in as
 * a hardcoded seeded admin, which on a publicly routable page was full
 * administrative access to anyone who found the URL. Admin stays
 * internal-only — not part of the public role chooser. Session restore on reload (`hydrate`
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
import { getMySeller } from "@/lib/api/seller";
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
  continueWithPassword as apiContinueWithPassword,
  requestOtpCode,
  socialLogin,
  verifyOtpCode,
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
import type { Seller, User, UserRole } from "@/lib/types";

/**
 * Which seeded demo HomeKrafter to sign in as.
 *
 * Was `SellerType`, back when the three accounts were three different
 * roles. They're all the same role now — this key just picks which seeded
 * kitchen you land in, so the demo can show accounts with different
 * specialties and different items.
 */
export type DemoHomeKrafter = "maker" | "laundry" | "snack";

const STORAGE_KEY = "hk_auth_v1";
const ROLE_COOKIE = "hk_role";
const ROLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/**
 * **No demo credentials live in this file, and none may be added back.**
 *
 * Until M17 it held the seeded consumer, seller and admin emails plus the
 * shared seed password, so the "continue as demo ___" buttons could sign
 * in without typing anything. This is a `"use client"` module, so all of
 * it was compiled into the public JavaScript bundle — on the live site,
 * `admin@homekrafted.example` and its password were readable with
 * view-source, and the seeded admin exists in production. That is full
 * administrative access to anyone who looked.
 *
 * The seeded accounts still exist and are still how the site is tested;
 * their credentials live in `docs/TESTING.md`, and a tester types them
 * into the ordinary sign-in form like anybody else.
 */

const SOCIAL_ACCOUNT_ID_KEY = "hk_social_account_ids_v1";

/** Client-side view preference for a signed-in seller — see the file header's "Seller dual-mode" section. Meaningless (`undefined`) for any other role. */
export type SellerMode = "shopping" | "selling";



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
  /**
   * The single-field form's one call (M25) — `POST /auth/continue`.
   *
   * Signs in or signs up from an identifier and a password. Resolves
   * `{ role, created }` so the caller can both redirect and decide
   * whether to show the "confirm the code we just sent" step. Throws for
   * every failure; see `lib/api/auth.ts#continueWithPassword` for how the
   * three that matter are told apart.
   */
  continueWithPassword: (input: {
    identifier: string;
    password: string;
    name?: string;
  }) => Promise<{ role: UserRole; created: boolean }>;
  /** Step 1 of the code route — `POST /auth/otp/request`. Takes a mobile number or an email. */
  requestOtp: (identifier: string) => Promise<void>;
  /** Step 2 of the code route — `POST /auth/otp/verify`; creates the account on first verify, and marks the identifier verified. Resolves the account's `role` so the caller can redirect (`/account` vs `/seller`). */
  verifyOtp: (identifier: string, code: string, name?: string) => Promise<UserRole>;
  /** Email sign-in — role-agnostic, tries `POST /auth/login` first, falls back to `POST /auth/register` when no account exists yet for that email (see `LoginClient`'s added password field). Works for both the shopper and seller tabs; the resulting `role` comes from the account, not from which tab was used — resolves it so the caller can redirect accordingly. */
  signInWithEmail: (email: string, password: string, name?: string) => Promise<UserRole>;
  /**
   * Sign in only — **never** creates an account. Used by the HomeKrafter
   * tab, where `signInWithEmail`'s sign-up fallback would turn a wrong
   * password into an attempt to register an email that already exists.
   */
  signInWithPassword: (email: string, password: string) => Promise<UserRole>;
  /** Explicit account creation (`/signup`'s shopper tab) — always `POST /auth/register`, no login-first fallback, so a duplicate email surfaces as a real error instead of silently signing the visitor into the existing account. */
  register: (name: string, email: string, password: string) => Promise<UserRole>;
  /** Consumer social sign-in (stub — see `lib/api/auth.ts#socialLogin`'s doc comment). Resolves the account's `role`. */
  signInSocial: (provider: "google" | "apple") => Promise<UserRole>;



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
  sellerType?: DemoHomeKrafter;
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
function demoSellerUserFor(type: DemoHomeKrafter): User {
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
function resolveDemoSeller(type: DemoHomeKrafter = "maker"): Seller | undefined {
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
  // Signed out until hydration proves otherwise — a visitor with no stored
  // session is a logged-out visitor. (Pre-launch this defaulted to a
  // signed-in demo consumer; see the hydrate() tail below.)
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<UserRole | undefined>(undefined);
  const [sellerType, setDemoHomeKrafter] = useState<DemoHomeKrafter | undefined>(undefined);
  const [sellerMode, setSellerModeState] = useState<SellerMode | undefined>(undefined);
  /**
   * The signed-in HomeKrafter's real `Seller` row (`GET /seller/me`).
   *
   * Fetched rather than looked up in `lib/data/sellers.ts`: a real
   * kitchen is not in the mock list, and the old lookup fell through to a
   * demo record, so every genuine HomeKrafter saw another kitchen's name
   * and `vendorId` in their own portal.
   */
  const [realSeller, setRealSeller] = useState<{ userId: string; seller?: Seller } | undefined>(
    undefined,
  );
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
        setDemoHomeKrafter(stored.signedIn && stored.role === "seller" ? stored.sellerType : undefined);
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
          setDemoHomeKrafter(undefined);
          setSellerModeState(me.role === "seller" ? (stored.sellerMode ?? "selling") : undefined);
          setReady(true);
          hydrated.current = true;
          return;
        } catch {
          clearSession();
        }
      }

      // No real session restored — signed out, whatever the local flags
      // say, and for every role.
      //
      // There used to be a "flagged seller / flagged admin, trust the
      // local flags" branch here, written when `/seller/*` and `/admin/*`
      // predated real sessions. Since M8.4b/M8.5 every real sign-in
      // persists one, so the only thing those branches could still fire
      // on was a session that had just failed to restore — and they
      // turned that into a *claim* of being signed in. The audit walked
      // it: an admin whose refresh token had expired got the admin shell,
      // every request inside it 401'd, `http.ts` bounced them to
      // `/login`, and `/login` — reading the same flags — told them
      // "You're all set, you're signed in to your Homekrafted admin
      // account" and offered "Go to the admin panel", which bounced
      // straight back. No sign-in form anywhere in the loop. Only the
      // "Sign out" button escaped it.
      //
      // Same rule as `getMySeller()`: anything derived from a session
      // must fail empty, never fall back to a fixture.
      clearSession();
      setSignedIn(false);
      setRole(undefined);
      setDemoHomeKrafter(undefined);
      setSellerModeState(undefined);
      setSessionUserState(undefined);
      setReady(true);
      hydrated.current = true;
      // Written here rather than left to the persist effect below.
      //
      // That effect is keyed on `signedIn` changing, and `signedIn`
      // starts at `false` — so landing here sets it to `false` again,
      // React bails out of the no-op update, no re-render happens and the
      // effect never runs. The stale `hk_auth_v1` and `hk_role` therefore
      // survived every failed restore, which is what made the loop above
      // permanent instead of self-healing on the next load.
      writeStorage({ signedIn: false, role: undefined });
      writeRoleCookie(undefined);
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

  async function requestOtp(identifier: string) {
    if (mock) return;
    setBusy(true);
    try {
      await requestOtpCode(identifier);
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
    setDemoHomeKrafter(undefined);
    if (result.user.role === "seller") {
      setSellerModeState((prev) => prev ?? "selling");
    } else {
      setSellerModeState(undefined);
    }
    // Write the `hk_role` cookie *synchronously*, before returning to the
    // caller (`LoginClient`'s `redirectForRole`, which immediately
    // `router.push`es). The persist effect below writes the same cookie,
    // but it only runs after this render commits — the push would already
    // be in flight, so `middleware.ts` would read a stale/absent `hk_role`
    // and bounce a freshly signed-in seller straight back to
    // `/login?role=seller`. Setting it here closes that race; the effect
    // then rewrites the identical value, which is a no-op.
    writeRoleCookie(result.user.role);
    return result.user.role;
  }

  async function verifyOtp(identifier: string, code: string, name?: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setDemoHomeKrafter(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      const result = await verifyOtpCode(identifier, code, name);
      return completeRealSignIn(result);
    } finally {
      setBusy(false);
    }
  }

  /**
   * The one call behind the single-field form.
   *
   * Everything interesting happens on the server — which of sign-in and
   * sign-up this turns out to be is its decision, not a branch the client
   * takes first, because taking it here would need a "does this account
   * exist" probe that nothing should expose.
   *
   * In mock mode this can't consult anything, so it reports `created:
   * false`: offline frontend work should land on the signed-in screen
   * rather than a verification step whose code will never arrive.
   */
  async function continueWithPassword(input: {
    identifier: string;
    password: string;
    name?: string;
  }): Promise<{ role: UserRole; created: boolean }> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setDemoHomeKrafter(undefined);
      return { role: "consumer", created: false };
    }
    setBusy(true);
    try {
      const result = await apiContinueWithPassword(input);
      return { role: completeRealSignIn(result), created: result.created };
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sign in, or fail. No account is ever created here.
   *
   * The HomeKrafter tab needs this because an account provisioned by
   * approving an application has **no password at all** (`authProviders:
   * ['phone']`), so `POST /auth/login` returns 401 for every password
   * they could type — and `signInWithEmail` would answer that 401 by
   * trying to register their existing email, producing a 409 that
   * explains nothing. The caller turns the 401 into a sentence pointing
   * at the phone tab instead.
   */
  async function signInWithPassword(email: string, password: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setDemoHomeKrafter(undefined);
      return "consumer";
    }
    setBusy(true);
    try {
      return completeRealSignIn(await loginWithEmail(email, password));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithEmail(email: string, password: string, name?: string): Promise<UserRole> {
    if (mock) {
      setSignedIn(true);
      setRole("consumer");
      setDemoHomeKrafter(undefined);
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
      setDemoHomeKrafter(undefined);
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
      setDemoHomeKrafter(undefined);
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
    setDemoHomeKrafter(undefined);
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
  const activeSessionUserId = activeSessionUser?.id;

  // Load the real seller record whenever a HomeKrafter session appears
  // (sign-in, or a reload that rehydrated one). Cleared for every other
  // role so a seller's kitchen can't linger after switching accounts.
  useEffect(() => {
    if (mock || !signedIn || role !== "seller" || !activeSessionUserId) return;
    let cancelled = false;
    void getMySeller().then((record) => {
      if (!cancelled) setRealSeller({ userId: activeSessionUserId, seller: record });
    });
    return () => {
      cancelled = true;
    };
  }, [mock, signedIn, role, activeSessionUserId]);

  // Keyed by the user it was fetched for, and read only when that still
  // matches — so a record can never survive into the next account's
  // session, which clearing it in the effect would have risked doing a
  // render late.
  const ownSeller =
    realSeller && realSeller.userId === activeSessionUserId ? realSeller.seller : undefined;

  const seller: Seller | undefined =
    signedIn && role === "seller"
      ? // The real record first. `getSellerByUserId` (mock) is kept only
        // for mock mode and the legacy local-only flip — never as a
        // fallback for a real session, because falling back there is what
        // showed one HomeKrafter another's kitchen.
        ownSeller ??
        (mock && activeSessionUser ? getSellerByUserId(activeSessionUser.id) : undefined) ??
        (mock ? resolveDemoSeller(sellerType) : undefined)
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
    continueWithPassword,
    requestOtp,
    verifyOtp,
    signInWithEmail,
    signInWithPassword,
    register,
    signInSocial,
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
