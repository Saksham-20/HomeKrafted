import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { WalletService } from '../wallet/wallet.service';
import { computeCashback } from '../common/pricing/pricing.util';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  LaundryBookingWithLines,
  mapLaundryBooking,
  mapLaundryDay,
  mapLaundryService,
  mapLaundrySlot,
  mapLaundrySubscription,
} from './laundry.mapper';

const BOOKING_INCLUDE = { lines: true } satisfies Prisma.LaundryBookingInclude;

/**
 * Laundry, Cleaning & Ironing — services/availability are `@Public()`
 * reads; bookings + subscriptions are owner-scoped (auth). Every booking's
 * price is computed here from `LaundryService.price` × whichever quantity
 * field matches the service's `pricingModel` — never trusted from the
 * client (see `CreateBookingDto`'s doc comment). Web has no live
 * pickup/delivery tracking (`lib/channel.ts`) — `status` is a plain field,
 * advanced by a seller/admin action (M8.3b), not by this module.
 */
@Injectable()
export class LaundryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ---------------------------------------------------------------------
  // Public reads
  // ---------------------------------------------------------------------

  async listServices() {
    const services = await this.prisma.laundryService.findMany({ orderBy: { name: 'asc' } });
    return services.map(mapLaundryService);
  }

  async getServiceBySlug(slug: string) {
    const service = await this.prisma.laundryService.findUnique({ where: { slug } });
    if (!service) throw new NotFoundException('Laundry service not found');
    return mapLaundryService(service);
  }

  async listDays() {
    const days = await this.prisma.laundryDay.findMany({ orderBy: { isoDate: 'asc' } });
    return days.map(mapLaundryDay);
  }

  async listSlots() {
    const slots = await this.prisma.laundrySlot.findMany({ orderBy: { id: 'asc' } });
    return slots.map(mapLaundrySlot);
  }

  // ---------------------------------------------------------------------
  // Bookings (owner-scoped)
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

  /**
   * Creates a booking with server-authoritative pricing:
   * `LaundryService.price` (read fresh from the DB) × the quantity field
   * matching the service's `pricingModel` (`estimatedWeightKg` for
   * `per-kg`, `itemCount` for `per-item`, `estimatedHours` for
   * `per-hour`) — `Math.round`, same as the mock's `createBooking`.
   *
   * `paymentMethod: "wallet"` debits the wallet for the computed total +
   * credits cashback, atomically with the booking insert, via the same
   * `WalletService.postLedgerEntryTx` ledger primitive `OrdersService`
   * uses — insufficient balance throws `402` and rolls back the whole
   * transaction (booking never gets created). Unlike marketplace orders,
   * laundry bookings have no `pending_payment` staging status (see
   * `schema.prisma`'s `LaundryBookingStatus`), so the debit happens
   * inline here rather than via a separate `/pay` step.
   *
   * `paymentMethod: "razorpay"` / `"cod"` create the booking without any
   * wallet movement — settled at pickup (COD) or via a future online-
   * payment integration (razorpay-for-laundry is out of scope for M8.3a;
   * unlike orders there is no `pending_payment` gate blocking booking
   * creation on it, same as COD).
   */
  async createBooking(userId: string, dto: CreateBookingDto, idempotencyKey?: string) {
    return this.idempotency.run(userId, 'laundry.createBooking', idempotencyKey, async (tx) => {
      const service = await tx.laundryService.findUnique({ where: { id: dto.serviceId } });
      if (!service) throw new NotFoundException('Laundry service not found');

      const address = await tx.address.findUnique({ where: { id: dto.addressId } });
      if (!address || address.userId !== userId) throw new NotFoundException('Address not found');

      const pickupSlot = await tx.laundrySlot.findUnique({ where: { id: dto.pickupSlot.slotId } });
      if (!pickupSlot) throw new NotFoundException('Pickup slot not found');
      const deliverySlot = await tx.laundrySlot.findUnique({ where: { id: dto.deliverySlot.slotId } });
      if (!deliverySlot) throw new NotFoundException('Delivery slot not found');

      if (dto.subscriptionId) {
        const subscription = await tx.laundrySubscription.findUnique({ where: { id: dto.subscriptionId } });
        if (!subscription || subscription.userId !== userId) {
          throw new NotFoundException('Subscription not found');
        }
      }

      const qty = this.resolveQuantity(service.pricingModel, dto);
      const estimatedPrice = Math.round(Number(service.price) * qty);
      const estimatedTotal = estimatedPrice;
      const walletCashback = dto.paymentMethod === 'wallet' ? computeCashback(estimatedTotal) : undefined;

      // Auto-assigns to the longest-standing approved HomeKrafter who
      // offers laundry. Was `where: { type: 'laundry' }`, which the
      // single-role change removed — `specialties` is the replacement, and
      // unlike the old type it's a list, so one account can offer laundry
      // alongside food. Real pickup-address-based routing (nearest partner
      // with capacity) is still M9 scope.
      const partner = await tx.seller.findFirst({
        where: { specialties: { has: 'laundry' }, status: 'approved' },
        orderBy: { createdAt: 'asc' },
      });

      const bookingNumber = await this.generateBookingNumber(tx);

      const booking = await tx.laundryBooking.create({
        data: {
          bookingNumber,
          userId,
          pickupDate: new Date(dto.pickupSlot.date),
          pickupSlotId: dto.pickupSlot.slotId,
          deliveryDate: new Date(dto.deliverySlot.date),
          deliverySlotId: dto.deliverySlot.slotId,
          addressId: dto.addressId,
          photos: dto.photos ?? [],
          specialInstructions: dto.specialInstructions,
          subscriptionId: dto.subscriptionId,
          paymentMethod: dto.paymentMethod,
          status: 'scheduled',
          estimatedTotal,
          walletCashback,
          partnerId: partner?.id,
          lines: {
            create: [
              {
                serviceId: service.id,
                estimatedWeightKg: dto.estimatedWeightKg,
                itemCount: dto.itemCount,
                estimatedHours: dto.estimatedHours,
                estimatedPrice,
              },
            ],
          },
        },
        include: BOOKING_INCLUDE,
      });

      if (dto.paymentMethod === 'wallet') {
        const wallet = await this.walletService.getOrCreateWalletTx(tx, userId);

        await this.walletService.postLedgerEntryTx(tx, {
          walletId: wallet.id,
          direction: 'debit',
          category: 'payment',
          amount: estimatedTotal,
          title: `Paid — Booking #${booking.bookingNumber}`,
          refType: 'laundryBooking',
          refId: booking.id,
        });

        if (walletCashback && walletCashback > 0) {
          await this.walletService.postLedgerEntryTx(tx, {
            walletId: wallet.id,
            direction: 'credit',
            category: 'cashback',
            amount: walletCashback,
            title: `Cashback — Booking #${booking.bookingNumber}`,
            refType: 'laundryBooking',
            refId: booking.id,
            lifetimeSavedDelta: walletCashback,
          });
        }
      }

      return mapLaundryBooking(booking);
    });
  }

  private resolveQuantity(
    pricingModel: 'per_kg' | 'per_item' | 'per_hour',
    dto: CreateBookingDto,
  ): number {
    if (pricingModel === 'per_kg') {
      if (!dto.estimatedWeightKg || dto.estimatedWeightKg <= 0) {
        throw new BadRequestException('estimatedWeightKg is required for a per-kg service');
      }
      return dto.estimatedWeightKg;
    }
    if (pricingModel === 'per_item') {
      if (!dto.itemCount || dto.itemCount <= 0) {
        throw new BadRequestException('itemCount is required for a per-item service');
      }
      return dto.itemCount;
    }
    if (!dto.estimatedHours || dto.estimatedHours <= 0) {
      throw new BadRequestException('estimatedHours is required for a per-hour service');
    }
    return dto.estimatedHours;
  }

  private async generateBookingNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await tx.laundryBooking.count();
      const candidate = `LB${1050 + count + attempt}`;
      const exists = await tx.laundryBooking.findUnique({ where: { bookingNumber: candidate } });
      if (!exists) return candidate;
    }
    return `LB${Date.now()}`;
  }

  // ---------------------------------------------------------------------
  // Subscriptions (owner-scoped CRUD)
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

  async createSubscription(userId: string, dto: CreateSubscriptionDto) {
    const service = await this.prisma.laundryService.findUnique({ where: { id: dto.serviceId } });
    if (!service) throw new NotFoundException('Laundry service not found');
    const slot = await this.prisma.laundrySlot.findUnique({ where: { id: dto.slotId } });
    if (!slot) throw new NotFoundException('Slot not found');

    const sub = await this.prisma.laundrySubscription.create({
      data: {
        userId,
        serviceId: dto.serviceId,
        plan: dto.plan,
        slotDay: dto.slotDay,
        slotId: dto.slotId,
        nextPickup: new Date(dto.nextPickup),
        active: true,
      },
    });
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
