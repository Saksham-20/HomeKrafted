import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LaundryBookingStatus, OrderStatus, Prisma, SnackOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { OrdersService } from '../orders/orders.service';
import { mapOrder } from '../orders/order.mapper';
import { mapLaundryBooking } from '../laundry/laundry.mapper';
import { mapSnackOrder } from '../seller/mappers/snack-order.mapper';
import { AdminAuditLogService } from './audit-log.service';

export type AdminOrderType = 'marketplace' | 'laundry' | 'snack';

const ORDER_INCLUDE = { items: true, shipments: true } satisfies Prisma.OrderInclude;
const BOOKING_INCLUDE = { lines: true } satisfies Prisma.LaundryBookingInclude;
const SNACK_ORDER_INCLUDE = { items: true } satisfies Prisma.SnackOrderInclude;

/** Frontend-hyphenated status string -> the Prisma enum's declared identifier, per order kind — the reverse of `order.mapper.ts#orderStatusToFrontend` etc. Used only by the admin status-override endpoint (a seller's own `advance` methods only ever step forward one stage, never take an arbitrary target). */
const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  'pending-payment': 'pending_payment',
  placed: 'placed',
  confirmed: 'confirmed',
  packed: 'packed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'returned',
};

const LAUNDRY_STATUS_MAP: Record<string, LaundryBookingStatus> = {
  scheduled: 'scheduled',
  'picked-up': 'picked_up',
  'in-progress': 'in_progress',
  'out-for-delivery': 'out_for_delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

const SNACK_STATUS_MAP: Record<string, SnackOrderStatus> = {
  received: 'received',
  accepted: 'accepted',
  'out-for-delivery': 'out_for_delivery',
  delivered: 'delivered',
};

export interface AdminOrderSummary {
  /** `${type}:${the underlying record's id}` — unique across all 3 source tables. */
  id: string;
  type: AdminOrderType;
  reference: string;
  customerName: string;
  customerPhone?: string;
  /** The `User.id` a wallet refund would credit — set for marketplace orders + laundry bookings (both carry a real `userId`), `undefined` for snack orders (WhatsApp-only, no registered account/wallet). */
  customerUserId?: string;
  sellerNames: string[];
  status: string;
  total: number;
  placedAt: string;
}

/**
 * Unscoped orders oversight — merges marketplace `Order`s,
 * `LaundryBooking`s and `SnackOrder`s into one list/detail surface, same
 * "display-layer aggregation, not a new domain entity" status as
 * `client/lib/api/admin.ts`'s `AdminOrderSummary`. Refunds reuse
 * `OrdersService.refundOrder` (marketplace) or `WalletService`'s
 * row-locked ledger primitive directly (laundry) — never a raw balance
 * write. Snack orders have no linked `userId`/wallet (WhatsApp-origin,
 * see `SnackOrder`'s schema doc comment) so refunding one is rejected.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly ordersService: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async listUnified(type?: AdminOrderType): Promise<AdminOrderSummary[]> {
    const [marketplace, laundry, snack] = await Promise.all([
      !type || type === 'marketplace' ? this.listMarketplace() : Promise.resolve([]),
      !type || type === 'laundry' ? this.listLaundry() : Promise.resolve([]),
      !type || type === 'snack' ? this.listSnack() : Promise.resolve([]),
    ]);

    return [...marketplace, ...laundry, ...snack].sort(
      (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
    );
  }

  async getDetail(type: AdminOrderType, id: string) {
    if (type === 'marketplace') {
      const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      if (!order) throw new NotFoundException('Order not found');
      return mapOrder(order);
    }
    if (type === 'laundry') {
      const booking = await this.prisma.laundryBooking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
      if (!booking) throw new NotFoundException('Booking not found');
      return mapLaundryBooking(booking);
    }
    const snackOrder = await this.prisma.snackOrder.findUnique({ where: { id }, include: SNACK_ORDER_INCLUDE });
    if (!snackOrder) throw new NotFoundException('Snack order not found');
    return mapSnackOrder(snackOrder);
  }

  async refund(adminUserId: string, type: AdminOrderType, id: string, idempotencyKey?: string) {
    if (type === 'marketplace') {
      const result = await this.ordersService.refundOrder(adminUserId, id, idempotencyKey);
      await this.auditLog.log({
        actorId: adminUserId,
        action: 'order.refund',
        targetType: 'Order',
        targetId: id,
      });
      return result;
    }

    if (type === 'laundry') {
      const result = await this.idempotency.run(adminUserId, 'admin.laundry.refund', idempotencyKey, async (tx) => {
        const booking = await tx.laundryBooking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');

        // No `refundStatus` field on `LaundryBooking` (unlike `Order`) —
        // idempotent-by-content instead: a prior refund credit for this
        // exact booking already exists on the ledger, so a repeat call
        // (with or without a key) is a no-op read, never a double-credit.
        const alreadyRefunded = await tx.walletTransaction.findFirst({
          where: { refType: 'laundryBooking', refId: booking.id, category: 'refund' },
        });
        if (!alreadyRefunded) {
          const wallet = await this.walletService.getOrCreateWalletTx(tx, booking.userId);
          await this.walletService.postLedgerEntryTx(tx, {
            walletId: wallet.id,
            direction: 'credit',
            category: 'refund',
            amount: Number(booking.estimatedTotal),
            title: `Refund — Booking #${booking.bookingNumber}`,
            refType: 'laundryBooking',
            refId: booking.id,
          });
        }

        const updated = await tx.laundryBooking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });
        return mapLaundryBooking(updated);
      });

      await this.auditLog.log({
        actorId: adminUserId,
        action: 'order.refund',
        targetType: 'LaundryBooking',
        targetId: id,
      });
      return result;
    }

    throw new BadRequestException(
      'Snack orders have no linked wallet to refund — they are WhatsApp-origin orders with no registered Homekrafted account',
    );
  }

  async overrideStatus(adminUserId: string, type: AdminOrderType, id: string, status: string) {
    if (type === 'marketplace') {
      const dbStatus = ORDER_STATUS_MAP[status];
      if (!dbStatus) throw new BadRequestException(`Invalid marketplace order status "${status}"`);
      const existing = await this.prisma.order.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Order not found');
      const updated = await this.prisma.order.update({ where: { id }, data: { status: dbStatus }, include: ORDER_INCLUDE });
      await this.logStatusOverride(adminUserId, 'Order', id, status);
      return mapOrder(updated);
    }

    if (type === 'laundry') {
      const dbStatus = LAUNDRY_STATUS_MAP[status];
      if (!dbStatus) throw new BadRequestException(`Invalid laundry booking status "${status}"`);
      const existing = await this.prisma.laundryBooking.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Booking not found');
      const updated = await this.prisma.laundryBooking.update({ where: { id }, data: { status: dbStatus }, include: BOOKING_INCLUDE });
      await this.logStatusOverride(adminUserId, 'LaundryBooking', id, status);
      return mapLaundryBooking(updated);
    }

    const dbStatus = SNACK_STATUS_MAP[status];
    if (!dbStatus) throw new BadRequestException(`Invalid snack order status "${status}"`);
    const existing = await this.prisma.snackOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Snack order not found');
    const updated = await this.prisma.snackOrder.update({ where: { id }, data: { status: dbStatus }, include: SNACK_ORDER_INCLUDE });
    await this.logStatusOverride(adminUserId, 'SnackOrder', id, status);
    return mapSnackOrder(updated);
  }

  private async logStatusOverride(adminUserId: string, targetType: string, targetId: string, status: string): Promise<void> {
    await this.auditLog.log({
      actorId: adminUserId,
      action: 'order.status_override',
      targetType,
      targetId,
      metadata: { status },
    });
  }

  // -----------------------------------------------------------------
  // Per-kind summary builders — each batches its own name lookups
  // (vendor/partner/seller/customer) rather than N+1 querying per row.
  // -----------------------------------------------------------------

  private async listMarketplace(): Promise<AdminOrderSummary[]> {
    const orders = await this.prisma.order.findMany({ include: ORDER_INCLUDE, orderBy: { placedAt: 'desc' } });
    if (orders.length === 0) return [];

    const userIds = [...new Set(orders.map((o) => o.userId))];
    const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId).filter((x): x is string => !!x)))];

    const [users, products] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, vendor: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const userNameById = new Map(users.map((u) => [u.id, u.name]));
    const vendorNameByProductId = new Map(products.map((p) => [p.id, p.vendor.name]));

    return orders.map((order) => {
      const vendorNames = new Set<string>();
      for (const item of order.items) {
        if (item.productId) {
          const name = vendorNameByProductId.get(item.productId);
          if (name) vendorNames.add(name);
        }
      }
      return {
        id: `marketplace:${order.id}`,
        type: 'marketplace' as const,
        reference: order.orderNumber,
        customerName: userNameById.get(order.userId) ?? 'Unknown customer',
        customerUserId: order.userId,
        sellerNames: vendorNames.size > 0 ? Array.from(vendorNames) : ['—'],
        status: mapOrder(order).status,
        total: Number(order.total),
        placedAt: order.placedAt.toISOString(),
      };
    });
  }

  private async listLaundry(): Promise<AdminOrderSummary[]> {
    const bookings = await this.prisma.laundryBooking.findMany({ include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
    if (bookings.length === 0) return [];

    const userIds = [...new Set(bookings.map((b) => b.userId))];
    const partnerIds = [...new Set(bookings.map((b) => b.partnerId).filter((x): x is string => !!x))];

    const [users, partners] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      partnerIds.length
        ? this.prisma.seller.findMany({ where: { id: { in: partnerIds } }, select: { id: true, displayName: true } })
        : Promise.resolve([]),
    ]);
    const userNameById = new Map(users.map((u) => [u.id, u.name]));
    const partnerNameById = new Map(partners.map((p) => [p.id, p.displayName]));

    return bookings.map((booking) => ({
      id: `laundry:${booking.id}`,
      type: 'laundry' as const,
      reference: booking.bookingNumber,
      customerName: userNameById.get(booking.userId) ?? 'Unknown customer',
      customerUserId: booking.userId,
      sellerNames: [booking.partnerId ? (partnerNameById.get(booking.partnerId) ?? 'Unassigned') : 'Unassigned'],
      status: mapLaundryBooking(booking).status,
      total: Number(booking.estimatedTotal),
      placedAt: booking.createdAt.toISOString(),
    }));
  }

  private async listSnack(): Promise<AdminOrderSummary[]> {
    const orders = await this.prisma.snackOrder.findMany({ include: SNACK_ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
    if (orders.length === 0) return [];

    const sellerIds = [...new Set(orders.map((o) => o.sellerId))];
    const sellers = await this.prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, displayName: true } });
    const sellerNameById = new Map(sellers.map((s) => [s.id, s.displayName]));

    return orders.map((order) => ({
      id: `snack:${order.id}`,
      type: 'snack' as const,
      reference: order.id.toUpperCase(),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      sellerNames: [sellerNameById.get(order.sellerId) ?? 'Unknown seller'],
      status: mapSnackOrder(order).status,
      total: Number(order.total),
      placedAt: order.createdAt.toISOString(),
    }));
  }
}
