"use client";

/**
 * Cart store (M8.4a — real for the consumer role). Real mode: every
 * mutation (`addItem`/`updateQty`/`removeItem`/`assignAddress`/
 * `addHamperItem`/`clear`) calls through `lib/api/cart.ts` to the owner-
 * scoped `/cart` endpoints, then refetches `GET /cart` and replaces local
 * state with the server's answer — the server is the only source of
 * truth for pricing/stock/line resolution now (`docs/API.md`'s
 * recommended M8.4 path: drop client-side `lineInfo()` catalog math
 * entirely and read the server's resolved `ServerCartLine` fields
 * directly). Every mutation is exposed as a synchronous, fire-and-forget
 * function (same signatures as before) — each just kicks off the async
 * server round trip and updates state when it resolves, so no call site
 * needs to `await` a cart mutation. The one exception is `addHamperItem`,
 * whose return type changes from a synchronous `ID` to a `Promise<ID>` —
 * a hamper's id genuinely doesn't exist until the server creates it,
 * and its one call site (`HamperBuilderClient`) already needed to wait
 * before navigating to `/checkout` anyway.
 *
 * `NEXT_PUBLIC_USE_MOCK=true` keeps the exact pre-M8.4a behavior: a
 * `localStorage`-persisted cart with client-side `lineInfo()` computed
 * from a separately-fetched product/hamper-box catalog, no network calls,
 * no auth gating.
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
import {
  addCartItem,
  addHamperCartItem,
  assignCartItemAddress,
  clearServerCart,
  getHamperBoxes,
  getProducts,
  getServerCart,
  removeCartItem,
  updateCartItemQty,
} from "@/lib/api";
import { isMockMode } from "@/lib/api/http";
import { useAuth } from "@/lib/auth/AuthContext";
import type { CartItem, Hamper, HamperBox, ID, Product, ServerCartLine } from "@/lib/types";

const STORAGE_KEY = "hk_cart_v1";

interface StoredCartState {
  items: CartItem[];
  hampers: Record<string, Hamper>;
}

export interface CartLineInfo {
  name: string;
  imageLabel: string;
  imageRatio: string;
  imageSrc?: string;
  weightLabel?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isHamper: boolean;
  /** Stock cap for a product line — omitted (unbounded) for hamper lines. */
  maxQuantity?: number;
  /**
   * M46 — the price before the maker's storefront sale, when one applied.
   * Server-resolved (`resolveCartLine`); the mock branch never sets it,
   * because mock mode has no vendor discount to apply and inventing one
   * here would make the offline cart disagree with the real one.
   */
  listUnitPrice?: number;
  discountPct?: number;
}

export interface CartContextValue {
  items: CartItem[];
  hampers: Record<string, Hamper>;
  /** True once the cart (mock: + product/hamper-box catalog) has loaded. */
  ready: boolean;
  addItem: (productId: ID, sku: string, quantity?: number) => void;
  updateQty: (itemId: ID, quantity: number) => void;
  removeItem: (itemId: ID) => void;
  assignAddress: (itemId: ID, addressId: ID | undefined) => void;
  /** Hands an assembled hamper off from `/hamper` into the cart as one line. Real mode: `Promise<ID>` — the hamper doesn't exist until the server creates it. */
  addHamperItem: (hamper: Omit<Hamper, "id" | "userId" | "createdAt">) => ID | Promise<ID>;
  clear: () => void;
  /**
   * Re-pull the server cart. Needed when something *other* than this
   * store changed it — M15's reorder adds lines server-side (it has to
   * check each one against today's stock and availability), so the
   * header badge and `/cart` would otherwise stay stale until a reload.
   * A no-op in mock mode, where this store is the only writer.
   */
  refresh: () => Promise<void>;
  count: number;
  subtotal: number;
  lineInfo: (item: CartItem) => CartLineInfo;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readStorage(): StoredCartState {
  if (typeof window === "undefined") return { items: [], hampers: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], hampers: {} };
    const parsed = JSON.parse(raw) as Partial<StoredCartState>;
    return { items: parsed.items ?? [], hampers: parsed.hampers ?? {} };
  } catch {
    return { items: [], hampers: {} };
  }
}

/** Strips a `ServerCartLine`'s resolved display fields back down to the base `CartItem` shape every call site outside this file already expects. */
function toCartItem(line: ServerCartLine): CartItem {
  return {
    id: line.id,
    productId: line.productId,
    sku: line.sku,
    hamperId: line.hamperId,
    quantity: line.quantity,
    giftWrap: line.giftWrap,
    addressId: line.addressId,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const mock = isMockMode();
  const { ready: authReady, isSignedIn, role } = useAuth();

  const [items, setItems] = useState<CartItem[]>([]);
  const [hampers, setHampers] = useState<Record<string, Hamper>>({});
  const [serverLines, setServerLines] = useState<ServerCartLine[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [boxes, setBoxes] = useState<HamperBox[]>([]);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  const applyServerCart = useCallback((lines: ServerCartLine[]) => {
    setServerLines(lines);
    setItems(lines.map(toCartItem));
  }, []);

  // Mock mode: hydrate from localStorage + load the catalog once,
  // client-side only (avoids an SSR/client markup mismatch), exactly as
  // pre-M8.4a — no auth gating.
  useEffect(() => {
    if (!mock) return;
    const stored = readStorage();
    Promise.all([getProducts(), getHamperBoxes()]).then(([products, hamperBoxes]) => {
      setItems(stored.items);
      setHampers(stored.hampers);
      setCatalog(products);
      setBoxes(hamperBoxes);
      setReady(true);
      hydrated.current = true;
    });
  }, [mock]);

  // Real mode: wait for the auth session, then hydrate the signed-in
  // consumer's real cart. A seller/admin session (or signed-out) renders
  // an empty cart — this store is consumer-only.
  useEffect(() => {
    if (mock) return;
    if (!authReady) return;
    if (!isSignedIn || role !== "consumer") {
      // Deferred a tick — same reasoning as `WishlistContext`'s mock-mode
      // hydration effect: avoids a synchronous `setState` directly in the
      // effect body (`react-hooks/set-state-in-effect`).
      let cancelled = false;
      Promise.resolve().then(() => {
        if (cancelled) return;
        applyServerCart([]);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    getServerCart().then((cart) => {
      if (cancelled) return;
      applyServerCart(cart.items);
      setReady(true);
      hydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [mock, authReady, isSignedIn, role, applyServerCart]);

  // Mock mode only — persist on every change, once initial hydration has
  // happened.
  useEffect(() => {
    if (!mock || !hydrated.current) return;
    const state: StoredCartState = { items, hampers };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [mock, items, hampers]);

  const addItem = useCallback(
    (productId: ID, sku: string, quantity = 1) => {
      if (mock) {
        setItems((current) => {
          const existing = current.find(
            (item) => item.productId === productId && item.sku === sku,
          );
          if (existing) {
            return current.map((item) =>
              item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item,
            );
          }
          return [...current, { id: genId("ci"), productId, sku, quantity }];
        });
        return;
      }
      void addCartItem(productId, sku, quantity).then((cart) => applyServerCart(cart.items));
    },
    [mock, applyServerCart],
  );

  const updateQty = useCallback(
    (itemId: ID, quantity: number) => {
      const safeQuantity = Math.max(1, quantity);
      if (mock) {
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, quantity: safeQuantity } : item)),
        );
        return;
      }
      void updateCartItemQty(itemId, safeQuantity).then((cart) => applyServerCart(cart.items));
    },
    [mock, applyServerCart],
  );

  const removeItem = useCallback(
    (itemId: ID) => {
      if (mock) {
        setItems((current) => {
          const target = current.find((item) => item.id === itemId);
          if (target?.hamperId) {
            setHampers((currentHampers) => {
              const next = { ...currentHampers };
              delete next[target.hamperId as string];
              return next;
            });
          }
          return current.filter((item) => item.id !== itemId);
        });
        return;
      }
      void removeCartItem(itemId).then((cart) => applyServerCart(cart.items));
    },
    [mock, applyServerCart],
  );

  const assignAddress = useCallback(
    (itemId: ID, addressId: ID | undefined) => {
      if (mock) {
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, addressId } : item)),
        );
        return;
      }
      void assignCartItemAddress(itemId, addressId).then((cart) => applyServerCart(cart.items));
    },
    [mock, applyServerCart],
  );

  const addHamperItem = useCallback(
    (hamper: Omit<Hamper, "id" | "userId" | "createdAt">): ID | Promise<ID> => {
      if (mock) {
        const id = genId("hp");
        const fullHamper: Hamper = {
          ...hamper,
          id,
          userId: "user-demo",
          createdAt: new Date().toISOString(),
        };
        setHampers((current) => ({ ...current, [id]: fullHamper }));
        setItems((current) => [...current, { id: genId("ci"), hamperId: id, quantity: 1 }]);
        return id;
      }

      return addHamperCartItem({
        boxId: hamper.boxId,
        items: hamper.items,
        giftNote: hamper.giftNote,
        wrap: hamper.wrap,
        ribbon: hamper.ribbon,
        nameCard: hamper.nameCard,
        recipientAddressId: hamper.recipientAddressId,
        hidePrice: hamper.hidePrice,
      }).then((cart) => {
        applyServerCart(cart.items);
        const newest = cart.items.filter((l) => l.hamperId).at(-1);
        return newest?.hamperId ?? newest?.id ?? genId("hp");
      });
    },
    [mock, applyServerCart],
  );

  const clear = useCallback(() => {
    if (mock) {
      setItems([]);
      setHampers({});
      return;
    }
    void clearServerCart().then(() => applyServerCart([]));
  }, [mock, applyServerCart]);

  const lineInfo = useCallback(
    (item: CartItem): CartLineInfo => {
      if (!mock) {
        const line = serverLines.find((l) => l.id === item.id);
        return {
          name: line?.name ?? "Item",
          imageLabel: line?.name ?? "item",
          imageRatio: "1/1",
          imageSrc: line?.imageSrc,
          weightLabel: line?.weightLabel,
          unitPrice: line?.unitPrice ?? 0,
          quantity: item.quantity,
          lineTotal: line?.lineTotal ?? 0,
          isHamper: line?.isHamper ?? Boolean(item.hamperId),
          maxQuantity: line?.maxQuantity,
          listUnitPrice: line?.listUnitPrice,
          discountPct: line?.discountPct,
        };
      }

      if (item.hamperId) {
        const hamper = hampers[item.hamperId];
        const box = boxes.find((b) => b.id === hamper?.boxId);
        const itemsTotal =
          hamper?.items.reduce((sum, hamperItem) => {
            const product = catalog.find((p) => p.id === hamperItem.productId);
            const weight =
              product?.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
              product?.weightOptions[0];
            return sum + (weight?.price ?? 0) * hamperItem.quantity;
          }, 0) ?? 0;
        const unitPrice = (box?.price ?? 0) + itemsTotal;
        return {
          name: box ? `${box.name} Gift Hamper` : "Gift Hamper",
          imageLabel: "Assembled gift hamper",
          imageRatio: "1/1",
          imageSrc: "/images/site/hero-hamper.jpg",
          unitPrice,
          quantity: item.quantity,
          lineTotal: unitPrice * item.quantity,
          isHamper: true,
        };
      }

      const product = catalog.find((p) => p.id === item.productId);
      const weight =
        product?.weightOptions.find((w) => w.sku === item.sku) ?? product?.weightOptions[0];
      return {
        name: product?.name ?? "Product",
        imageLabel: product?.images[0]?.placeholder ?? product?.name ?? "product",
        imageRatio: product?.images[0]?.ratio ?? "1/1",
        imageSrc: product?.images[0]?.src,
        weightLabel: weight?.label,
        unitPrice: weight?.price ?? 0,
        quantity: item.quantity,
        lineTotal: (weight?.price ?? 0) * item.quantity,
        isHamper: false,
        maxQuantity: weight?.stock,
      };
    },
    [mock, serverLines, catalog, boxes, hampers],
  );

  const count = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + lineInfo(item).lineTotal, 0),
    [items, lineInfo],
  );

  const refresh = useCallback(async () => {
    if (mock) return;
    const cart = await getServerCart();
    applyServerCart(cart.items);
  }, [mock, applyServerCart]);

  const value: CartContextValue = {
    items,
    hampers,
    ready,
    addItem,
    updateQty,
    removeItem,
    assignAddress,
    addHamperItem,
    clear,
    refresh,
    count,
    subtotal,
    lineInfo,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
