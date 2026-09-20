import type { CheckoutMode } from "@/lib/cart/checkout-mode";

/**
 * Who a checkout order is for, and which of those checkout will take today
 * (2026-09-20, owner: "only enable deliver to ISB, disable the rest, and
 * add a coming soon label").
 *
 * The gift checkout's "Who is it for?" control has three choices. Only ISB
 * is open; the other two still render, disabled and tagged "Coming soon",
 * so a buyer sees what is on the way rather than a choice that vanished.
 * Reopening one is a flip in `DESTINATION_OPEN` and nothing else — with all
 * three open the screen is what it was before this file existed.
 *
 * **This is the web's gate, not the server's.** `POST /orders` still takes
 * a standard order, because the native app has no ISB option and would
 * have no way left to check out. Refuse it server-side the day both
 * clients offer ISB, or the switch is a closed door on one screen only —
 * see "Food is coming soon" in CLAUDE.md for the shape to copy.
 *
 * Pure and DOM-free: `client/lib` is compiled by the native app too.
 */
export type Destination = "me" | "gift" | "isb";

export type DestinationAvailability = Readonly<Record<Destination, boolean>>;

/** Left to right on the control, and the order a fallback is looked for in. */
export const DESTINATIONS: readonly Destination[] = ["me", "gift", "isb"];

export const DESTINATION_OPEN: DestinationAvailability = {
  me: false,
  gift: false,
  isb: true,
};

export function isDestinationOpen(
  destination: Destination,
  open: DestinationAvailability = DESTINATION_OPEN,
): boolean {
  return open[destination];
}

/**
 * What a buyer's pick means on the layout they are looking at.
 *
 * `chosen` is whatever `CheckoutClient` last stored, and it can be stale
 * or foreign: the initial `"me"`, a `"gift"` set by the product page's
 * "Make it a gift" block, a pick made on the other layout before the
 * basket changed shape. Reading it through here is what keeps a closed
 * destination from ever being the one an order is placed with.
 *
 * - **Gift layout:** an open pick stands; a closed one falls to the first
 *   open destination, in display order.
 * - **Food layout:** it has no campus control (a kitchen delivers its own
 *   food on its own day), so `isb` reads as `me` — a food basket must
 *   never be placed as a free campus order the screen never offered. It
 *   also ignores `open`: this switch governs the gift checkout's control,
 *   and food orders are already gated by `foodOrdersOpen`.
 */
export function resolveDestination(
  chosen: Destination,
  layout: CheckoutMode,
  open: DestinationAvailability = DESTINATION_OPEN,
): Destination {
  if (layout === "food") return chosen === "gift" ? "gift" : "me";
  if (open[chosen]) return chosen;
  return DESTINATIONS.find((destination) => open[destination]) ?? chosen;
}
