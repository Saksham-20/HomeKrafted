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
import { OrderNotificationsService } from '../orders/order-notifications.service';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders.query.dto';

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
const DEFAULT_ORDER_PAGE_SIZE = 25;

/**
 * How deep `?page=` may go. Each page reads `page × pageSize` rows from
 * *each* of the three sources (see `listUnified`), so an uncapped page
 * number is a way to ask for the whole platform's order history one query
 * string at a time — precisely what this pagination exists to prevent.
 * Search is how a specific old order gets found.
 */
const MAX_ORDER_PAGE = 40;

/**
 * Hard ceiling on a CSV export. Reached, the file is short and the admin
 * narrows the date range — which is recoverable. Unbounded, the request
 * is what takes the API down, which is not.
 */
export const EXPORT_ROW_CAP = 20000;

export interface PaginatedOrders {
  items: AdminOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * The search predicates, one per source table, matching the three fields
 * the admin list row actually shows: reference, customer, HomeKrafter.
 *
 * `mode: 'insensitive'` throughout — an admin typing a customer's name in
 * lower case is the normal case, and a case-sensitive search that returns
 * nothing reads as "this order does not exist".
 */
function marketplaceSearchWhere(q?: string): Prisma.OrderWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { orderNumber: contains },
      { user: { name: contains } },
      { items: { some: { product: { vendor: { name: contains } } } } },
    ],
  };
}

function laundrySearchWhere(q?: string): Prisma.LaundryBookingWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [{ bookingNumber: contains }, { user: { name: contains } }, { partner: { displayName: contains } }],
  };
}

function snackSearchWhere(q?: string): Prisma.SnackOrderWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: 'insensitive' as const };
  // A snack order's "reference" is its own id upper-cased, and its
  // customer name is stored on the row (there is no `User` — these arrive
  // over WhatsApp from someone who may never have signed in).
  return {
    OR: [{ id: contains }, { customerName: contains }, { seller: { displayName: contains } }],
  };
}

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly ordersService: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AdminAuditLogService,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  /**
   * One page of every order-shaped row on the platform, newest first.
   *
   * **Why each source is read `depth` deep and not fully.** This is a
   * union of three unrelated tables that only share a sort key, so there
   * is no single query to page. But any row in the newest `depth` rows
   * *globally* must also be in the newest `depth` rows of its own table —
   * a row cannot be 60th-newest overall while being 200th-newest within
   * its own source. Taking `depth` from each and merging is therefore
   * exactly correct, and reads at most `3 × depth` rows instead of three
   * whole tables. It used to read all three in full, with every relation,
   * on every visit to `/admin/orders`.
   *
   * The cost is that deep pages read proportionally more, which is why
   * `page` is capped: page 200 of an order list is not a thing anybody
   * needs, and search is the tool for finding one specific order.
   */
  async listUnified(query: ListAdminOrdersQueryDto = {}): Promise<PaginatedOrders> {
    const type = query.type;
    const page = Math.min(query.page ?? 1, MAX_ORDER_PAGE);
    const pageSize = query.pageSize ?? DEFAULT_ORDER_PAGE_SIZE;
    const q = query.q?.trim() || undefined;
    const depth = page * pageSize;

    const wants = (kind: AdminOrderType) => !type || type === kind;

    const [marketplace, laundry, snack, total] = await Promise.all([
      wants('marketplace') ? this.listMarketplace(q, depth) : Promise.resolve([]),
      wants('laundry') ? this.listLaundry(q, depth) : Promise.resolve([]),
      wants('snack') ? this.listSnack(q, depth) : Promise.resolve([]),
      this.countUnified(type, q),
    ]);

    const merged = [...marketplace, ...laundry, ...snack].sort(
      (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
    );

    const start = (page - 1) * pageSize;
    return { items: merged.slice(start, start + pageSize), page, pageSize, total };
  }

  /**
   * Every order since `since`, for the CSV export, capped.
   *
   * An export legitimately wants more than a page — that is what it is
   * for — but "more than a page" is not "however many there are". The cap
   * is the difference between a slow download and an admin clicking
   * Export on a platform with a year of orders and taking the API's
   * memory with it. `since` is applied in the query rather than by
   * filtering the result, which is what made the date range cost the same
   * as no date range at all.
   */
  async listForExport(since?: Date, cap = EXPORT_ROW_CAP): Promise<AdminOrderSummary[]> {
    const [marketplace, laundry, snack] = await Promise.all([
      this.listMarketplace(undefined, cap, since),
      this.listLaundry(undefined, cap, since),
      this.listSnack(undefined, cap, since),
    ]);
    return [...marketplace, ...laundry, ...snack]
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
      .slice(0, cap);
  }

  /**
   * The three counts, added up. Separate from the page read because a
   * count over an index is cheap and the alternative — inferring a total
   * from a page — cannot distinguish "the last page" from "as deep as we
   * looked".
   */
  private async countUnified(type: AdminOrderType | undefined, q?: string): Promise<number> {
    const wants = (kind: AdminOrderType) => !type || type === kind;
    const [marketplace, laundry, snack] = await Promise.all([
      wants('marketplace')
        ? this.prisma.order.count({ where: marketplaceSearchWhere(q) })
        : Promise.resolve(0),
      wants('laundry')
        ? this.prisma.laundryBooking.count({ where: laundrySearchWhere(q) })
        : Promise.resolve(0),
      wants('snack') ? this.prisma.snackOrder.count({ where: snackSearchWhere(q) }) : Promise.resolve(0),
    ]);
    return marketplace + laundry + snack;
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
      const updated = await this.prisma.order.update({
        where: { id },
        // An admin override is the other way an order reaches
        // `delivered`, so it stamps `deliveredAt` too — otherwise the
        // return window would silently fall back to `placedAt`.
        data: { status: dbStatus, ...(dbStatus === 'delivered' ? { deliveredAt: new Date() } : {}) },
        include: ORDER_INCLUDE,
      });
      await this.logStatusOverride(adminUserId, 'Order', id, status);

      // An admin override is a real status change, so it owes the buyer
      // the same message the HomeKrafter's own advance would have sent.
      // A support agent fixing a stuck order should not leave the customer
      // less informed than the normal path would have.
      void this.orderNotifications.notifyBuyerOfStatus(id, dbStatus);
      if (dbStatus === 'cancelled') {
        void this.orderNotifications.notifyHomeKraftersOfCancellation(id);
      }

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

  private async listMarketplace(q: string | undefined, depth: number, since?: Date): Promise<AdminOrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { ...marketplaceSearchWhere(q), ...(since ? { placedAt: { gte: since } } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { placedAt: 'desc' },
      take: depth,
    });
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

  private async listLaundry(q: string | undefined, depth: number, since?: Date): Promise<AdminOrderSummary[]> {
    const bookings = await this.prisma.laundryBooking.findMany({
      where: { ...laundrySearchWhere(q), ...(since ? { createdAt: { gte: since } } : {}) },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: depth,
    });
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

  private async listSnack(q: string | undefined, depth: number, since?: Date): Promise<AdminOrderSummary[]> {
    const orders = await this.prisma.snackOrder.findMany({
      where: { ...snackSearchWhere(q), ...(since ? { createdAt: { gte: since } } : {}) },
      include: SNACK_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: depth,
    });
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
