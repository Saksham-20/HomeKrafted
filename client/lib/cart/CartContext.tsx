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
 * directly).
 *
 * **Every mutation rejects, and every call site awaits it.** Until
 * 2026-09-06 all of them but `addItem` were `void promise.then(...)` with
 * no `catch`, so a refusal vanished and the screen carried on showing the
 * old number as though the change had landed — the same shape as the
 * `addItem` bug fixed on 2026-09-03, and the same shape `lib/api`'s M36
 * rule exists to stop. `addHamperItem` has always returned a `Promise<ID>`,
 * because a hamper's id doesn't exist until the server creates it.
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
// Imported from the module, not the `@/lib/api` barrel. This file is
// `"use client"` and sits in the root layout, so anything it imports
// ships to every page; through the barrel that was the *entire* API
// layer — admin, seller, meal plans, Razorpay — on the landing page.
import {
  addCartItem,
  addHamperCartItem,
  assignCartItemAddress,
  clearServerCart,
  getServerCart,
  removeCartItem,
  updateCartItemQty,
} from "@/lib/api/cart";
import { getProducts } from "@/lib/api/products";
import { FOOD_COMING_SOON, FOOD_COMING_SOON_MESSAGE, mockFoodOrdersOpen } from "@/lib/food-launch";
import { getVendors } from "@/lib/api/vendors";
import { getHamperBoxes } from "@/lib/api/site";
import { ApiError, isMockMode } from "@/lib/api/http";
import { CART_OTHER_MAKER } from "@/lib/cart/add-error";
import { useAuth } from "@/lib/auth/AuthContext";
import type {
  CartItem,
  CartLineMaker,
  DietaryTag,
  Hamper,
  HamperBox,
  ID,
  Product,
  ProductKind,
  ServerCartLine,
} from "@/lib/types";

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
  kind?: ProductKind;
  dietary?: DietaryTag[];
  maker?: CartLineMaker;
}

export interface CartContextValue {
  items: CartItem[];
  hampers: Record<string, Hamper>;
  /** True once the first read has settled **either way** (mock: + product/hamper-box catalog). */
  ready: boolean;
  /**
   * The read failed, kept apart from an empty cart (2026-09-06).
   *
   * `getServerCart().then(...)` had no rejection handler and set `ready`
   * only on success — the sixth instance of one defect, after
   * `WishlistContext`, `WalletContext`, both order screens and the
   * subscriptions list. Three things came out of it: an unhandled
   * rejection on **every page** (the providers are in the root layout),
   * `ready` stuck false so `/cart` and `/checkout` waited for ever, and —
   * the one that costs money — a cart somebody had filled rendering as
   * empty.
   */
  loadFailed: boolean;
  /** Re-runs the failed first read. */
  retryLoad: () => void;
  /**
   * Resolves once the server has the line; **rejects when it refuses**
   * (signed-out, delisted, over stock). Until 2026-09-03 this was
   * fire-and-forget with no `catch`, and every refusal vanished while
   * the button flipped to "Added ✓" — measured on production against
   * sixteen listings whose only size had `stock: 0`. Callers show the
   * rejection (`lib/cart/add-error.ts`) and must not flip to "added"
   * before it resolves. Mock mode resolves synchronously.
   */
  addItem: (productId: ID, sku: string, quantity?: number) => Promise<void>;
  updateQty: (itemId: ID, quantity: number) => Promise<void>;
  removeItem: (itemId: ID) => Promise<void>;
  assignAddress: (itemId: ID, addressId: ID | undefined) => Promise<void>;
  /** Hands an assembled hamper off from `/hamper` into the cart as one line. Real mode: `Promise<ID>` — the hamper doesn't exist until the server creates it. */
  addHamperItem: (hamper: Omit<Hamper, "id" | "userId" | "createdAt">) => ID | Promise<ID>;
  clear: () => Promise<void>;
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [hampers, setHampers] = useState<Record<string, Hamper>>({});
  const [serverLines, setServerLines] = useState<ServerCartLine[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  /** Mock mode only — so the one-maker refusal can name the maker. */
  const [makers, setMakers] = useState<Record<string, string>>({});
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
    Promise.all([getProducts(), getHamperBoxes(), getVendors()])
      .then(([products, hamperBoxes, vendors]) => {
        setItems(stored.items);
        setHampers(stored.hampers);
        setCatalog(products);
        setBoxes(hamperBoxes);
        setMakers(Object.fromEntries(vendors.map((v) => [v.id, v.name])));
        setLoadFailed(false);
        hydrated.current = true;
      })
      .catch(() => setLoadFailed(true))
      // Settles either way — mock mode too, so an offline dev session
      // does not sit on a loading state for ever.
      .finally(() => setReady(true));
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
    getServerCart()
      .then((cart) => {
        if (cancelled) return;
        applyServerCart(cart.items);
        setLoadFailed(false);
        hydrated.current = true;
      })
      .catch(() => {
        // Deliberately does NOT `applyServerCart([])`: an empty cart and
        // a cart we could not read look identical to the visitor, and one
        // of them is a basket they filled.
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mock, authReady, isSignedIn, role, applyServerCart, reloadToken]);

  const retryLoad = useCallback(() => {
    setReady(false);
    setLoadFailed(false);
    setReloadToken((token) => token + 1);
  }, []);

  // Mock mode only — persist on every change, once initial hydration has
  // happened.
  useEffect(() => {
    if (!mock || !hydrated.current) return;
    const state: StoredCartState = { items, hampers };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [mock, items, hampers]);

  const addItem = useCallback(
    async (productId: ID, sku: string, quantity = 1): Promise<void> => {
      if (mock) {
        /*
         * One basket, one maker — enforced here too, not only on the
         * server (`server/src/cart/one-maker-cart.ts`). Local dev runs
         * with `NEXT_PUBLIC_USE_MOCK=true`, so without this the rule
         * looks broken to the only people who can test it, and the
         * "empty basket & add this" branch is unreachable. Same code and
         * same sentence, so a screen cannot tell the two modes apart.
         */
        const adding = catalog.find((p) => p.id === productId);
        // Food is coming soon — refused here with the server's code and
        // sentence, for the same reason as the maker rule below.
        if (adding?.kind === "food" && !mockFoodOrdersOpen(process.env.NEXT_PUBLIC_FOOD_ORDERS_OPEN)) {
          throw new ApiError(409, FOOD_COMING_SOON, FOOD_COMING_SOON_MESSAGE);
        }
        const heldBy = items
          .map((item) => catalog.find((p) => p.id === item.productId))
          .find((p) => p && adding && p.vendorId !== adding.vendorId);
        if (heldBy) {
          const maker = makers[heldBy.vendorId] ?? "another maker";
          throw new ApiError(
            409,
            CART_OTHER_MAKER,
            `Your basket already has things from ${maker}. Finish that order first, or empty your basket to start one with this.`,
          );
        }
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
      const cart = await addCartItem(productId, sku, quantity);
      applyServerCart(cart.items);
    },
    [mock, applyServerCart, catalog, items, makers],
  );

  const updateQty = useCallback(
    async (itemId: ID, quantity: number): Promise<void> => {
      const safeQuantity = Math.max(1, quantity);
      if (mock) {
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, quantity: safeQuantity } : item)),
        );
        return;
      }
      const cart = await updateCartItemQty(itemId, safeQuantity);
      applyServerCart(cart.items);
    },
    [mock, applyServerCart],
  );

  const removeItem = useCallback(
    async (itemId: ID): Promise<void> => {
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
      const cart = await removeCartItem(itemId);
      applyServerCart(cart.items);
    },
    [mock, applyServerCart],
  );

  const assignAddress = useCallback(
    async (itemId: ID, addressId: ID | undefined): Promise<void> => {
      if (mock) {
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, addressId } : item)),
        );
        return;
      }
      const cart = await assignCartItemAddress(itemId, addressId);
      applyServerCart(cart.items);
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

  const clear = useCallback(async (): Promise<void> => {
    if (mock) {
      setItems([]);
      setHampers({});
      return;
    }
    await clearServerCart();
    applyServerCart([]);
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
          kind: line?.kind,
          dietary: line?.dietary,
          maker: line?.maker,
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
          kind: "craft",
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
        kind: product?.kind,
        dietary: product?.dietary,
        maker: product && makers[product.vendorId] ? { name: makers[product.vendorId] } : undefined,
      };
    },
    [mock, serverLines, catalog, boxes, hampers, makers],
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
    loadFailed,
    retryLoad,
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
