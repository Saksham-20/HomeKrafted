/**
 * Server-authoritative cart/checkout money math — the exact port of
 * `client/lib/cart/pricing.ts`'s M3 mock business rules, now the single
 * place `CartService`/`OrdersService` compute subtotal → shipping →
 * cashback from, so a cart preview and the order actually charged can
 * never drift. Real shipping rate cards are still a flat/free-threshold
 * rule (unchanged from the mock) — a carrier-rate integration is a future
 * milestone, not M8.1's.
 */

/** Flat shipping fee below the free-shipping threshold. */
export const SHIPPING_FEE = 49;

/** Orders at or above this subtotal ship free. */
export const FREE_SHIPPING_THRESHOLD = 999;

/**
 * Platform-wide flat cashback rate (matches `client/lib/data/products.ts`'s
 * documented 5% flat rate). Hampers don't carry their own `cashbackPct`,
 * so this flat rate is what lets hamper lines earn cashback too — same
 * reasoning as the client's `computeCashback`.
 */
export const CASHBACK_RATE = 0.05;

export function computeShipping(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

export function computeCashback(subtotal: number): number {
  return Math.round(subtotal * CASHBACK_RATE);
}
