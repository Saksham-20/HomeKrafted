import type { ProductKind } from "@/lib/types";

/**
 * Which checkout a basket gets (2026-09-15): the food layout — one kitchen,
 * a bill, a pay bar — or the gift layout — numbered steps, gift options up
 * front, a review of what arrives.
 *
 * **Any food line makes it a food checkout.** A basket is one maker's
 * (`POST /cart/items` refuses a second), so a mixed basket is a kitchen
 * that also sells a candle — and the food in it is what sets the terms:
 * the cook delivers it, on a day, fresh. Treating that basket as a gift
 * order would hide the questions the food needs answered.
 *
 * A line with no `kind` (a server older than the field) counts as neither,
 * and a basket of only those gets the gift layout, which is the fuller of
 * the two — nothing the buyer needs is missing from it.
 */
export type CheckoutMode = "food" | "gift";

export function checkoutModeOf(lines: ReadonlyArray<{ kind?: ProductKind }>): CheckoutMode {
  return lines.some((line) => line.kind === "food") ? "food" : "gift";
}
