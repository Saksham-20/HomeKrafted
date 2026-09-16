import type { Product } from "@/lib/types";

/**
 * The one line of fact under a gift card (G3 §5.1).
 *
 * Every card on `/gifts` used to end on a badge chain that made claims no
 * column backed — "Authentic", "Handcrafted", a size label reading "One".
 * The 2026-09-14 sweep deleted that whole family across the site for the
 * same reason it is not coming back here: **a claim is ours to make only
 * if a column backs it and we read that column.**
 *
 * So this returns `null` far more often than it returns a sentence, and
 * that is the design. A maker who has answered nothing gets a quieter
 * card, not an invented one.
 *
 * Pure and clock-free — it runs in the Server Component that renders the
 * first rows and again in the browser after a filter, and those two must
 * agree or hydration throws (the M12 React #418 rule).
 */

/** Minutes in a day, for turning a stated prep time into something readable. */
const MINUTES_PER_DAY = 60 * 24;

/**
 * A stated prep time as whole days, or `null`.
 *
 * `prepTimeMins` is the column the Pre-order badge already reads, and it
 * is **minutes** because it was written for food. A gift stated in hours
 * is not a number worth printing beside "Made to order" — "made to order ·
 * 3 hours" reads as a mistake — so anything under a day yields nothing and
 * the phrase stands alone. NULL and 0 are both "not stated", never zero
 * days: that is the `parseStock` lesson, where a blank becoming 0 took
 * sixteen live listings off sale.
 */
export function dispatchDays(product: Pick<Product, "prepTimeMins">): number | null {
  const mins = product.prepTimeMins;
  if (mins === undefined || mins === null || mins <= 0) return null;
  if (mins < MINUTES_PER_DAY) return null;
  return Math.round(mins / MINUTES_PER_DAY);
}

/**
 * The card's fact line, or `null` when nothing was answered.
 *
 * Order matters: how it reaches somebody is the thing a gift buyer is
 * deciding on, and personalisation is the thing that changes what they can
 * ask for. Sold out is handled by the card itself, not here — it is a
 * state, not a fact about the object.
 */
export function giftFactLine(
  product: Pick<Product, "prepTimeMins" | "fulfilment" | "isPersonalisable">,
): string | null {
  const parts: string[] = [];

  if (product.fulfilment === "ready_to_ship") {
    const days = dispatchDays(product);
    parts.push(days === null ? "Ready to ship" : `Ready to ship · posted in ${days} ${days === 1 ? "day" : "days"}`);
  } else if (product.fulfilment === "made_to_order") {
    const days = dispatchDays(product);
    parts.push(days === null ? "Made to order" : `Made to order · ${days} ${days === 1 ? "day" : "days"}`);
  }

  if (product.isPersonalisable) parts.push("Personalisable");

  return parts.length > 0 ? parts.join(" · ") : null;
}
