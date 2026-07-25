"use client";

/**
 * Mock auth store (M7a) — there is no real backend session yet (Auth.js
 * lands in M8). This is a small `localStorage`-persisted "is the demo
 * user signed in" flag, hydrated post-mount the same way as
 * `CartContext`/`WalletContext`/`WishlistContext` (server always renders
 * the same starting state, then this corrects itself a moment after
 * mount — no markup-mismatch risk since the starting state is identical
 * on both sides here: signed in).
 *
 * Every sign-in path on `/login` (phone OTP verify, email continue, a
 * social button, or "sign in as demo user") converges on this one
 * `signIn()` call and the single seeded `currentUser` record from
 * `lib/data/user` — there's no real credential check yet, `provider` is
 * only kept for bookkeeping/telemetry parity with `AuthProvider` (the
 * *type*, `lib/types/shared.ts`) once real auth lands. Account screens
 * are built to *assume* the demo user is signed in (per the M7a brief) —
 * that's why the default, both server-rendered and pre-hydration, is
 * `true`; `signOut()` (Profile page) is the only way to flip it, and it
 * persists across reloads until `signIn()` is called again (e.g. from
 * `/login`).
 *
 * M8 swaps this for real Auth.js sessions (`useSession()` client-side,
 * server session reads for route protection) without changing any
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
import { currentUser } from "@/lib/data";
import type { AuthProvider as AuthProviderKind, User } from "@/lib/types";

const STORAGE_KEY = "hk_auth_v1";

export interface AuthContextValue {
  user: User | undefined;
  isSignedIn: boolean;
  /** True once localStorage has been read on the client. */
  ready: boolean;
  signIn: (provider?: AuthProviderKind) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStorage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // fresh browser: account pages assume signed in
    const parsed = JSON.parse(raw) as { signedIn?: boolean };
    return parsed.signedIn ?? true;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(true);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Deferred a tick via `Promise.resolve().then()` — same reasoning as
  // `WishlistContext`'s hydration effect: keeps the same async-hydration
  // shape Cart/Wallet get for free from a real fetch, satisfying the
  // `react-hooks/set-state-in-effect` rule without a fake dependency.
  useEffect(() => {
    Promise.resolve().then(() => {
      setSignedIn(readStorage());
      setReady(true);
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ signedIn }));
  }, [signedIn]);

  function signIn(provider?: AuthProviderKind) {
    void provider; // bookkeeping only for now — see comment above; every path signs in as the one demo user until M8
    setSignedIn(true);
  }

  function signOut() {
    setSignedIn(false);
  }

  const value: AuthContextValue = {
    user: signedIn ? currentUser : undefined,
    isSignedIn: signedIn,
    ready,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
