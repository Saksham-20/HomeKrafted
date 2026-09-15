/**
 * Server-authoritative cart/checkout money math — the exact port of
 * `client/lib/cart/pricing.ts`'s M3 mock business rules, now the single
 * place `CartService`/`OrdersService` compute subtotal → shipping →
 * cashback from, so a cart preview and the order actually charged can
 * never drift. Real shipping rate cards are still a flat/free-threshold
 * rule (unchanged from the mock) — a carrier-rate integration is a future
 * milestone, not M8.1's.
 */

/**
 * The delivery rule, from platform settings (2026-09-15) — it was a
 * hardcoded ₹49 under ₹999. Passed in, never read here, so this stays a
 * pure function the cart and the order compute identically from.
 */
export interface DeliveryRule {
  /** Flat fee per order. 0 = delivery is free. */
  deliveryFee: number;
  /** Orders at or above this subtotal deliver free. 0 = no free-delivery offer. */
  freeDeliveryThreshold: number;
}

/**
 * Platform-wide flat cashback rate (matches `client/lib/data/products.ts`'s
 * documented 5% flat rate). Hampers don't carry their own `cashbackPct`,
 * so this flat rate is what lets hamper lines earn cashback too — same
 * reasoning as the client's `computeCashback`.
 */
export const CASHBACK_RATE = 0.05;

export function computeShipping(subtotal: number, rule: DeliveryRule): number {
  if (subtotal <= 0 || rule.deliveryFee <= 0) return 0;
  if (rule.freeDeliveryThreshold > 0 && subtotal >= rule.freeDeliveryThreshold) return 0;
  return rule.deliveryFee;
}

export function computeCashback(subtotal: number): number {
  return Math.round(subtotal * CASHBACK_RATE);
}
