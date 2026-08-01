import { Injectable } from '@nestjs/common';
import { Seller } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SellerDailyPoint {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface SellerTopItem {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

/** Orders per weekday, 0 = Sunday. The "and when" a home cook plans around. */
export interface SellerWeekdayPoint {
  weekday: number;
  orderCount: number;
  revenue: number;
}

export interface SellerAnalyticsTotals {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  unitsSold: number;
  /** `null` when the previous window had no orders — a percentage change from zero is not a number, it is a division by zero dressed up. */
  revenueChangePct: number | null;
  orderCountChangePct: number | null;
  /** Buyers who had ordered from this kitchen before, as a share of orders in the window. `null` until there is anything to divide. */
  repeatRate: number | null;
  cancellationRate: number | null;
}

export interface SellerAnalytics {
  /** Days in the window. Echoed back so the client renders the range it asked for, not the one it assumed. */
  days: number;
  from: string;
  to: string;
  totals: SellerAnalyticsTotals;
  series: SellerDailyPoint[];
  topItems: SellerTopItem[];
  byWeekday: SellerWeekdayPoint[];
}

const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * `/seller/analytics` (M16, H6) — "what is selling, and when".
 *
 * The seller portal had eight screens and none of them answered that.
 * A HomeKrafter could see today's orders and their payout balance, but
 * nothing told them which item earns, which day is busy, or whether this
 * month is better than last.
 *
 * **Revenue here is the seller's line-item share, not the order total.**
 * A marketplace order can span several vendors, so attributing the whole
 * `Order.total` to each of them (which is what the admin GMV proxy does,
 * deliberately and with a comment saying so) would overstate a home
 * cook's earnings and disagree with what they are actually paid. Every
 * marketplace figure below sums `OrderItem.price * quantity` over that
 * vendor's own products. Snack orders and laundry bookings belong to one
 * seller outright, so those use their own totals.
 *
 * Everything is computed from rows on read. Nothing is stored — the same
 * rule the rest of M15/M16 follows.
 */
@Injectable()
export class SellerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(seller: Seller, requestedDays: number): Promise<SellerAnalytics> {
    const days = Math.min(Math.max(Math.trunc(requestedDays) || 30, 1), MAX_DAYS);

    // Window boundaries at local midnight, so "last 30 days" means 30
    // whole days including today rather than a rolling 720 hours that
    // cuts this morning's orders in half.
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const from = new Date(to.getTime() - (days - 1) * DAY_MS);
    from.setHours(0, 0, 0, 0);
    // The equally-long window immediately before, for the deltas.
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY_MS);
    prevFrom.setHours(0, 0, 0, 0);

    const productIds = (
      await this.prisma.product.findMany({ where: { vendorId: seller.vendorId }, select: { id: true } })
    ).map((p) => p.id);

    const [current, previous] = await Promise.all([
      this.collect(seller, productIds, from, to),
      this.collect(seller, productIds, prevFrom, prevTo),
    ]);

    const buckets = new Map<string, SellerDailyPoint>();
    for (let i = 0; i < days; i += 1) {
      const key = dayKey(new Date(from.getTime() + i * DAY_MS));
      buckets.set(key, { date: key, revenue: 0, orderCount: 0 });
    }
    const weekdays: SellerWeekdayPoint[] = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      orderCount: 0,
      revenue: 0,
    }));

    for (const sale of current.sales) {
      const bucket = buckets.get(dayKey(sale.at));
      if (bucket) {
        bucket.revenue += sale.revenue;
        bucket.orderCount += 1;
      }
      const weekday = weekdays[sale.at.getDay()];
      weekday.orderCount += 1;
      weekday.revenue += sale.revenue;
    }

    const revenue = current.sales.reduce((sum, s) => sum + s.revenue, 0);
    const orderCount = current.sales.length;
    const settled = current.sales.filter((s) => s.settled).length;
    const cancelled = current.sales.filter((s) => s.cancelled).length;
    const repeatOrders = current.sales.filter((s) => s.repeat).length;

    const totals: SellerAnalyticsTotals = {
      revenue: round2(revenue),
      orderCount,
      averageOrderValue: orderCount === 0 ? 0 : round2(revenue / orderCount),
      unitsSold: current.unitsSold,
      revenueChangePct: percentChange(
        revenue,
        previous.sales.reduce((sum, s) => sum + s.revenue, 0),
      ),
      orderCountChangePct: percentChange(orderCount, previous.sales.length),
      // Both are `null` rather than 0 when there is nothing to divide by.
      // "0% repeat customers" reads as a verdict on a kitchen that has
      // simply not had any orders yet — same reasoning as the profile's
      // `cancellationRate`.
      repeatRate: orderCount === 0 ? null : repeatOrders / orderCount,
      cancellationRate: settled === 0 ? null : cancelled / settled,
    };

    return {
      days,
      from: dayKey(from),
      to: dayKey(to),
      totals,
      series: [...buckets.values()],
      topItems: current.topItems,
      byWeekday: weekdays.map((w) => ({ ...w, revenue: round2(w.revenue) })),
    };
  }

  /**
   * One pass over all three modules for a window. Returns a flat list of
   * "sales" — one per order/booking that touched this seller — so the
   * caller can bucket by day, by weekday and by total without three more
   * round trips.
   */
  private async collect(seller: Seller, productIds: string[], from: Date, to: Date) {
    const [orders, snackOrders, bookings] = await Promise.all([
      productIds.length === 0
        ? Promise.resolve([])
        : this.prisma.order.findMany({
            where: {
              placedAt: { gte: from, lte: to },
              items: { some: { productId: { in: productIds } } },
            },
            include: { items: true },
          }),
      this.prisma.snackOrder.findMany({
        where: { sellerId: seller.id, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.laundryBooking.findMany({
        where: { partnerId: seller.id, createdAt: { gte: from, lte: to } },
      }),
    ]);

    // "Has this buyer ordered from this kitchen before *this* order" —
    // resolved against their whole history, not just the window, so a
    // customer of two years does not read as new because their first
    // order predates the chart.
    //
    // Two identities, because there are genuinely two. A marketplace
    // order has a `userId`; a snack order is a WhatsApp order with no
    // account behind it at all, so the phone number is the only thing
    // that identifies the same person twice. Keeping the maps separate is
    // more honest than inventing a join between them.
    const firstOrderAt = await this.firstOrderPerBuyer(
      productIds,
      [...new Set(orders.map((o) => o.userId))],
    );
    const firstSnackAt = await this.firstSnackOrderPerPhone(
      seller,
      [...new Set(snackOrders.map((o) => o.customerPhone))],
    );

    const itemTotals = new Map<string, { name: string; unitsSold: number; revenue: number }>();
    let unitsSold = 0;

    const sales = [
      ...orders.map((order) => {
        // Line-item share only — see the class doc. An order spanning
        // three kitchens must not credit each of them with all of it.
        const mine = order.items.filter((i) => i.productId && productIds.includes(i.productId));
        let revenue = 0;
        for (const item of mine) {
          const lineTotal = Number(item.price) * item.quantity;
          revenue += lineTotal;
          unitsSold += item.quantity;
          const key = item.productId as string;
          const row = itemTotals.get(key) ?? { name: item.name, unitsSold: 0, revenue: 0 };
          row.unitsSold += item.quantity;
          row.revenue += lineTotal;
          itemTotals.set(key, row);
        }
        const first = firstOrderAt.get(order.userId);
        return {
          at: order.placedAt,
          revenue,
          cancelled: order.status === 'cancelled',
          settled: order.status === 'cancelled' || order.status === 'delivered',
          repeat: Boolean(first && first < order.placedAt),
        };
      }),
      ...snackOrders.map((order) => {
        const first = firstSnackAt.get(order.customerPhone);
        return {
          at: order.createdAt,
          revenue: Number(order.total),
          // `SnackOrderStatus` has no `cancelled` — a WhatsApp order that
          // falls through is a conversation, not a state transition, so
          // there is nothing to count here. Saying so beats reporting a
          // 0% cancellation rate we cannot actually observe.
          cancelled: false,
          settled: order.status === 'delivered',
          repeat: Boolean(first && first < order.createdAt),
        };
      }),
      ...bookings.map((booking) => ({
        at: booking.createdAt,
        revenue: Number(booking.estimatedTotal),
        cancelled: booking.status === 'cancelled',
        settled: booking.status === 'cancelled' || booking.status === 'delivered',
        // Not counted as repeat-or-new: a laundry booking's customer
        // identity lives on the booking's own user relation, and folding
        // it into the marketplace map would mean treating every laundry
        // customer as new. Leaving them out of the numerator is a smaller
        // lie than counting them wrong.
        repeat: false,
      })),
    ];

    const topItems: SellerTopItem[] = [...itemTotals.entries()]
      .map(([productId, row]) => ({
        productId,
        name: row.name,
        unitsSold: row.unitsSold,
        revenue: round2(row.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return { sales, topItems, unitsSold };
  }

  /** Earliest marketplace order each buyer ever placed with this vendor. */
  private async firstOrderPerBuyer(
    productIds: string[],
    buyerIds: string[],
  ): Promise<Map<string, Date>> {
    const firstAt = new Map<string, Date>();
    if (buyerIds.length === 0 || productIds.length === 0) return firstAt;

    const orders = await this.prisma.order.findMany({
      where: { userId: { in: buyerIds }, items: { some: { productId: { in: productIds } } } },
      select: { userId: true, placedAt: true },
    });
    for (const { userId, placedAt } of orders) {
      const seen = firstAt.get(userId);
      if (!seen || placedAt < seen) firstAt.set(userId, placedAt);
    }
    return firstAt;
  }

  /** Same, for snack orders — keyed by phone, which is all a WhatsApp order has. */
  private async firstSnackOrderPerPhone(
    seller: Seller,
    phones: string[],
  ): Promise<Map<string, Date>> {
    const firstAt = new Map<string, Date>();
    if (phones.length === 0) return firstAt;

    const snackOrders = await this.prisma.snackOrder.findMany({
      where: { sellerId: seller.id, customerPhone: { in: phones } },
      select: { customerPhone: true, createdAt: true },
    });
    for (const { customerPhone, createdAt } of snackOrders) {
      const seen = firstAt.get(customerPhone);
      if (!seen || createdAt < seen) firstAt.set(customerPhone, createdAt);
    }
    return firstAt;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
