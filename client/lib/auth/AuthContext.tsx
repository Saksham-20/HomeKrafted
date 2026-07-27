"use client";

/**
 * Mock auth store (M7a, extended M10a) — there is no real backend session
 * yet (Auth.js lands in M8). This is a small `localStorage`-persisted
 * "who's signed in, as which role" store, hydrated post-mount the same
 * way as `CartContext`/`WalletContext`/`WishlistContext` (server always
 * renders the same starting state, then this corrects itself a moment
 * after mount — no markup-mismatch risk since the starting state is
 * identical on both sides here: signed in, as a consumer).
 *
 * Every sign-in path on `/login` (phone OTP verify, email continue, a
 * social button, or "sign in as demo user") converges on `signIn()` and
 * the single seeded consumer `currentUser` record from `lib/data/user`.
 * M10a added a second, parallel path: `/seller/login`'s "continue as
 * demo maker" calls `signInAsSeller("maker")`, which swaps the
 * signed-in identity to `lib/data/sellers#sellerUser` (a distinct
 * `User`, role `"seller"`) and exposes the matching `Seller` record.
 * M10b extends that same path to the other two `SellerType`s —
 * `signInAsSeller("laundry")`/`("snack")` resolve to
 * `laundryPartnerUser`/`snackSellerUser` instead — persisting which one
 * via a `sellerType` field alongside `role` so a reload while signed in
 * as, say, the laundry partner doesn't fall back to the maker. M11a adds
 * a third, parallel path: `/admin/login`'s "continue as demo admin"
 * calls `signInAsAdmin()`, which swaps the signed-in identity to
 * `lib/data/admin#adminUser` (role `"admin"`) — no `sellerType`-style
 * variant since there's only the one staff persona. All sign-in paths
 * are mutually exclusive — signing in one way replaces whichever
 * identity was active, same as a real app would only ever have one
 * active session.
 *
 * **Role gating today is mock, not secure.** Alongside `localStorage`,
 * every state change also mirrors `role` into a plain (non-httpOnly)
 * `hk_role` cookie purely so `middleware.ts` — which runs on the server
 * and has no access to `localStorage` — can read it and redirect
 * unauthorized `/seller/*`/`/admin/*` requests. This is explicitly
 * **not** a security boundary (a client can set any cookie value it
 * likes); M8 replaces both the cookie and this whole context with real
 * Auth.js sessions verified server-side, without changing any
 * `useAuth()` call site.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminUser, currentUser, laundryPartnerUser, sellerUser, sellers, snackSellerUser } from "@/lib/data";
import type {
  AuthProvider as AuthProviderKind,
  Seller,
  SellerType,
  User,
  UserRole,
} from "@/lib/types";

const STORAGE_KEY = "hk_auth_v1";
const ROLE_COOKIE = "hk_role";
const ROLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export interface AuthContextValue {
  user: User | undefined;
  /** Undefined when signed out. `"consumer"` for the shopper flow, `"seller"` once `signInAsSeller()` has run. */
  role: UserRole | undefined;
  /** Populated only when `role === "seller"` — the signed-in seller's owner-scoping record (`Seller.vendorId` etc.). */
  seller: Seller | undefined;
  isSignedIn: boolean;
  /** True once localStorage has been read on the client. */
  ready: boolean;
  /** Consumer sign-in — every `/login` method converges here. */
  signIn: (provider?: AuthProviderKind) => void;
  /**
   * Seller sign-in — `/seller/login`'s "continue as demo maker" /
   * "demo laundry partner" / "demo snack seller". `type` (default
   * `"maker"`) picks which of the three seeded demo sellers
   * (`lib/data/sellers.ts`) the session resolves to; persisted alongside
   * `role` so a page reload while signed in as, say, the laundry partner
   * doesn't fall back to the maker.
   */
  signInAsSeller: (type?: SellerType) => void;
  /** Admin sign-in — `/admin/login`'s "continue as demo admin". No variants (unlike `signInAsSeller`'s 3 types): there's only the one staff persona (`lib/data/admin#adminUser`). */
  signInAsAdmin: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface StoredAuth {
  signedIn: boolean;
  role?: UserRole;
  /** Only meaningful when `role === "seller"` — which of the 3 demo sellers (M10b). */
  sellerType?: SellerType;
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
    };
  } catch {
    return { signedIn: true, role: "consumer" };
  }
}

/** Mirrors `role` into `hk_role` so `middleware.ts` (server-side, no `localStorage` access) can gate `/seller/*`. See file header — not a security boundary, replaced by real sessions at M8. */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(true);
  const [role, setRole] = useState<UserRole | undefined>("consumer");
  const [sellerType, setSellerType] = useState<SellerType | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Deferred a tick via `Promise.resolve().then()` — same reasoning as
  // `WishlistContext`'s hydration effect: keeps the same async-hydration
  // shape Cart/Wallet get for free from a real fetch, satisfying the
  // `react-hooks/set-state-in-effect` rule without a fake dependency.
  useEffect(() => {
    Promise.resolve().then(() => {
      const stored = readStorage();
      setSignedIn(stored.signedIn);
      setRole(stored.signedIn ? stored.role : undefined);
      setSellerType(stored.signedIn && stored.role === "seller" ? stored.sellerType : undefined);
      setReady(true);
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const stored: StoredAuth = { signedIn, role, sellerType };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    writeRoleCookie(signedIn ? role : undefined);
  }, [signedIn, role, sellerType]);

  function signIn(provider?: AuthProviderKind) {
    void provider; // bookkeeping only for now — see comment above; every path signs in as the one demo consumer until M8
    setSignedIn(true);
    setRole("consumer");
    setSellerType(undefined);
  }

  function signInAsSeller(type: SellerType = "maker") {
    setSignedIn(true);
    setRole("seller");
    setSellerType(type);
  }

  function signInAsAdmin() {
    setSignedIn(true);
    setRole("admin");
    setSellerType(undefined);
  }

  function signOut() {
    setSignedIn(false);
    setRole(undefined);
    setSellerType(undefined);
  }

  const seller = signedIn && role === "seller" ? resolveDemoSeller(sellerType) : undefined;
  const user: User | undefined = !signedIn
    ? undefined
    : role === "seller"
      ? demoSellerUserFor(sellerType ?? "maker")
      : role === "admin"
        ? adminUser
        : currentUser;

  const value: AuthContextValue = {
    user,
    role: signedIn ? role : undefined,
    seller,
    isSignedIn: signedIn,
    ready,
    signIn,
    signInAsSeller,
    signInAsAdmin,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
