import type { Order, OrderGift, OrderItem, OrderShipment, PaymentMethod } from "@/lib/types";
import { currentUser, deliveryDateOptions, nextOrderNumber } from "@/lib/data";
import { computeCashback, computeShipping } from "@/lib/cart/pricing";

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
  lines: CreateOrderLineInput[];
  shipments: OrderShipment[];
  gift?: OrderGift;
  paymentMethod: PaymentMethod;
  /** How much of the total the shopper chose to pay from wallet balance. */
  walletApplied: number;
}

/**
 * In-memory mock order "table". Called from Checkout's client component,
 * so this runs in the browser tab, not on any server — it resets on a
 * hard reload/new tab, same caveat as `lib/data/orders.ts`'s sequence.
 */
const orders: Order[] = [];

/**
 * Mock order-placement mutation. Computes subtotal/shipping/cashback from
 * `lib/cart/pricing`'s shared rules, generates an id + order number, and
 * "persists" to an in-memory array — swap this body for a real POST
 * /api/orders call in M8 without touching any call site (Checkout just
 * awaits this and reads back the `Order`).
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
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

/**
 * Orders placed live in this browser tab's session (M7a) — read by
 * `lib/api/history.ts`'s `getOrderHistory()` alongside the seeded
 * `lib/data/orders.ts#seedOrders` history. Only ever sees anything when
 * called from the same client-bundle module instance that `createOrder`
 * ran in (i.e. `/account/orders` reached by client-side navigation after
 * a checkout, within the same tab) — a hard reload resets `orders` to
 * empty, same caveat as `createOrder` itself.
 */
export async function getPlacedOrders(): Promise<Order[]> {
  return orders;
}
