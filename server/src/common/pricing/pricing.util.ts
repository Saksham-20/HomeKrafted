/**
 * Server-authoritative cart/checkout money math — the exact port of
 * `client/lib/cart/pricing.ts`'s M3 mock business rules, now the single
 * place `CartService`/`OrdersService` compute subtotal → shipping from, so a
 * cart preview and the order actually charged can never drift. Real shipping rate cards are still a flat/free-threshold
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
 * The flat order-cashback rate, **switched off (2026-09-19, owner: "remove
 * cashback from wallet")**. It was 5% of the subtotal, credited when an order
 * reached `placed`.
 *
 * Kept at 0 rather than deleted, on purpose. `Order.cashbackEarned` is a
 * snapshot taken at checkout, and the credit (`payWithWallet`,
 * `markPaidByRazorpayTx`) and the reversal (`cancelOrder`, `refundOrder`) all
 * key off that stored value, never off this constant. An order sitting in
 * `pending_payment` when this shipped still carries a non-zero snapshot, and
 * it must be credited if paid and reversed if cancelled — symmetric, and what
 * the buyer was quoted. Deleting either half while such a row can exist pays
 * out (or claws back) money the other half never moved. At 0, every *new*
 * order snapshots 0, so no credit row and no reversal row is ever written for
 * it. The 3% top-up bonus is a different feature (`WalletService`) and is not
 * governed by this.
 */
export const CASHBACK_RATE = 0;

export function computeShipping(subtotal: number, rule: DeliveryRule): number {
  if (subtotal <= 0 || rule.deliveryFee <= 0) return 0;
  if (rule.freeDeliveryThreshold > 0 && subtotal >= rule.freeDeliveryThreshold) return 0;
  return rule.deliveryFee;
}

/**
 * What a new order earns back: nothing, while `CASHBACK_RATE` is 0. Still the
 * one function `CartService` (the `cashbackEstimate` field an installed native
 * build reads) and `OrdersService` (the snapshot) both call, so the two stay
 * equal if the rate is ever revived.
 */
export function computeCashback(subtotal: number): number {
  return Math.round(subtotal * CASHBACK_RATE);
}
