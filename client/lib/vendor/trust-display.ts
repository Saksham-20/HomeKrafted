/**
 * What a storefront's figures are allowed to say.
 *
 * `VendorProfileService` computes `cancellationRate` on read and returns
 * `null` before anything has closed — which is the right shape, and it is
 * only half the question. A rate over a tiny denominator is not a small
 * fact, it is a **misleading** one: a demo kitchen with one delivered
 * order and one cancelled one rendered "50% Cancelled" in the same
 * typeface as its rating, next to its name and its face. Nobody reads
 * that as "two orders". On a platform whose whole pitch is trusting a
 * stranger's kitchen, that number costs a real person orders.
 *
 * So the rate is shown only once there is enough behind it to mean
 * something. Below the floor it is not a zero and not a dash — it is
 * absent, the same way `null` is, because "we have not seen enough yet"
 * and "we were never told" read identically to a buyer and neither should
 * be dressed up as a measurement.
 *
 * Pure and clock-free, and it lives here rather than in either client so
 * the storefront and the app cannot disagree about a number that is
 * somebody's reputation.
 */

/**
 * Orders that must have completed before a cancellation rate is quoted.
 *
 * Ten is a judgement, not a calculation: it is the point at which one
 * cancellation stops moving the figure by tens of percent. Raising it
 * hides more; lowering it publishes noise.
 */
export const MIN_ORDERS_FOR_CANCELLATION_RATE = 10;

export function showsCancellationRate(
  rate: number | null | undefined,
  ordersDelivered: number,
): rate is number {
  return typeof rate === "number" && ordersDelivered >= MIN_ORDERS_FOR_CANCELLATION_RATE;
}

/**
 * "1 order delivered", not "1 Orders delivered".
 *
 * The stat row hard-coded the plural label and read wrong for exactly the
 * kitchens it matters most for — the new ones.
 */
export function deliveredLabel(ordersDelivered: number): string {
  return ordersDelivered === 1 ? "Order delivered" : "Orders delivered";
}

/** "3 mo" under a year, "2 yr" over it. Whole units only — nobody says 1.4 years. */
export function tenureLabel(monthsActive: number): string {
  if (monthsActive >= 12) {
    const years = Math.floor(monthsActive / 12);
    return `${years} yr`;
  }
  return `${Math.max(0, monthsActive)} mo`;
}
