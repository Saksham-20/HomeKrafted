/**
 * Commission arithmetic for seller-facing screens — the markup model
 * (2026-09-16, mirrors `server/src/common/pricing/commission.ts`).
 *
 * **A HomeKrafter names what they want to receive; the buyer pays that
 * plus Homekrafted's fee and the GST on it.** This reverses the old M37
 * deduction model (seller typed the buyer's price, the platform took its
 * cut out of it at payout) — the listing form already asks "you receive
 * ₹100 → customer pays ₹120" and this is the arithmetic behind that
 * sentence.
 *
 * **This is a preview only.** The rate always comes from the server —
 * `GET /seller/me` carries `commission: { pct, enabled, gstPct }`, never
 * a hardcoded percentage — and the buyer-facing price actually charged
 * is always computed server-side (`mapProduct`/`resolveCartLines`), never
 * here. This file exists only so a HomeKrafter sees what the customer
 * will pay *as they type a price*, before there is anything to fetch —
 * the same reasoning M46's storefront-discount input states the rupee
 * amount before the field. If this drifts from `commission.ts` on the
 * server, a HomeKrafter is shown one number while being charged another.
 */

export interface CommissionRate {
  /** Homekrafted's fee, as a percentage of the maker's base price. */
  pct: number;
  /** GST charged on that fee. */
  gstPct: number;
  /** Whether the fee is charged at all. Off means the buyer pays the base. */
  enabled: boolean;
}

export interface MarkupBreakdown {
  /** What the HomeKrafter wants to receive — their base, unchanged. */
  sellerWants: number;
  /** Homekrafted's fee on top. 0 while the rate is off. */
  commission: number;
  /** GST on that fee. 0 when there is no fee to tax. */
  gst: number;
  /** `sellerWants + commission + gst`, exact to the paisa — what the customer pays. */
  customerPrice: number;
}

/** Money rounded to paise, half-up — same rule as the server's split. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Seller-first pricing: a HomeKrafter types what they want to receive,
 * the fee (and GST on the fee) is added on top, and the listing price a
 * customer sees is the total.
 */
export function markupBreakdown(sellerWants: number, rate: CommissionRate): MarkupBreakdown {
  const wants = round2(sellerWants);
  if (!rate.enabled || rate.pct <= 0 || !Number.isFinite(wants) || wants <= 0) {
    const safe = Number.isFinite(wants) ? wants : 0;
    return { sellerWants: safe, commission: 0, gst: 0, customerPrice: safe };
  }
  const commission = round2((wants * rate.pct) / 100);
  // No fee, no tax on the fee — same rule as the server: a 0% commission
  // never leaves a GST rate looking like it was charged.
  const appliedGstPct = commission > 0 ? rate.gstPct : 0;
  const gst = round2((commission * appliedGstPct) / 100);
  return { sellerWants: wants, commission, gst, customerPrice: round2(wants + commission + gst) };
}

/**
 * Given a customer-facing price, deduce what the HomeKrafter's base was —
 * the inverse of `markupBreakdown`, for editing an existing listing where
 * only the customer price is known up front. Not exact to the paisa
 * against `markupBreakdown` itself (the components round independently
 * on the way up); good enough for a form default, never for money.
 */
export function sellerBaseFromCustomerPrice(customerPrice: number, rate: CommissionRate): number {
  if (!rate.enabled || rate.pct <= 0) return round2(customerPrice);
  const factor = 1 + (rate.pct / 100) * (1 + Math.max(0, rate.gstPct) / 100);
  return round2(customerPrice / factor);
}
