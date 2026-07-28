"use client";

/**
 * Wishlist store (M8.4a — real for the consumer role). Real mode:
 * `toggle`/`remove` call through `lib/api/wishlist.ts` to the owner-scoped
 * `/wishlist` endpoints (idempotent adds/removes server-side) and refetch
 * afterward; hydrates from `GET /wishlist` once the signed-in consumer
 * session is ready (`useAuth()`), same gating pattern as `CartContext`/
 * `WalletContext`. Every method stays synchronous/fire-and-forget at the
 * call site — no `useWishlist()` consumer needs to change.
 *
 * `NEXT_PUBLIC_USE_MOCK=true` keeps the exact pre-M8.4a behavior: a
 * `localStorage`-persisted list, no network calls, no auth gating.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addWishlistItem, getServerWishlist, removeWishlistItem } from "@/lib/api";
import { isMockMode } from "@/lib/api/http";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ID, WishlistItem } from "@/lib/types";

const STORAGE_KEY = "hk_wishlist_v1";

export interface WishlistContextValue {
  productIds: ID[];
  /** True once the wishlist (mock: localStorage; real: the signed-in consumer's `GET /wishlist`) has loaded. */
  ready: boolean;
  has: (productId: ID) => boolean;
  toggle: (productId: ID) => void;
  remove: (productId: ID) => void;
  count: number;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

function readStorage(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WishlistItem =>
        typeof item === "object" && item !== null && typeof (item as WishlistItem).productId === "string",
    );
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const mock = isMockMode();
  const { ready: authReady, isSignedIn, role } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Mock mode: hydrate from localStorage once, client-side only — exactly
  // pre-M8.4a (no auth gating). Deferred a tick via `Promise.resolve()`
  // (no real async data source), same reasoning as before.
  useEffect(() => {
    if (!mock) return;
    Promise.resolve().then(() => {
      setItems(readStorage());
      setReady(true);
      hydrated.current = true;
    });
  }, [mock]);

  // Real mode: wait for the auth session, then hydrate the signed-in
  // consumer's real wishlist. A seller/admin session (or signed-out)
  // renders an empty wishlist — this store is consumer-only.
  useEffect(() => {
    if (mock) return;
    if (!authReady) return;
    if (!isSignedIn || role !== "consumer") {
      // Deferred a tick to avoid a synchronous `setState` directly in the
      // effect body (`react-hooks/set-state-in-effect`).
      let cancelled = false;
      Promise.resolve().then(() => {
        if (cancelled) return;
        setItems([]);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    getServerWishlist().then((wishlist) => {
      if (cancelled) return;
      setItems(wishlist.items);
      setReady(true);
      hydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [mock, authReady, isSignedIn, role]);

  // Mock mode only — persist on every change, once initial hydration has
  // happened.
  useEffect(() => {
    if (!mock || !hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [mock, items]);

  const has = useCallback(
    (productId: ID) => items.some((item) => item.productId === productId),
    [items],
  );

  const toggle = useCallback(
    (productId: ID) => {
      const alreadyIn = items.some((item) => item.productId === productId);

      if (mock) {
        setItems((current) =>
          current.some((item) => item.productId === productId)
            ? current.filter((item) => item.productId !== productId)
            : [...current, { productId, addedAt: new Date().toISOString() }],
        );
        return;
      }

      const request = alreadyIn ? removeWishlistItem(productId) : addWishlistItem(productId);
      void request.then((wishlist) => setItems(wishlist.items));
    },
    [mock, items],
  );

  const remove = useCallback(
    (productId: ID) => {
      if (mock) {
        setItems((current) => current.filter((item) => item.productId !== productId));
        return;
      }
      void removeWishlistItem(productId).then((wishlist) => setItems(wishlist.items));
    },
    [mock],
  );

  const productIds = useMemo(() => items.map((item) => item.productId), [items]);

  const value: WishlistContextValue = {
    productIds,
    ready,
    has,
    toggle,
    remove,
    count: items.length,
  };

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}
