/**
 * Shared cart/checkout money math (M3 mock business rules — real shipping
 * rate cards and cashback ledgering move server-side in M8; this is the
 * one place both `/cart` and `/checkout` (and the mock `createOrder`)
 * compute the same numbers from, so the preview a shopper sees in the
 * cart never drifts from what actually gets charged at checkout).
 */

/**
 * The delivery rule, from platform settings (2026-09-15) — it was a
 * hardcoded ₹49 under ₹999, mirrored on the server. Both sides now read
 * `deliveryFee` / `freeDeliveryThreshold` from `/admin/settings`, and the
 * server's figure is the one charged.
 */
export interface DeliveryRule {
  /** Flat fee per order, ₹. 0 = delivery is free. */
  deliveryFee: number;
  /** Orders at or above this subtotal deliver free, ₹. 0 = no free-delivery offer. */
  freeDeliveryThreshold: number;
}

/** What mock mode and an older server that doesn't send the rule use — the server's own defaults. */
export const DEFAULT_DELIVERY_RULE: DeliveryRule = { deliveryFee: 0, freeDeliveryThreshold: 999 };

/**
 * Platform-wide flat cashback rate (matches `lib/data/products.ts`'s
 * documented 5% flat rate, and the Home page's "Earn 5% cashback on
 * every order" wallet promo copy). Hampers don't carry their own
 * `cashbackPct`, so this flat rate is what lets hamper lines earn
 * cashback too.
 */
export const CASHBACK_RATE = 0.05;

export function computeShipping(subtotal: number, rule: DeliveryRule): number {
  if (subtotal <= 0 || rule.deliveryFee <= 0) return 0;
  if (rule.freeDeliveryThreshold > 0 && subtotal >= rule.freeDeliveryThreshold) return 0;
  return rule.deliveryFee;
}

/** The "free delivery over ₹X" line, or nothing when there is no such offer to state. */
export function freeDeliveryHint(rule: DeliveryRule | undefined, shipping: number): number | undefined {
  if (!rule || shipping <= 0 || rule.freeDeliveryThreshold <= 0) return undefined;
  return rule.freeDeliveryThreshold;
}

export function computeCashback(subtotal: number): number {
  return Math.round(subtotal * CASHBACK_RATE);
}
