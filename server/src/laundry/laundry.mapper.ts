import { LaundryBooking, LaundryBookingLine, LaundryDay, LaundryService, LaundrySlot, LaundrySubscription } from '@prisma/client';

export type LaundryBookingWithLines = LaundryBooking & { lines: LaundryBookingLine[] };

/**
 * Every Prisma enum below is declared with an underscore identifier
 * (hyphens aren't valid Prisma enum members) and `@map`'d to the
 * hyphenated DB value — but the Prisma Client always returns the
 * declared identifier at runtime, not the mapped DB value (same
 * reasoning as `orders/order.mapper.ts#orderStatusToFrontend`). These
 * converters restore the exact hyphenated form
 * `client/lib/types/laundry.ts` expects.
 */
export function pricingModelToFrontend(model: LaundryService['pricingModel']): 'per-kg' | 'per-item' | 'per-hour' {
  if (model === 'per_kg') return 'per-kg';
  if (model === 'per_item') return 'per-item';
  return 'per-hour';
}

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

export function mapLaundryService(service: LaundryService) {
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    description: service.description,
    pricingModel: pricingModelToFrontend(service.pricingModel),
    price: Number(service.price),
    unitLabel: service.unitLabel,
    priceIsFrom: service.priceIsFrom,
    priceLabel: service.priceLabel,
    iconPlaceholder: service.iconPlaceholder ?? undefined,
  };
}

export function mapLaundryDay(day: LaundryDay) {
  return { id: day.id, day: day.day, date: day.date, isoDate: day.isoDate.toISOString() };
}

export function mapLaundrySlot(slot: LaundrySlot) {
  return { id: slot.id, label: slot.label };
}

export function mapLaundryBooking(booking: LaundryBookingWithLines) {
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    userId: booking.userId,
    lines: booking.lines.map((l) => ({
      serviceId: l.serviceId,
      estimatedWeightKg: l.estimatedWeightKg !== null ? Number(l.estimatedWeightKg) : undefined,
      itemCount: l.itemCount ?? undefined,
      estimatedHours: l.estimatedHours !== null ? Number(l.estimatedHours) : undefined,
      estimatedPrice: Number(l.estimatedPrice),
    })),
    pickupSlot: { date: booking.pickupDate.toISOString().slice(0, 10), slotId: booking.pickupSlotId },
    deliverySlot: { date: booking.deliveryDate.toISOString().slice(0, 10), slotId: booking.deliverySlotId },
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
