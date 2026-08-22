/**
 * A HomeKrafter's own discount on their own listings (M46).
 *
 * **Whose money this is.** The percentage comes off the price a buyer
 * pays, so it comes off the kitchen's take — the commission split is
 * computed on what was actually charged (`seller/payout-split.ts`), not
 * on some pre-discount figure. That is the honest arrangement and it is
 * the one the seller screen states in those words before anything saves.
 * A platform-funded discount would be a different feature with a
 * different name and a budget attached.
 *
 * **Nothing expires a row.** There is no scheduler and no cron. Every
 * read asks `activeDiscountPct(vendor, now)`, so a lapsed discount stops
 * applying the moment the date passes rather than whenever a job next
 * runs. Same shape as `meals/menu-lock.ts` and `lib/occasions.ts`: this
 * module never reads the clock itself, it takes `now` — which is what
 * lets a Server Component compute a price once and ship it as text
 * without server and browser disagreeing on "today" (React #418, the M12
 * lesson).
 */

/**
 * The most a HomeKrafter may take off their own listings.
 *
 * Not a round 100 for the obvious reason, and not 90 either: this reaches
 * *every one of their listings at once*, it is their own income, and a
 * mistyped digit is the failure that actually happens. Half is already a
 * dramatic sale.
 */
export const MAX_VENDOR_DISCOUNT_PCT = 50;

/** The smallest discount worth showing a buyer. Below this it is noise. */
export const MIN_VENDOR_DISCOUNT_PCT = 1;

export interface DiscountableVendor {
  discountPct: number | null;
  discountEndsAt: Date | null;
}

/**
 * The discount in force right now, or `0`.
 *
 * `discountEndsAt` is **exclusive**: a discount ending on the 15th is
 * over at the first instant of the 15th. The seller screen sets it to
 * midnight of the day *after* the last day, and says which day that is,
 * so nobody has to reason about this boundary from the UI.
 */
export function activeDiscountPct(vendor: DiscountableVendor, now: Date): number {
  const pct = vendor.discountPct ?? 0;
  if (pct < MIN_VENDOR_DISCOUNT_PCT) return 0;
  if (vendor.discountEndsAt && vendor.discountEndsAt.getTime() <= now.getTime()) return 0;
  return Math.min(pct, MAX_VENDOR_DISCOUNT_PCT);
}

/**
 * A discounted rupee amount, rounded to the nearest rupee.
 *
 * Rounded rather than floored: flooring every line in a large cart hands
 * the buyer up to a rupee per line for nothing, and this figure is what
 * the kitchen is paid on. Never returns less than zero, and never returns
 * more than it was given — a nonsense percentage cannot raise a price.
 */
export function applyDiscount(amount: number, pct: number): number {
  if (pct <= 0) return amount;
  const capped = Math.min(pct, MAX_VENDOR_DISCOUNT_PCT);
  return Math.max(0, Math.min(amount, Math.round((amount * (100 - capped)) / 100)));
}
