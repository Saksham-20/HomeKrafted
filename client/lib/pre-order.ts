import type { Product } from "@/lib/types";

/**
 * Minutes of notice past which a listing is described to a buyer as a
 * pre-order rather than something being made now (owner, 2026-09-05:
 * "prep time more than 30 mins gives a tag").
 *
 * One number, one place. It is a judgement about copy, not a rule the
 * server enforces — nothing about checkout, scheduling or availability
 * reads it, so moving it changes what a card *says* and nothing a buyer
 * can do.
 */
export const PRE_ORDER_THRESHOLD_MINS = 30;

/**
 * Whether a card should carry the "Pre-order" badge.
 *
 * Reads `Product.prepTimeMins` — the *listing's* own stated notice — and
 * nothing else. It deliberately does not fall back to the kitchen's
 * `VendorProfile.prepTimeMins`: that value defaults to the platform's 90
 * minutes whenever a kitchen has stated nothing, so a fallback would put
 * this badge on essentially every food listing on the site, and a badge
 * every card carries is decoration. A listing nobody has asked gets no
 * badge, which is the M16 "absence is not a closure" rule pointed the
 * other way — absence is not a claim either.
 */
export function isPreOrder(product: Pick<Product, "prepTimeMins">): boolean {
  const mins = product.prepTimeMins;
  return mins !== undefined && mins > PRE_ORDER_THRESHOLD_MINS;
}

/**
 * "Pre-order · 2 days" — the badge's full text, so the number the maker
 * typed is visible rather than hidden behind a word. Rounded to the unit
 * that reads naturally: nobody plans around "2880 minutes".
 *
 * Returns `undefined` when the listing is not a pre-order, so a caller
 * cannot render an empty badge by forgetting to check `isPreOrder` first.
 */
export function preOrderLabel(product: Pick<Product, "prepTimeMins">): string | undefined {
  const mins = product.prepTimeMins;
  if (mins === undefined || mins <= PRE_ORDER_THRESHOLD_MINS) return undefined;
  if (mins < 60) return `Pre-order · ${mins} mins`;
  if (mins < 60 * 24) {
    const hours = Math.round(mins / 60);
    return `Pre-order · ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(mins / (60 * 24));
  return `Pre-order · ${days} ${days === 1 ? "day" : "days"}`;
}
