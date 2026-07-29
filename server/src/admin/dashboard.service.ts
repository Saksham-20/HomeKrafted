import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrderSummary, AdminOrdersService, AdminOrderType } from './orders.service';

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
  gmvSeries: AnalyticsDailyPoint[];
  ordersByType: Record<AdminOrderType, number>;
  topSellers: AnalyticsLeaderboardRow[];
  topProducts: AnalyticsProductRow[];
  newUsersByMonth: AnalyticsMonthPoint[];
  walletFlow: AnalyticsWalletFlow;
}

function last14Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
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
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: AdminOrdersService,
  ) {}

  async getDashboard(): Promise<AdminDashboardSnapshot> {
    const unified = await this.ordersService.listUnified();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const gmvTotal = unified.reduce((sum, o) => sum + o.total, 0);
    const ordersTodayCount = unified.filter((o) => new Date(o.placedAt) >= todayStart).length;

    const ordersByType: Record<AdminOrderType, number> = { marketplace: 0, laundry: 0, snack: 0 };
    for (const order of unified) ordersByType[order.type] += 1;

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
      ordersTotalCount: unified.length,
      ordersByType,
      activeHomeKraftersCount: approvedSellers.length,
      activeBySpecialty,
      usersCount,
      pendingApplicationsCount,
      pendingPayoutsAmount: Number(pendingPayoutsAgg._sum.amount ?? 0),
      walletLiability: Number(walletAgg._sum.balance ?? 0),
    };
  }

  async getAnalytics(): Promise<AdminAnalyticsSnapshot> {
    const unified = await this.ordersService.listUnified();

    const ordersByType: Record<AdminOrderType, number> = { marketplace: 0, laundry: 0, snack: 0 };
    for (const order of unified) ordersByType[order.type] += 1;

    const [topSellers, topProducts, newUsersByMonth, walletFlow] = await Promise.all([
      this.computeSellerLeaderboard(),
      this.computeProductLeaderboard(),
      this.computeNewUsersByMonth(),
      this.computeWalletFlow(),
    ]);

    return {
      gmvSeries: this.computeGmvSeries(unified),
      ordersByType,
      topSellers: topSellers.slice(0, 6),
      topProducts: topProducts.slice(0, 6),
      newUsersByMonth,
      walletFlow,
    };
  }

  private computeGmvSeries(unified: AdminOrderSummary[]): AnalyticsDailyPoint[] {
    return last14Days().map((date) => {
      const dayOrders = unified.filter((o) => o.placedAt.slice(0, 10) === date);
      return { date, gmv: dayOrders.reduce((sum, o) => sum + o.total, 0), orderCount: dayOrders.length };
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
