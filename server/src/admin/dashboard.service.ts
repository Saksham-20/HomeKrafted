import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrderType } from './orders.service';
import { AdminSettingsService } from './settings.service';

export interface AdminDashboardSnapshot {
  /** Sum of every unified order/booking/snack-order total — a proxy for GMV; nets nothing out (vendor payout share is a `Payout`-ledger concern, not this KPI). */
  gmvTotal: number;
  ordersTodayCount: number;
  ordersTotalCount: number;
  ordersByType: Record<AdminOrderType, number>;
  /** Total approved HomeKrafters — the real headcount. */
  activeHomeKraftersCount: number;
  /** Per-specialty counts. Deliberately overlapping: one HomeKrafter with
   *  three specialties is counted in all three, so these sum to more than
   *  `activeHomeKraftersCount`. */
  activeBySpecialty: Record<string, number>;
  usersCount: number;
  pendingApplicationsCount: number;
  pendingPayoutsAmount: number;
  /** Real server-side aggregate of every `Wallet.balance` — the platform's total wallet liability. */
  walletLiability: number;
}

export interface AnalyticsDailyPoint {
  date: string;
  gmv: number;
  orderCount: number;
}

export interface AnalyticsLeaderboardRow {
  key: string;
  name: string;
  type: 'maker' | 'laundry' | 'snack';
  orderCount: number;
  revenue: number;
}

export interface AnalyticsProductRow {
  productId: string;
  name: string;
  unitsOrdered: number;
  revenue: number;
}

export interface AnalyticsMonthPoint {
  month: string;
  count: number;
}

export interface AnalyticsWalletFlow {
  creditsTotal: number;
  debitsTotal: number;
  netFlow: number;
  byCategory: Record<string, number>;
}

export interface AdminAnalyticsSnapshot {
  /** Days in the window, echoed back so the client labels the range it got rather than the one it asked for. */
  days: number;
  /**
   * Modelled platform take on the window's GMV at the configured
   * `commissionPct`. **Nothing deducts this** — `Payout` amounts are
   * gross and settlement is manual — so every surface that renders it
   * says so. It exists because "what would a 12% take rate have earned"
   * is a question the business needs answered before it can set one.
   */
  commissionPct: number;
  modelledCommission: number;
  gmvSeries: AnalyticsDailyPoint[];
  ordersByType: Record<AdminOrderType, number>;
  topSellers: AnalyticsLeaderboardRow[];
  topProducts: AnalyticsProductRow[];
  newUsersByMonth: AnalyticsMonthPoint[];
  walletFlow: AnalyticsWalletFlow;
}

/** M16 (M5): the range is a parameter now — the chart was pinned at 14 days with no way to ask for a quarter. */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Dashboard KPIs + analytics — real server-side aggregates over the same
 * tables `AdminOrdersService` unifies, mirroring the shapes
 * `client/lib/api/admin.ts`'s `AdminDashboardSnapshot`/
 * `AdminAnalyticsSnapshot` already established so M8.4's swap is a
 * straight `fetch()` substitution. Demo-scale data volume (seeded
 * Postgres, not production traffic) is why this reads full result sets
 * into memory for aggregation rather than pushing every rollup into SQL
 * — the same tradeoff `SellerService.getDashboard`'s per-seller
 * dashboards already make.
 */
/** Money rounded to paise — a SUM over Decimal columns comes back as a float. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AdminSettingsService,
  ) {}

  async getDashboard(): Promise<AdminDashboardSnapshot> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Every figure on this screen is a SUM or a COUNT, and all of them
    // used to be computed by loading every order, booking and snack order
    // on the platform — with nested `include`s — into memory and reducing
    // over the array. Postgres does this over an index without moving the
    // rows anywhere.
    const { gmvTotal, ordersByType, ordersTotalCount, ordersTodayCount } =
      await this.orderTotals(todayStart);

    const [approvedSellers, usersCount, pendingApplicationsCount, pendingPayoutsAgg, walletAgg] = await Promise.all([
      // `groupBy({ by: ['type'] })` no longer works: a HomeKrafter's
      // `specialties` is a list, so one account can land in several buckets
      // and the counts deliberately overlap (they sum to more than the
      // headcount). `activeHomeKraftersCount` is the real total.
      this.prisma.seller.findMany({ where: { status: 'approved' }, select: { specialties: true } }),
      this.prisma.user.count(),
      this.prisma.sellerApplication.count({ where: { status: { notIn: ['approved', 'rejected'] } } }),
      this.prisma.payout.aggregate({ where: { status: 'pending' }, _sum: { amount: true } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
    ]);

    const activeBySpecialty: Record<string, number> = {};
    for (const row of approvedSellers) {
      for (const specialty of row.specialties) {
        activeBySpecialty[specialty] = (activeBySpecialty[specialty] ?? 0) + 1;
      }
    }

    return {
      gmvTotal,
      ordersTodayCount,
      ordersTotalCount,
      ordersByType,
      activeHomeKraftersCount: approvedSellers.length,
      activeBySpecialty,
      usersCount,
      pendingApplicationsCount,
      pendingPayoutsAmount: Number(pendingPayoutsAgg._sum.amount ?? 0),
      walletLiability: Number(walletAgg._sum.balance ?? 0),
    };
  }

  async getAnalytics(requestedDays = 14): Promise<AdminAnalyticsSnapshot> {
    const days = Math.min(Math.max(Math.trunc(requestedDays) || 14, 1), 365);

    const [{ ordersByType }, gmvSeries, topSellers, topProducts, newUsersByMonth, walletFlow, settings] =
      await Promise.all([
        this.orderTotals(),
        this.computeGmvSeries(days),
        this.computeSellerLeaderboard(),
        this.computeProductLeaderboard(),
        this.computeNewUsersByMonth(),
        this.computeWalletFlow(),
        this.settings.get(),
      ]);
    const windowGmv = gmvSeries.reduce((sum, p) => sum + p.gmv, 0);

    return {
      days,
      commissionPct: settings.commissionPct,
      modelledCommission: Math.round(windowGmv * (settings.commissionPct / 100) * 100) / 100,
      gmvSeries,
      ordersByType,
      topSellers: topSellers.slice(0, 6),
      topProducts: topProducts.slice(0, 6),
      newUsersByMonth,
      walletFlow,
    };
  }

  /**
   * Counts and sums across the three order-shaped tables, in the database.
   *
   * Six aggregates instead of three full table reads. `todayStart` is
   * optional because the analytics screen wants the type breakdown but not
   * "today" — asking for a count nothing renders is the same waste in
   * miniature.
   */
  private async orderTotals(todayStart?: Date) {
    const since = todayStart ? { gte: todayStart } : undefined;

    const [orderAgg, bookingAgg, snackAgg, ordersToday, bookingsToday, snacksToday] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { total: true }, _count: { _all: true } }),
      this.prisma.laundryBooking.aggregate({ _sum: { estimatedTotal: true }, _count: { _all: true } }),
      this.prisma.snackOrder.aggregate({ _sum: { total: true }, _count: { _all: true } }),
      since ? this.prisma.order.count({ where: { placedAt: since } }) : Promise.resolve(0),
      since ? this.prisma.laundryBooking.count({ where: { createdAt: since } }) : Promise.resolve(0),
      since ? this.prisma.snackOrder.count({ where: { createdAt: since } }) : Promise.resolve(0),
    ]);

    const ordersByType: Record<AdminOrderType, number> = {
      marketplace: orderAgg._count._all,
      laundry: bookingAgg._count._all,
      snack: snackAgg._count._all,
    };

    return {
      gmvTotal: round2(
        Number(orderAgg._sum.total ?? 0) +
          Number(bookingAgg._sum.estimatedTotal ?? 0) +
          Number(snackAgg._sum.total ?? 0),
      ),
      ordersByType,
      ordersTotalCount: ordersByType.marketplace + ordersByType.laundry + ordersByType.snack,
      ordersTodayCount: ordersToday + bookingsToday + snacksToday,
    };
  }

  /**
   * Daily GMV for the last `days` days, grouped by date in SQL.
   *
   * Raw rather than `groupBy`, because Prisma cannot group on a derived
   * value and the group key here is `date_trunc('day', ...)`. The
   * alternative was reading every order ever placed and bucketing the
   * strings in JavaScript, which is what this replaces.
   *
   * **The window boundary is a string, not a `Date`, on purpose.** These
   * columns are `timestamp without time zone` holding UTC, and
   * `date_trunc` here runs with no zone — but a JS `Date` bound as a
   * parameter goes through the driver's timezone conversion on the way in.
   * On a connection with `timezone = Asia/Kolkata` that moved the start of
   * the window forward by 5½ hours, so the oldest day in the chart
   * silently lost every order placed before 05:30 UTC. Caught by checking
   * the endpoint against the same aggregate run by hand in psql — the
   * numbers disagreed on exactly one day, which is what this class of bug
   * looks like from the outside. Casting a literal keeps both sides in the
   * one frame the data is actually stored in.
   */
  private async computeGmvSeries(days: number): Promise<AnalyticsDailyPoint[]> {
    const dates = lastNDays(days);
    const since = `${dates[0]} 00:00:00`;

    const rows = await this.prisma.$queryRaw<{ date: string; gmv: number; order_count: bigint }[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS date, SUM(amount)::float8 AS gmv, COUNT(*) AS order_count
      FROM (
        SELECT date_trunc('day', "placedAt") AS d, "total" AS amount
          FROM "Order" WHERE "placedAt" >= ${since}::timestamp
        UNION ALL
        SELECT date_trunc('day', "createdAt"), "estimatedTotal"
          FROM "LaundryBooking" WHERE "createdAt" >= ${since}::timestamp
        UNION ALL
        SELECT date_trunc('day', "createdAt"), "total"
          FROM "SnackOrder" WHERE "createdAt" >= ${since}::timestamp
      ) AS all_orders
      GROUP BY d
    `;

    const byDate = new Map(rows.map((row) => [row.date, row]));
    // Driven by `lastNDays`, not by what the query returned — a day with
    // no orders is a zero on the chart, not a missing column.
    return dates.map((date) => {
      const row = byDate.get(date);
      return {
        date,
        gmv: row ? round2(row.gmv) : 0,
        orderCount: row ? Number(row.order_count) : 0,
      };
    });
  }

  /** Top revenue-earners across all 3 seller types — makers attributed via their vendor's order-item lines (an order can span more than one vendor), laundry/snack via their own booking/order totals. */
  private async computeSellerLeaderboard(): Promise<AnalyticsLeaderboardRow[]> {
    const [orders, bookings, snackOrders] = await Promise.all([
      this.prisma.order.findMany({ include: { items: { include: { product: { select: { vendorId: true } } } } } }),
      this.prisma.laundryBooking.findMany({ where: { partnerId: { not: null } } }),
      this.prisma.snackOrder.findMany(),
    ]);

    const vendorIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.product?.vendorId).filter((x): x is string => !!x)))];
    const partnerIds = [...new Set(bookings.map((b) => b.partnerId).filter((x): x is string => !!x))];
    const snackSellerIds = [...new Set(snackOrders.map((o) => o.sellerId))];
    const sellerIds = [...new Set([...partnerIds, ...snackSellerIds])];

    const [vendors, sellers] = await Promise.all([
      vendorIds.length ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      sellerIds.length ? this.prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, displayName: true } }) : Promise.resolve([]),
    ]);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const sellerNameById = new Map(sellers.map((s) => [s.id, s.displayName]));

    const byKey = new Map<string, AnalyticsLeaderboardRow>();
    const addRevenue = (key: string, name: string, type: 'maker' | 'laundry' | 'snack', amount: number) => {
      const existing = byKey.get(key);
      if (existing) {
        existing.revenue += amount;
        existing.orderCount += 1;
      } else {
        byKey.set(key, { key, name, type, revenue: amount, orderCount: 1 });
      }
    };

    for (const order of orders) {
      const vendorTotals = new Map<string, number>();
      for (const item of order.items) {
        const vendorId = item.product?.vendorId;
        if (!vendorId) continue;
        vendorTotals.set(vendorId, (vendorTotals.get(vendorId) ?? 0) + Number(item.price) * item.quantity);
      }
      for (const [vendorId, amount] of vendorTotals) {
        const name = vendorNameById.get(vendorId);
        if (!name) continue;
        addRevenue(`vendor:${vendorId}`, name, 'maker', amount);
      }
    }

    for (const booking of bookings) {
      if (!booking.partnerId) continue;
      const name = sellerNameById.get(booking.partnerId);
      if (!name) continue;
      addRevenue(`seller:${booking.partnerId}`, name, 'laundry', Number(booking.estimatedTotal));
    }

    for (const order of snackOrders) {
      const name = sellerNameById.get(order.sellerId);
      if (!name) continue;
      addRevenue(`seller:${order.sellerId}`, name, 'snack', Number(order.total));
    }

    return Array.from(byKey.values()).sort((a, b) => b.revenue - a.revenue);
  }

  private async computeProductLeaderboard(): Promise<AnalyticsProductRow[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { productId: { not: null } },
      select: { productId: true, name: true, price: true, quantity: true },
    });

    const byProduct = new Map<string, AnalyticsProductRow>();
    for (const item of items) {
      if (!item.productId) continue;
      const revenue = Number(item.price) * item.quantity;
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.unitsOrdered += item.quantity;
        existing.revenue += revenue;
      } else {
        byProduct.set(item.productId, { productId: item.productId, name: item.name, unitsOrdered: item.quantity, revenue });
      }
    }

    return Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);
  }

  private async computeNewUsersByMonth(): Promise<AnalyticsMonthPoint[]> {
    const users = await this.prisma.user.findMany({ select: { createdAt: true } });
    const byMonth = new Map<string, number>();
    for (const u of users) {
      const month = u.createdAt.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }

  private async computeWalletFlow(): Promise<AnalyticsWalletFlow> {
    const txns = await this.prisma.walletTransaction.findMany({ select: { direction: true, category: true, amount: true } });
    let creditsTotal = 0;
    let debitsTotal = 0;
    const byCategory: Record<string, number> = {};

    for (const t of txns) {
      const amount = Number(t.amount);
      if (t.direction === 'credit') creditsTotal += amount;
      else debitsTotal += amount;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + amount;
    }

    return { creditsTotal, debitsTotal, netFlow: creditsTotal - debitsTotal, byCategory };
  }
}
