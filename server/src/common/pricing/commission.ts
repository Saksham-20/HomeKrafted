/**
 * The markup commission model (2026-09-16) — one pure module, no clock,
 * no database.
 *
 * **A HomeKrafter names what they want to receive; the buyer pays that
 * plus Homekrafted's fee.** Every stored catalogue price
 * (`WeightOption.price`/`mrp`, `MealPlan.pricePerMeal`) is the maker's
 * **base** — their take-home — and the buyer-facing figure is derived
 * from it here, server-side, on every read.
 *
 * This reverses M37's deduction model, on the owner's decision. Under
 * deduction the maker typed the buyer's price and the platform took its
 * cut out of it at payout; the listing form was rewritten on 2026-09-09
 * to the markup wording ("you receive ₹100 → customer pays ₹120") and
 * **nothing on the server moved with it**, so for a week the form
 * promised a maker ₹100, the buyer was charged ₹100, and the payout paid
 * ₹76.40. The number was wrong in both directions at once. The model
 * below is the one the form was already describing.
 *
 * Three rules ride on this file.
 *
 * **The base is stored; the buyer price is derived.** There is no
 * materialised buyer-price column to fall out of step, so an admin
 * changing the rate reprices the catalogue on the next read with no
 * backfill and no job. The cost is that every read path owes the markup —
 * which is why `markUp` takes a `CommissionRate` the caller must supply
 * rather than reading settings itself, and why `mapProduct` and
 * `resolveCartLine` take it as a **required** argument: a call site that
 * has not been updated is a compile error, not a wrong price.
 *
 * **An order records its own split.** A rate change must never move money
 * on an order already placed, so `OrderItem` stores what the buyer paid
 * *and* what the maker earns, computed once at checkout — the same shape
 * M37 gave `Payout`, for the same reason. The payout then sums a column
 * instead of re-deriving arithmetic against whatever the rate happens to
 * be on the day it is requested.
 *
 * **GST rides on the fee, never on the maker's goods.** The commission is
 * Homekrafted's service to the HomeKrafter and Indian GST applies to that
 * fee (`commissionGstPct`, default 18). The maker's own supply is theirs;
 * nothing here taxes it. No fee means no tax on the fee, so a 0% rate or
 * a disabled flag records an applied GST rate of 0 rather than leaving a
 * rate that was never charged sitting on the row.
 */

/** The rate in force, as read from `PlatformSettings`. */
export interface CommissionRate {
  /** Homekrafted's fee, as a percentage of the maker's base price. */
  pct: number;
  /** GST charged on that fee. */
  gstPct: number;
  /**
   * Whether the fee is charged at all. **Off means the buyer pays the
   * base** — the catalogue is priced at exactly what the maker typed —
   * so the switch is safe to flip in either direction without anybody
   * being charged for something they were not shown.
   */
  enabled: boolean;
}

/** What a buyer pays for one unit, and where each rupee of it goes. */
export interface PriceBreakdown {
  /** The maker's take-home — the figure they typed, and what they are paid. */
  base: number;
  /** Homekrafted's fee on top. 0 while the rate is off. */
  commission: number;
  /** GST on that fee. 0 when there is no fee to tax. */
  gst: number;
  /** `base + commission + gst`, exact to the paisa. What the buyer is charged. */
  buyerPrice: number;
  /** The rate *applied* — 0 while off, not the configured rate. */
  pct: number;
  /** The GST rate *applied* — 0 when no fee was charged. */
  gstPct: number;
}

/**
 * The rate that charges nothing. Used by surfaces that legitimately show
 * a maker their own base (the portal, the admin catalogue editor) and by
 * fixtures, so "no markup" is a named thing rather than a magic zero
 * somebody has to recognise.
 */
export const NO_COMMISSION: CommissionRate = { pct: 0, gstPct: 0, enabled: false };

/** Money rounded to paise, half-up — the rule the whole codebase uses. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Base → what the buyer pays.
 *
 * Each component is rounded before the total is summed from the rounded
 * parts, so `base + commission + gst === buyerPrice` holds exactly and an
 * invoice can print all four without a stray paisa.
 */
export function markUp(base: number, rate: CommissionRate): PriceBreakdown {
  const baseAmount = round2(base);

  // A non-finite or negative base is a corrupt row, not a price. Answer
  // the base unchanged rather than propagating NaN into an order total —
  // the caller's own validation is what refuses it, and a NaN that
  // reaches `Order.total` is a 500 with no explanation in it.
  if (!Number.isFinite(baseAmount) || baseAmount <= 0 || !rate.enabled || rate.pct <= 0) {
    const safeBase = Number.isFinite(baseAmount) ? baseAmount : 0;
    return { base: safeBase, commission: 0, gst: 0, buyerPrice: safeBase, pct: 0, gstPct: 0 };
  }

  const commission = round2((baseAmount * rate.pct) / 100);
  // No fee, no tax on the fee — and the applied GST rate records as 0 for
  // the same reason a disabled commission does: nothing was charged here.
  const appliedGstPct = commission > 0 ? rate.gstPct : 0;
  const gst = round2((commission * appliedGstPct) / 100);

  return {
    base: baseAmount,
    commission,
    gst,
    buyerPrice: round2(baseAmount + commission + gst),
    pct: rate.pct,
    gstPct: appliedGstPct,
  };
}

/** The buyer-facing figure alone — the common case on a card or a grid. */
export function buyerPrice(base: number, rate: CommissionRate): number {
  return markUp(base, rate).buyerPrice;
}

/**
 * The multiplier a base is scaled by. Exported because a *price range
 * filter* has to convert the buyer's bound back into base terms, and
 * because it is the one number the migration script needs.
 *
 * Note this is not the inverse of `markUp` — the components round
 * independently — so it is for bounds and estimates, never for money.
 */
export function markUpFactor(rate: CommissionRate): number {
  if (!rate.enabled || rate.pct <= 0) return 1;
  return 1 + (rate.pct / 100) * (1 + Math.max(0, rate.gstPct) / 100);
}

/**
 * What a maker would have to be paid for a buyer to be charged
 * `buyerPrice`. Used only where a buyer-facing number has to be read
 * backwards — the price-range filter, and the one-off migration that
 * decides what existing rows meant.
 *
 * **Never use this to pay somebody.** A payout reads the split recorded
 * on the order line, which is the figure that was actually computed at
 * checkout; back-solving it against today's rate would quietly change
 * what an old order earned.
 */
export function baseFromBuyerPrice(price: number, rate: CommissionRate): number {
  const factor = markUpFactor(rate);
  if (factor <= 0) return round2(price);
  return round2(price / factor);
}
