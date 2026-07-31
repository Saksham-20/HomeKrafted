import type { Order, OrderGift, OrderItem, OrderShipment, PaymentMethod } from "@/lib/types";
import { currentUser, deliveryDateOptions, nextOrderNumber } from "@/lib/data";
import { computeCashback, computeShipping } from "@/lib/cart/pricing";
import { http, isMockMode } from "./http";

/** Static content today — no delivery-date-options endpoint, this stays client-side (`docs/API.md`). */
export async function getDeliveryDateOptions() {
  return deliveryDateOptions;
}

export interface CreateOrderLineInput {
  productId?: string;
  sku?: string;
  hamperId?: string;
  name: string;
  quantity: number;
  price: number;
  addressId: string;
  giftWrap?: boolean;
}

export interface CreateOrderInput {
  /** Mock-mode-only — the real `POST /orders` derives every line from the caller's own server-side `Cart`, never a client-submitted line list (`docs/API.md` "Server-authoritative pricing"). Ignored in real mode. */
  lines: CreateOrderLineInput[];
  /** Real mode: which saved address unassigned lines ship to, if the caller didn't split every line explicitly. */
  defaultAddressId?: string;
  shipments: OrderShipment[];
  gift?: OrderGift;
  paymentMethod: PaymentMethod;
  /** Mock-mode-only display value — the real endpoint computes `walletApplied` itself from `paymentMethod`. */
  walletApplied: number;
}

/** Mock-mode-only in-memory order "table" — see `createOrder`'s doc comment. */
const orders: Order[] = [];

/**
 * Real mode: `POST /orders` — creates an order from the caller's current
 * server-side cart (`CartContext` keeps that in sync on every add/update/
 * remove, so by the time Checkout calls this the server cart already
 * matches what's on screen). Starts `status: "pending-payment"` for every
 * `paymentMethod` (see `docs/API.md`'s M8.2 seam notes) — a
 * `"wallet"`-paid order still needs an explicit `payOrder()` call
 * afterward (`CheckoutClient` does this), `"razorpay"` needs the Checkout
 * SDK + webhook, and `"cod"` has no follow-up transition yet (a
 * server-side gap flagged in `docs/API.md`, not fixable from the client).
 *
 * Mock mode keeps the pre-M8.4a in-memory placement (computes
 * subtotal/shipping/cashback from `input.lines`, starts `status: "placed"`
 * directly — no pending-payment staging in the mock).
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (isMockMode()) {
    const subtotal = input.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const shippingFee = computeShipping(subtotal);
    const cashbackEarned = computeCashback(subtotal);
    const total = subtotal + shippingFee;

    const items: OrderItem[] = input.lines.map((line, index) => ({
      id: `oi-${Date.now()}-${index}`,
      productId: line.productId,
      sku: line.sku,
      hamperId: line.hamperId,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      addressId: line.addressId,
      giftWrap: line.giftWrap ?? false,
    }));

    const shippingAddressIds = [...new Set(input.shipments.map((s) => s.addressId))];

    const order: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: nextOrderNumber(),
      userId: currentUser.id,
      status: "placed",
      items,
      shippingAddressIds,
      shipments: input.shipments,
      gift: input.gift,
      placedAt: new Date().toISOString(),
      subtotal,
      shippingFee,
      total,
      walletApplied: Math.min(input.walletApplied, total),
      cashbackEarned,
      refundStatus: "none",
      paymentMethod: input.paymentMethod,
    };

    orders.push(order);
    return order;
  }

  return http.post<Order>("/orders", {
    defaultAddressId: input.defaultAddressId,
    shipments: input.shipments,
    gift: input.gift,
    paymentMethod: input.paymentMethod,
  });
}

/** `GET /orders/:id` — owner-scoped full order detail. */
export async function getOrder(id: string): Promise<Order | undefined> {
  if (isMockMode()) return orders.find((o) => o.id === id);
  try {
    return await http.get<Order>(`/orders/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

/**
 * `POST /orders/:id/pay` — completes the `pending-payment -> placed` seam
 * for a `paymentMethod: "wallet"` order: debits the wallet, credits
 * cashback, atomically (`docs/API.md` "Orders (owner-scoped)"). Called by
 * `CheckoutClient` right after `createOrder()` when the shopper paid by
 * wallet — `402 INSUFFICIENT_BALANCE` if the live balance can't cover it
 * (a narrow race — the UI already gates the wallet option on a sufficient
 * balance).
 */
export async function payOrder(orderId: string, idempotencyKey?: string): Promise<Order> {
  return http.post<Order>(`/orders/${encodeURIComponent(orderId)}/pay`, undefined, { idempotencyKey });
}

/**
 * Real mode: `GET /orders` (mine, newest first) — every order of the
 * signed-in account, not just ones placed this session (unlike the
 * pre-M8.4a mock's in-memory array).
 */
export async function getPlacedOrders(): Promise<Order[]> {
  if (isMockMode()) return orders;
  const page = await http.get<{ items: Order[]; page: number; pageSize: number; total: number }>(
    "/orders",
    { query: { pageSize: 100 } },
  );
  return page.items;
}

/** One line of a reorder attempt that made it into the cart. */
export interface ReorderAdded {
  name: string;
  quantity: number;
}

/** One that didn't, and why — shown to the buyer rather than dropped silently. */
export interface ReorderSkipped {
  name: string;
  reason: string;
}

export interface ReorderResult {
  added: ReorderAdded[];
  skipped: ReorderSkipped[];
}

/**
 * `POST /orders/:id/reorder` (M15) — puts a past order back in the cart.
 *
 * Checked server-side against today's catalogue, so partial success is
 * the normal outcome: a home kitchen pauses items, sells out, and retires
 * weights between one order and the next. The caller must render
 * `skipped` — a reorder that quietly drops half the order is worse than
 * one that says which half.
 *
 * Mock mode has no server cart to add to, so it reports nothing added
 * rather than faking a result.
 */
export async function reorder(orderId: string): Promise<ReorderResult> {
  if (isMockMode()) return { added: [], skipped: [] };
  return http.post<ReorderResult>(`/orders/${encodeURIComponent(orderId)}/reorder`, {});
}
