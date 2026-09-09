"use client";

/**
 * Wishlist store (M8.4a — real for the consumer role). Real mode:
 * `toggle`/`remove` call through `lib/api/wishlist.ts` to the owner-scoped
 * `/wishlist` endpoints (idempotent adds/removes server-side) and refetch
 * afterward; hydrates from `GET /wishlist` once the signed-in consumer
 * session is ready (`useAuth()`), same gating pattern as `CartContext`/
 * `WalletContext`.
 *
 * **`toggle` and `remove` are awaited and they reject** (2026-09-06).
 * This header said the opposite — "every method stays
 * synchronous/fire-and-forget at the call site" — which was the defect,
 * written down as a feature: a refused press did nothing and said
 * nothing, so the heart read as a broken control. All four call sites
 * catch them now and map through `wishlistErrorMessage`.
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
// Imported from the module, not the `@/lib/api` barrel. This file is
// `"use client"` and sits in the root layout, so anything it imports
// ships to every page; through the barrel that was the *entire* API
// layer — admin, seller, meal plans, Razorpay — on the landing page.
import { addWishlistItem, getServerWishlist, removeWishlistItem } from "@/lib/api/wishlist";
import { isMockMode } from "@/lib/api/http";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ID, WishlistItem } from "@/lib/types";

const STORAGE_KEY = "hk_wishlist_v1";

export interface WishlistContextValue {
  productIds: ID[];
  /** True once the first read has settled **either way** (mock: localStorage; real: `GET /wishlist`). */
  ready: boolean;
  /**
   * The read failed. Kept apart from "the wishlist is empty" on purpose:
   * a screen saying "nothing saved yet" over somebody's saved listings is
   * the portal kit's own defect, and until 2026-09-06 a failed read here
   * never even set `ready` — `/account/wishlist` waited for ever.
   */
  loadFailed: boolean;
  has: (productId: ID) => boolean;
  /**
   * Resolves when the server has it; **rejects when it refuses**.
   *
   * `void promise.then(...)` with no `catch` until 2026-09-06 — the same
   * shape `addItem` had until 2026-09-03 and the other three cart
   * mutations had until the same day. The heart never lied (it flips off
   * the response) but a refused press did nothing and said nothing, which
   * reads as a broken control. Callers map it through
   * `wishlistErrorMessage`.
   */
  toggle: (productId: ID) => Promise<void>;
  remove: (productId: ID) => Promise<void>;
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
  const [loadFailed, setLoadFailed] = useState(false);
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
    getServerWishlist()
      .then((wishlist) => {
        if (cancelled) return;
        setItems(wishlist.items);
        setLoadFailed(false);
        hydrated.current = true;
      })
      .catch(() => {
        // `setReady(true)` used to live inside the `then`, so a rejected
        // read never set it and `/account/wishlist` waited for ever on its
        // loading state. Now the read settles either way and the failure
        // is a state the screen can render a Notice for — never the empty
        // one, which would say "nothing saved yet" over saved listings.
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
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
    async (productId: ID) => {
      const alreadyIn = items.some((item) => item.productId === productId);

      if (mock) {
        setItems((current) =>
          current.some((item) => item.productId === productId)
            ? current.filter((item) => item.productId !== productId)
            : [...current, { productId, addedAt: new Date().toISOString() }],
        );
        return;
      }

      // Awaited and unguarded: the rejection is the caller's to show. The
      // whole list comes back from the response, so nothing here merges —
      // a local merge is how a client's idea of a wishlist drifts from
      // the server's.
      const wishlist = alreadyIn
        ? await removeWishlistItem(productId)
        : await addWishlistItem(productId);
      setItems(wishlist.items);
      setLoadFailed(false);
    },
    [mock, items],
  );

  const remove = useCallback(
    async (productId: ID) => {
      if (mock) {
        setItems((current) => current.filter((item) => item.productId !== productId));
        return;
      }
      const wishlist = await removeWishlistItem(productId);
      setItems(wishlist.items);
      setLoadFailed(false);
    },
    [mock],
  );

  const productIds = useMemo(() => items.map((item) => item.productId), [items]);

  const value: WishlistContextValue = {
    productIds,
    ready,
    loadFailed,
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
