/**
 * Shared cart/checkout money math (M3 mock business rules — real shipping
 * rate cards and cashback ledgering move server-side in M8; this is the
 * one place both `/cart` and `/checkout` (and the mock `createOrder`)
 * compute the same numbers from, so the preview a shopper sees in the
 * cart never drifts from what actually gets charged at checkout).
 */

/** Flat shipping fee below the free-shipping threshold. */
export const SHIPPING_FEE = 49;

/** Orders at or above this subtotal ship free. */
export const FREE_SHIPPING_THRESHOLD = 999;

/**
 * Platform-wide flat cashback rate (matches `lib/data/products.ts`'s
 * documented 5% flat rate, and the Home page's "Earn 5% cashback on
 * every order" wallet promo copy). Hampers don't carry their own
 * `cashbackPct`, so this flat rate is what lets hamper lines earn
 * cashback too.
 */
export const CASHBACK_RATE = 0.05;

export function computeShipping(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

export function computeCashback(subtotal: number): number {
  return Math.round(subtotal * CASHBACK_RATE);
}
