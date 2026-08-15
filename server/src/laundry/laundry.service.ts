import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  BOOKING_INCLUDE,
  LaundryBookingWithLines,
  mapLaundryBooking,
  mapLaundrySubscription,
} from './laundry.mapper';

/**
 * Laundry, Cleaning & Ironing — **withdrawn (M19)**, reduced to its
 * obligations (M37): existing bookings keep rendering, and a subscription
 * holder can still change or cancel what they signed up for. The browse
 * reads (services, days, slots) and both create paths were deleted in
 * M37 — they had been unreferenced since M19 (the create routes 410),
 * and dead money-moving code is a liability, not an asset. The models
 * stay so history resolves; see CLAUDE.md's channel table.
 */
@Injectable()
export class LaundryService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Bookings (owner-scoped reads)
  // ---------------------------------------------------------------------

  async listBookings(userId: string) {
    const rows = await this.prisma.laundryBooking.findMany({
      where: { userId },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapLaundryBooking);
  }

  /** Owner-scoped: 404s (not 403) when the booking exists but belongs to someone else. */
  async getBookingById(userId: string, id: string) {
    const booking = await this.prisma.laundryBooking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    if (!booking || booking.userId !== userId) throw new NotFoundException('Booking not found');
    return mapLaundryBooking(booking);
  }

  /**
   * Tx-scoped helper for `orders/order-history.util.ts`'s unified-history
   * merge — returns raw rows (mapped by the caller into the history
   * shape), not the public `mapLaundryBooking` shape, so the history
   * endpoint controls its own projection.
   */
  async listBookingsForHistory(userId: string): Promise<LaundryBookingWithLines[]> {
    return this.prisma.laundryBooking.findMany({
      where: { userId },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------
  // Subscriptions (owner-scoped; no create — withdrawn)
  // ---------------------------------------------------------------------

  async listSubscriptions(userId: string) {
    const rows = await this.prisma.laundrySubscription.findMany({ where: { userId }, orderBy: { nextPickup: 'asc' } });
    return rows.map(mapLaundrySubscription);
  }

  async getSubscriptionById(userId: string, id: string) {
    const sub = await this.prisma.laundrySubscription.findUnique({ where: { id } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Subscription not found');
    return mapLaundrySubscription(sub);
  }

  async updateSubscription(userId: string, id: string, dto: UpdateSubscriptionDto) {
    const existing = await this.prisma.laundrySubscription.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new NotFoundException('Subscription not found');

    if (dto.slotId) {
      const slot = await this.prisma.laundrySlot.findUnique({ where: { id: dto.slotId } });
      if (!slot) throw new NotFoundException('Slot not found');
    }

    const updated = await this.prisma.laundrySubscription.update({
      where: { id },
      data: {
        active: dto.active,
        plan: dto.plan,
        slotDay: dto.slotDay,
        slotId: dto.slotId,
        nextPickup: dto.nextPickup ? new Date(dto.nextPickup) : undefined,
      },
    });
    return mapLaundrySubscription(updated);
  }

  /** Soft-cancel (`active: false`) rather than a hard delete — mirrors the mock's `active` toggle; bookings that reference this subscription (`LaundryBooking.subscriptionId`) must keep resolving. */
  async cancelSubscription(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.laundrySubscription.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new NotFoundException('Subscription not found');
    await this.prisma.laundrySubscription.update({ where: { id }, data: { active: false } });
  }
}
