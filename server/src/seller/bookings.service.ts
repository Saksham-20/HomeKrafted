import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LaundryBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKING_INCLUDE, mapLaundryBooking } from '../laundry/laundry.mapper';

/**
 * The pipeline a laundry partner can advance an assigned booking through —
 * uses the Prisma enum's declared identifiers (`scheduled` -> `picked_up`
 * -> `in_progress` -> `out_for_delivery` -> `delivered`), same reasoning as
 * `seller/orders.service.ts#FULFILLMENT_SEQUENCE`. `cancelled` is terminal
 * and never advances.
 */
export const BOOKING_SEQUENCE: LaundryBookingStatus[] = [
  'scheduled',
  'picked_up',
  'in_progress',
  'out_for_delivery',
  'delivered',
];

export function nextBookingStatus(status: LaundryBookingStatus): LaundryBookingStatus | undefined {
  const index = BOOKING_SEQUENCE.indexOf(status);
  if (index === -1 || index === BOOKING_SEQUENCE.length - 1) return undefined;
  return BOOKING_SEQUENCE[index + 1];
}

/** Laundry partner — assigned bookings (`LaundryBooking.partnerId === sellerId`) only. A booking assigned to a different partner 404s. */
@Injectable()
export class SellerBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(sellerId: string) {
    const rows = await this.prisma.laundryBooking.findMany({
      where: { partnerId: sellerId },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapLaundryBooking);
  }

  async getOne(sellerId: string, bookingId: string) {
    const booking = await this.assertOwned(sellerId, bookingId);
    return mapLaundryBooking(booking);
  }

  async advance(sellerId: string, bookingId: string) {
    const booking = await this.assertOwned(sellerId, bookingId);
    const next = nextBookingStatus(booking.status);
    if (!next) {
      throw new ConflictException(`Booking is already at a terminal status ("${booking.status}")`);
    }
    const updated = await this.prisma.laundryBooking.update({
      where: { id: bookingId },
      data: { status: next },
      include: BOOKING_INCLUDE,
    });
    return mapLaundryBooking(updated);
  }

  private async assertOwned(sellerId: string, bookingId: string) {
    const booking = await this.prisma.laundryBooking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking || booking.partnerId !== sellerId) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }
}
