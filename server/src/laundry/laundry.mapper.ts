import { LaundryBooking, LaundrySubscription, Prisma } from '@prisma/client';

/**
 * The one include every booking read uses. The service and slot joins
 * exist so the payload is self-describing (M37): with the laundry browse
 * routes gone, a legacy booking is the only place its service's name and
 * slot label still reach a customer — the row has to carry them itself.
 */
export const BOOKING_INCLUDE = {
  lines: { include: { service: { select: { name: true, unitLabel: true } } } },
  pickupSlot: { select: { label: true } },
  deliverySlot: { select: { label: true } },
} satisfies Prisma.LaundryBookingInclude;

export type LaundryBookingWithLines = Prisma.LaundryBookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

/**
 * The booking status enum is declared with underscore identifiers
 * (hyphens aren't valid Prisma enum members) and `@map`'d to the
 * hyphenated DB value — but the Prisma Client always returns the
 * declared identifier at runtime, not the mapped DB value (same
 * reasoning as `orders/order.mapper.ts#orderStatusToFrontend`). This
 * converter restores the exact hyphenated form
 * `client/lib/types/laundry.ts` expects. The service/day/slot mappers
 * left with the browse routes in M37 — only bookings and subscriptions
 * still cross the wire.
 */
export function bookingStatusToFrontend(status: LaundryBooking['status']): string {
  switch (status) {
    case 'picked_up':
      return 'picked-up';
    case 'in_progress':
      return 'in-progress';
    case 'out_for_delivery':
      return 'out-for-delivery';
    default:
      return status;
  }
}

export function mapLaundryBooking(booking: LaundryBookingWithLines) {
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    userId: booking.userId,
    lines: booking.lines.map((l) => ({
      serviceId: l.serviceId,
      serviceName: l.service.name,
      unitLabel: l.service.unitLabel,
      estimatedWeightKg: l.estimatedWeightKg !== null ? Number(l.estimatedWeightKg) : undefined,
      itemCount: l.itemCount ?? undefined,
      estimatedHours: l.estimatedHours !== null ? Number(l.estimatedHours) : undefined,
      estimatedPrice: Number(l.estimatedPrice),
    })),
    pickupSlot: { date: booking.pickupDate.toISOString().slice(0, 10), slotId: booking.pickupSlotId },
    pickupSlotLabel: booking.pickupSlot.label,
    deliverySlot: { date: booking.deliveryDate.toISOString().slice(0, 10), slotId: booking.deliverySlotId },
    deliverySlotLabel: booking.deliverySlot.label,
    addressId: booking.addressId,
    photos: booking.photos,
    specialInstructions: booking.specialInstructions ?? undefined,
    subscriptionId: booking.subscriptionId ?? undefined,
    paymentMethod: booking.paymentMethod,
    status: bookingStatusToFrontend(booking.status),
    estimatedTotal: Number(booking.estimatedTotal),
    walletCashback: booking.walletCashback !== null ? Number(booking.walletCashback) : undefined,
    createdAt: booking.createdAt.toISOString(),
    partnerId: booking.partnerId ?? undefined,
  };
}

export function mapLaundrySubscription(sub: LaundrySubscription) {
  return {
    id: sub.id,
    userId: sub.userId,
    serviceId: sub.serviceId,
    plan: sub.plan,
    slot: { day: sub.slotDay, slotId: sub.slotId },
    active: sub.active,
    nextPickup: sub.nextPickup.toISOString().slice(0, 10),
  };
}
