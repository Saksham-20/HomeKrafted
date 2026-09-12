/**
 * The two windows in which a buyer can still do something about an order,
 * and they are policy rather than presentation.
 *
 * They lived inline in `OrderResolutionPanel` until 2026-09-06 — a
 * `CANCELLABLE` array and a `Date.now()` subtraction inside an effect.
 * That was fine while one screen asked; it is the `geo.ts` hazard the
 * moment a second package does, because two copies of a rule about money
 * drift and the drift is silent. Both the web panel and the native
 * order screen read these.
 *
 * **The UI only decides what to *offer*. Both windows are enforced
 * server-side** (M15), and that is the authority — a client that offers a
 * button the server refuses is a bad screen, but a client that hides one
 * the server would allow is a buyer with no way to act.
 *
 * **Nothing here reads the clock.** Every function takes `now`, the M12
 * rule, so a server render and a device cannot disagree about whether a
 * window is open — and so the cases below are arithmetic done on paper
 * rather than a recording of today.
 */
import type { Order, OrderStatus } from "@/lib/types";

/**
 * Cancellation closes at `packed`.
 *
 * Once a home cook has packed it the cost of a cancellation lands on
 * them, so after that the path is a return. `pending-payment` is in the
 * list because an order that never captured anything is the cheapest of
 * all to call off.
 */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "pending-payment",
  "placed",
  "confirmed",
];

/** A return closes seven days after delivery. */
export const RETURN_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function canCancel(order: Order): boolean {
  return CANCELLABLE_STATUSES.includes(order.status);
}

/**
 * When the return window shuts, or `undefined` if it never opened.
 *
 * Counted from `deliveredAt`, which is stamped wherever an order reaches
 * `delivered`. It falls back to `placedAt` — deliberately, and only
 * because a pre-M15 row has no `deliveredAt` at all; the fallback is
 * *stricter* than the truth (an order placed long before it arrived gets
 * a shorter window), which is the safe direction for a client that only
 * decides what to offer.
 */
export function returnWindowClosesAt(order: Order): Date | undefined {
  if (order.status !== "delivered") return undefined;
  const from = new Date(order.deliveredAt ?? order.placedAt).getTime();
  if (!Number.isFinite(from)) return undefined;
  return new Date(from + RETURN_WINDOW_DAYS * DAY_MS);
}

export function canRequestReturn(order: Order, now: Date): boolean {
  const closes = returnWindowClosesAt(order);
  return closes !== undefined && now.getTime() <= closes.getTime();
}

/**
 * Fresh food quality reporting window (6 hours from delivery).
 * For perishable food orders, quality issues (freshness, temperature, packaging)
 * must be flagged within 6 hours with photo evidence for replacement/refund.
 */
export const FRESH_FOOD_QUALITY_WINDOW_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;

export function qualityWindowClosesAt(order: Order): Date | undefined {
  if (order.status !== "delivered") return undefined;
  const from = new Date(order.deliveredAt ?? order.placedAt).getTime();
  if (!Number.isFinite(from)) return undefined;
  return new Date(from + FRESH_FOOD_QUALITY_WINDOW_HOURS * HOUR_MS);
}

export function canReportQualityIssue(order: Order, now: Date): boolean {
  const closes = qualityWindowClosesAt(order);
  return closes !== undefined && now.getTime() <= closes.getTime();
}

/**
 * Which of four things this order is, for a screen deciding what to draw.
 *
 * `resolved` comes first on purpose: an order already cancelled or with a
 * refund in flight must never also be offered a cancel button, and
 * checking the windows first is how that happens.
 */
export type ResolutionState = "resolved" | "cancellable" | "returnable" | "closed";

export function resolutionState(order: Order, now: Date): ResolutionState {
  if (order.refundStatus !== "none" || order.status === "cancelled") return "resolved";
  if (canCancel(order)) return "cancellable";
  if (canRequestReturn(order, now)) return "returnable";
  return "closed";
}
