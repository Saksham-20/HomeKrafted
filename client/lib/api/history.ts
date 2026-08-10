/**
 * Unified order-history read layer (M7a) — merges Marketplace `Order`s and
 * Laundry `LaundryBooking`s into one list/detail shape for
 * `/account/orders`, sorted newest-first. Combines each module's seeded
 * history (`lib/data/orders.ts#seedOrders`,
 * `lib/data/laundry.ts#seedLaundryBookings` — the reliable source, always
 * present) with anything placed live this session
 * (`getPlacedOrders()`/`getPlacedBookings()` — only visible when called
 * from the same client-bundle module instance a checkout/booking actually
 * ran in; see those functions' comments). Real order/booking history
 * moves server-side in M8 (`GET /api/v1/orders` + `GET
 * /api/v1/laundry/bookings`, merged the same way) without changing this
 * module's exports.
 */

import type { LaundryBooking, LaundryBookingStatus, Order, OrderStatus } from "@/lib/types";
import { laundryServices, seedLaundryBookings, seedOrders } from "@/lib/data";
import { ORDER_STAGE_LABEL } from "@/lib/kitchen-copy";
import { isMockMode } from "./http";
import { getPlacedOrders } from "./orders";
import { getPlacedBookings } from "./laundry";

export type OrderHistoryKind = "order" | "laundry";

/** Structurally identical to `StatusTimelineStep` (`components/ui/StatusTimeline.tsx`) — kept local so this data-layer module doesn't import a UI component. */
export interface OrderHistoryStep {
  label: string;
  done: boolean;
  current?: boolean;
}

export interface OrderHistoryEntry {
  /** `Order.id` or `LaundryBooking.id`. */
  id: string;
  kind: OrderHistoryKind;
  /** "HK2043" or "LB1042". */
  number: string;
  /** ISO date/time — `Order.placedAt` or `LaundryBooking.createdAt`. */
  date: string;
  statusLabel: string;
  steps: OrderHistoryStep[];
  total: number;
  /** "3 items" / "Wash & Fold" — short list-row description. */
  summary: string;
  cancelled: boolean;
  order?: Order;
  booking?: LaundryBooking;
}

/**
 * The buyer's stepper. Labels come from `ORDER_STAGE_LABEL` (M28) — a
 * kitchen diary rather than a logistics tracker, because "Placed →
 * Confirmed → Packed → Shipped" is the vocabulary of a courier and says
 * nothing about the thing that actually happens in between.
 *
 * **Only the labels changed.** The `OrderStatus` values are untouched:
 * the server writes them, the seller portal advances them and
 * `docs/API.md` documents them, so renaming the states to read nicer
 * would be a migration bought with nothing. `ORDER_STATUS_LABEL` below
 * keeps the plain operational words for anywhere precision beats warmth.
 */
const ORDER_PIPELINE: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: ORDER_STAGE_LABEL.placed },
  { status: "confirmed", label: ORDER_STAGE_LABEL.confirmed },
  { status: "packed", label: ORDER_STAGE_LABEL.packed },
  { status: "shipped", label: ORDER_STAGE_LABEL.shipped },
  { status: "delivered", label: ORDER_STAGE_LABEL.delivered },
];

const LAUNDRY_PIPELINE: { status: LaundryBookingStatus; label: string }[] = [
  { status: "scheduled", label: "Scheduled" },
  { status: "picked-up", label: "Picked up" },
  { status: "in-progress", label: "In progress" },
  { status: "out-for-delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  "pending-payment": "Payment pending",
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const LAUNDRY_STATUS_LABEL: Record<LaundryBookingStatus, string> = {
  scheduled: "Scheduled",
  "picked-up": "Picked up",
  "in-progress": "In progress",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Basic status stepper for an order (no live tracking, per
 * `lib/channel.ts`) — the same pipeline and wording `OrderConfirmation`
 * shows, both now reading from `ORDER_STAGE_LABEL` so the confirmation
 * screen and the history row cannot drift apart the way two hardcoded
 * copies of the same five words eventually do.
 *
 * `cancelled`/`returned` collapse to a short two-step "Order received →
 * Cancelled/Returned" line instead of a stalled mid-pipeline stepper.
 * Those two endings stay plain: there is no warm way to say an order did
 * not happen, and trying is worse than not.
 */
export function getOrderStatusSteps(status: OrderStatus): OrderHistoryStep[] {
  if (status === "cancelled" || status === "returned") {
    return [
      { label: ORDER_STAGE_LABEL.placed, done: true },
      { label: status === "cancelled" ? "Cancelled" : "Returned", done: true },
    ];
  }
  if (status === "pending-payment") {
    return [{ label: "Payment pending", done: false, current: true }];
  }
  const index = ORDER_PIPELINE.findIndex((step) => step.status === status);
  return ORDER_PIPELINE.map((step, i) => ({
    label: step.label,
    done: i <= index,
    current: i === index,
  }));
}

/**
 * Basic status stepper for a laundry booking (no live tracking — that's
 * `<AppTrackingBand>`, app-only per `lib/channel.ts`) — mirrors the exact
 * pipeline + wording `LaundryBookingConfirmation` already ports.
 */
export function getLaundryStatusSteps(status: LaundryBookingStatus): OrderHistoryStep[] {
  if (status === "cancelled") {
    return [
      { label: "Scheduled", done: true },
      { label: "Cancelled", done: true },
    ];
  }
  const index = LAUNDRY_PIPELINE.findIndex((step) => step.status === status);
  return LAUNDRY_PIPELINE.map((step, i) => ({
    label: step.label,
    done: i <= index,
    current: i === index,
  }));
}

function summarizeOrderItems(items: Order["items"]): string {
  if (items.length === 0) return "No items";
  const [first, ...rest] = items;
  return rest.length > 0 ? `${first.name} +${rest.length} more` : first.name;
}

function toOrderEntry(order: Order): OrderHistoryEntry {
  return {
    id: order.id,
    kind: "order",
    number: order.orderNumber,
    date: order.placedAt,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    steps: getOrderStatusSteps(order.status),
    total: order.total,
    summary: summarizeOrderItems(order.items),
    cancelled: order.status === "cancelled" || order.status === "returned",
    order,
  };
}

function toBookingEntry(booking: LaundryBooking): OrderHistoryEntry {
  const line = booking.lines[0];
  const service = laundryServices.find((s) => s.id === line?.serviceId);
  return {
    id: booking.id,
    kind: "laundry",
    number: booking.bookingNumber,
    date: booking.createdAt,
    statusLabel: LAUNDRY_STATUS_LABEL[booking.status],
    steps: getLaundryStatusSteps(booking.status),
    total: booking.estimatedTotal,
    summary: service?.name ?? "Laundry service",
    cancelled: booking.status === "cancelled",
    booking,
  };
}

/**
 * Full unified history, newest first. Mock mode: seeded history + this-
 * session-live orders/bookings (pre-M8.4a behavior, unchanged). Real
 * mode: `getPlacedOrders()`/`getPlacedBookings()` now resolve to *every*
 * order/booking of the signed-in account straight from `server/`
 * (`GET /orders` + `GET /laundry/bookings`) — the seeded rows already live
 * in Postgres (`server/prisma/seed.ts` seeds the same ids as
 * `lib/data`'s mock arrays), so concatenating the local `seedOrders`/
 * `seedLaundryBookings` mock arrays here would double them up.
 */
export async function getOrderHistory(): Promise<OrderHistoryEntry[]> {
  const [liveOrders, liveBookings] = await Promise.all([getPlacedOrders(), getPlacedBookings()]);
  const entries: OrderHistoryEntry[] = isMockMode()
    ? [
        ...seedOrders.map(toOrderEntry),
        ...liveOrders.map(toOrderEntry),
        ...seedLaundryBookings.map(toBookingEntry),
        ...liveBookings.map(toBookingEntry),
      ]
    : [...liveOrders.map(toOrderEntry), ...liveBookings.map(toBookingEntry)];
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Single entry by `Order.id`/`LaundryBooking.id`, for the `/account/orders/[id]` detail route. */
export async function getOrderHistoryEntry(id: string): Promise<OrderHistoryEntry | undefined> {
  const all = await getOrderHistory();
  return all.find((entry) => entry.id === id);
}
