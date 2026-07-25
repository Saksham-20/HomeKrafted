"use client";

/**
 * Client-side wishlist store (M7a) — mirrors `lib/cart/CartContext.tsx`'s
 * shape exactly: a React context, hydrated post-mount from `localStorage`
 * (guards against an SSR/client markup mismatch, same as Cart/Wallet),
 * aligned with the `WishlistItem`/`Wishlist` shape in
 * `lib/types/marketplace.ts` so M8 can lift this same shape server-side
 * (swap the localStorage read/write for `fetch` calls against a real
 * `/api/wishlist`, keep every `useWishlist()` call site unchanged). There
 * is no backend yet, so `toggle`/`remove` just mutate local React state —
 * no `userId`/`Wishlist.id` wrapper is kept client-side (that's a server
 * concern once M8 lands); this context only ever deals in the `items[]`
 * list for the single demo user.
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
import type { ID, WishlistItem } from "@/lib/types";

const STORAGE_KEY = "hk_wishlist_v1";

export interface WishlistContextValue {
  productIds: ID[];
  /** True once localStorage has been read on the client (avoids a pre-hydration false-empty flash mattering for logic, not just display). */
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
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Hydrate from localStorage once, client-side only (same reasoning as
  // CartProvider/WalletProvider: the server always renders the empty
  // state, then this fills in a moment after mount). Deferred a tick via
  // `Promise.resolve().then()` — same "no synchronous setState in an
  // effect body" shape CartProvider/WalletProvider get for free from
  // their real `getProducts()`/`getWallet()` awaits; this store has no
  // async data source (it's pure localStorage), so this is the smallest
  // stand-in that keeps the same async-hydration shape and satisfies the
  // `react-hooks/set-state-in-effect` rule.
  useEffect(() => {
    Promise.resolve().then(() => {
      setItems(readStorage());
      setReady(true);
      hydrated.current = true;
    });
  }, []);

  // Persist on every change, once initial hydration has happened (so we
  // don't clobber existing storage with the pre-hydration empty state).
  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const has = useCallback(
    (productId: ID) => items.some((item) => item.productId === productId),
    [items],
  );

  const toggle = useCallback((productId: ID) => {
    setItems((current) => {
      if (current.some((item) => item.productId === productId)) {
        return current.filter((item) => item.productId !== productId);
      }
      return [...current, { productId, addedAt: new Date().toISOString() }];
    });
  }, []);

  const remove = useCallback((productId: ID) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

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
