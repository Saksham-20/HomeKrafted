/**
 * Commission arithmetic for seller-facing screens (M37).
 *
 * The rate always comes from the server — `GET /seller/me` carries
 * `commission: { pct, enabled }` — never a hardcoded percentage. These
 * helpers only do the arithmetic on it, mirroring the server's
 * `payout-split.ts` (round half-up to paise, net derived by subtraction
 * so the three figures always reconcile).
 */

export interface CommissionBreakdown {
  /** What the customer pays. */
  gross: number;
  /** The platform's cut at `pct`. */
  commission: number;
  /** What the HomeKrafter receives: `gross − commission`, exact to the paisa. */
  net: number;
}

/** Money rounded to paise, half-up — same rule as the server's split. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function commissionBreakdown(price: number, pct: number): CommissionBreakdown {
  const gross = round2(price);
  const commission = round2((gross * pct) / 100);
  return { gross, commission, net: round2(gross - commission) };
}

/**
 * The inverse question a HomeKrafter actually asks: "what do I list at
 * to take home ₹N?" Ceils to the whole rupee — a listing price of
 * ₹333.34 reads as a rounding error, and ceiling means the take-home is
 * never *under* the target.
 */
export function priceForTarget(net: number, pct: number): number {
  if (pct >= 100) return Infinity;
  return Math.ceil(net / (1 - pct / 100));
}
