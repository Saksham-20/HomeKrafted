"use client";

/**
 * Client-side cart store (M3) — the first real cross-page state in the
 * app. There is no backend yet, so this is a React context that persists
 * to `localStorage`, keeping its shape aligned with the `CartItem`/`Cart`
 * types in `lib/types/marketplace.ts` so M8 can lift the same shape
 * server-side (swap the localStorage read/write for a `fetch` against a
 * real `/api/cart`, keep every `useCart()` call site unchanged).
 *
 * Two things live here beyond the literal `CartItem[]`:
 *  - `hampers`: assembled `Hamper` records the Hamper builder hands off
 *    (a hamper is one cart line — `CartItem.hamperId` — but its full
 *    contents need to survive navigation to `/cart`/`/checkout` too).
 *  - `lineInfo()`: resolves a line (product-or-hamper) to display data
 *    (name/image/price). It reads the product catalog once via
 *    `lib/api` on mount rather than the cart items carrying price
 *    snapshots — matches how every other screen sources catalog data.
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
import { getHamperBoxes, getProducts } from "@/lib/api";
import type { CartItem, Hamper, HamperBox, ID, Product } from "@/lib/types";

const STORAGE_KEY = "hk_cart_v1";

interface StoredCartState {
  items: CartItem[];
  hampers: Record<string, Hamper>;
}

export interface CartLineInfo {
  name: string;
  imageLabel: string;
  imageRatio: string;
  weightLabel?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isHamper: boolean;
  /** Stock cap for a product line — omitted (unbounded) for hamper lines. */
  maxQuantity?: number;
}

export interface CartContextValue {
  items: CartItem[];
  hampers: Record<string, Hamper>;
  /** True once the product/hamper-box catalog needed for pricing has loaded. */
  ready: boolean;
  addItem: (productId: ID, sku: string, quantity?: number) => void;
  updateQty: (itemId: ID, quantity: number) => void;
  removeItem: (itemId: ID) => void;
  assignAddress: (itemId: ID, addressId: ID | undefined) => void;
  /** Hands an assembled hamper off from `/hamper` into the cart as one line; returns the new hamper's id. */
  addHamperItem: (hamper: Omit<Hamper, "id" | "userId" | "createdAt">) => ID;
  clear: () => void;
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hampers, setHampers] = useState<Record<string, Hamper>>({});
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [boxes, setBoxes] = useState<HamperBox[]>([]);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  // Hydrate from localStorage + load the catalog once, client-side only
  // (avoids an SSR/client markup mismatch — server always renders the
  // empty-cart state, then this fills in a moment after mount). The
  // localStorage read itself is synchronous (no setState), but every
  // resulting `setState` call is deferred into the catalog-load promise's
  // callback rather than called directly in the effect body.
  useEffect(() => {
    const stored = readStorage();
    Promise.all([getProducts(), getHamperBoxes()]).then(([products, hamperBoxes]) => {
      setItems(stored.items);
      setHampers(stored.hampers);
      setCatalog(products);
      setBoxes(hamperBoxes);
      setReady(true);
      hydrated.current = true;
    });
  }, []);

  // Persist on every change, once initial hydration has happened (so we
  // don't clobber existing storage with the empty pre-hydration state).
  useEffect(() => {
    if (!hydrated.current) return;
    const state: StoredCartState = { items, hampers };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [items, hampers]);

  const addItem = useCallback((productId: ID, sku: string, quantity = 1) => {
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
  }, []);

  const updateQty = useCallback((itemId: ID, quantity: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((itemId: ID) => {
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
  }, []);

  const assignAddress = useCallback((itemId: ID, addressId: ID | undefined) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, addressId } : item)),
    );
  }, []);

  const addHamperItem = useCallback(
    (hamper: Omit<Hamper, "id" | "userId" | "createdAt">) => {
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
    },
    [],
  );

  const clear = useCallback(() => {
    setItems([]);
    setHampers({});
  }, []);

  const lineInfo = useCallback(
    (item: CartItem): CartLineInfo => {
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
          imageLabel: "hamper_gift_box.jpg — assembled",
          imageRatio: "1/1",
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
        weightLabel: weight?.label,
        unitPrice: weight?.price ?? 0,
        quantity: item.quantity,
        lineTotal: (weight?.price ?? 0) * item.quantity,
        isHamper: false,
        maxQuantity: weight?.stock,
      };
    },
    [catalog, boxes, hampers],
  );

  const count = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + lineInfo(item).lineTotal, 0),
    [items, lineInfo],
  );

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
