import { OrderItem } from '@prisma/client';
import { mapOrder, OrderWithRelations, orderStatusToFrontend } from './order.mapper';
import { bookingStatusToFrontend, LaundryBookingWithLines, mapLaundryBooking } from '../laundry/laundry.mapper';

/** Structurally identical to `client/lib/api/history.ts`'s `OrderHistoryStep`. */
export interface OrderHistoryStep {
  label: string;
  done: boolean;
  current?: boolean;
}

const PIPELINE: { status: string; label: string }[] = [
  { status: 'placed', label: 'Placed' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
];

/**
 * Extends `client/lib/api/history.ts#ORDER_STATUS_LABEL` with the
 * `pending_payment` status this milestone introduces (see
 * `order.mapper.ts`'s doc comment) — every other key/label matches the
 * frontend exactly so `GET /orders/history` is a drop-in for M8.4.
 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Payment pending',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** Same pipeline/wording as `client/lib/api/history.ts#getOrderStatusSteps`, extended with a `pending_payment` step ahead of `placed`. */
export function getOrderStatusSteps(status: OrderWithRelations['status']): OrderHistoryStep[] {
  if (status === 'cancelled' || status === 'returned') {
    return [
      { label: 'Placed', done: true },
      { label: status === 'cancelled' ? 'Cancelled' : 'Returned', done: true },
    ];
  }
  if (status === 'pending_payment') {
    return [
      { label: 'Order created', done: true },
      { label: 'Payment pending', done: false, current: true },
    ];
  }
  const index = PIPELINE.findIndex((step) => step.status === status);
  return PIPELINE.map((step, i) => ({ label: step.label, done: i <= index, current: i === index }));
}

function summarizeItems(items: OrderItem[]): string {
  if (items.length === 0) return 'No items';
  const [first, ...rest] = items;
  return rest.length > 0 ? `${first.name} +${rest.length} more` : first.name;
}

/**
 * `client/lib/api/history.ts#getOrderHistory`'s unified shape, marketplace
 * orders only — `kind` is always `"order"` here. Laundry bookings join
 * this list below (`toLaundryHistoryEntry`) — see `OrdersService.history`.
 */
export function toOrderHistoryEntry(order: OrderWithRelations, mappedOrder: ReturnType<typeof mapOrder>) {
  return {
    id: order.id,
    kind: 'order' as const,
    number: order.orderNumber,
    date: order.placedAt.toISOString(),
    statusLabel: ORDER_STATUS_LABEL[order.status],
    statusRaw: orderStatusToFrontend(order.status),
    steps: getOrderStatusSteps(order.status),
    total: Number(order.total),
    summary: summarizeItems(order.items),
    cancelled: order.status === 'cancelled' || order.status === 'returned',
    order: mappedOrder,
  };
}

// ---------------------------------------------------------------------------
// M8.3a — laundry bookings join the same unified shape (`kind: "laundry"`),
// same pipeline/wording as `client/lib/api/history.ts`'s
// `LAUNDRY_PIPELINE`/`LAUNDRY_STATUS_LABEL`/`getLaundryStatusSteps`.
//
// `SnackOrder` deliberately does NOT join this merge: it has no `userId`
// FK (`schema.prisma`) — a WhatsApp-origin order is identified by
// `customerName`/`customerPhone`, not a Homekrafted account, and is
// seller-scoped only (see `client/lib/types/food.ts#SnackOrder`'s own doc
// comment: "consumer snack orders never become a server-side Order").
// There is no "my snack orders" to merge into a consumer's history today;
// exposing snack orders is a seller-side surface (M8.3b), not a history
// entry.
// ---------------------------------------------------------------------------

const LAUNDRY_PIPELINE: { status: string; label: string }[] = [
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'picked-up', label: 'Picked up' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'out-for-delivery', label: 'Out for delivery' },
  { status: 'delivered', label: 'Delivered' },
];

export const LAUNDRY_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  'picked-up': 'Picked up',
  'in-progress': 'In progress',
  'out-for-delivery': 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Same pipeline/wording as `client/lib/api/history.ts#getLaundryStatusSteps`. */
export function getLaundryStatusSteps(status: string): OrderHistoryStep[] {
  if (status === 'cancelled') {
    return [
      { label: 'Scheduled', done: true },
      { label: 'Cancelled', done: true },
    ];
  }
  const index = LAUNDRY_PIPELINE.findIndex((step) => step.status === status);
  return LAUNDRY_PIPELINE.map((step, i) => ({ label: step.label, done: i <= index, current: i === index }));
}

/** The service name rides on the row itself since M37 (`BOOKING_INCLUDE` joins it) — the caller-side batched lookup this took as a parameter is gone with the browse routes. */
export function toLaundryHistoryEntry(booking: LaundryBookingWithLines) {
  const mapped = mapLaundryBooking(booking);
  const status = bookingStatusToFrontend(booking.status);
  return {
    id: booking.id,
    kind: 'laundry' as const,
    number: booking.bookingNumber,
    date: booking.createdAt.toISOString(),
    statusLabel: LAUNDRY_STATUS_LABEL[status] ?? status,
    statusRaw: status,
    steps: getLaundryStatusSteps(status),
    total: Number(booking.estimatedTotal),
    summary: booking.lines[0]?.service.name ?? 'Laundry service',
    cancelled: booking.status === 'cancelled',
    booking: mapped,
  };
}
