import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrderType } from './orders.service';
import { AdminSettingsService } from './settings.service';
import { AdminSupportService } from './support.service';

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
  /** When the longest-waiting application arrived — `undefined` when the queue is clear. */
  oldestPendingApplicationAt?: string;
  /** Listings sitting in `pending` moderation. */
  pendingListingsCount: number;
  /** When the longest-waiting listing was submitted — `undefined` when the queue is clear. */
  oldestPendingListingAt?: string;
  pendingPayoutsAmount: number;
  /** Real server-side aggregate of every `Wallet.balance` — the platform's total wallet liability. */
  walletLiability: number;
  /**
   * The needs-attention queue (M37): everything on the platform that is
   * waiting on an *admin* — cheap counts, each backing one row of the
   * dashboard's action list. Rows render only when non-zero.
   */
  attention: {
    pendingApplications: number;
    pendingListings: number;
    /** Support tickets a customer replied to last — "waiting on us". */
    supportWaiting: number;
    payoutRequests: number;
    corporateNew: number;
    flaggedListings: number;
  };
}

export interface AnalyticsDailyPoint {
  date: string;
  gmv: number;
  orderCount: number;
}

/**
 * How many rows a leaderboard returns.
 *
 * Ten rather than the mock path's six: more than the screen has ever
 * shown, still a bound. The point is that there is one.
 */
const LEADERBOARD_LIMIT = 10;

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
   * `commissionPct` — a what-if over gross sales, **not** a sum of what
   * was deducted. Whether payouts actually deduct the rate is
   * `commissionEnabled` (M37, default off); either way this figure stays
   * modelled, because "what would a 12% take rate have earned" is a
   * question the business needs answered before it can change one.
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
    private readonly support: AdminSupportService,
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

    const [
      approvedSellers,
      usersCount,
      pendingApplicationsCount,
      pendingPayoutsAgg,
      walletAgg,
      oldestPendingApplication,
      pendingProductsCount,
      oldestPendingProduct,
      pendingSnacksCount,
      oldestPendingSnack,
      pendingMealPlansCount,
      oldestPendingMealPlan,
      supportWaiting,
      payoutRequestsCount,
      corporateNew,
      flaggedProducts,
      flaggedSnacks,
      flaggedMealPlans,
    ] = await Promise.all([
      // `groupBy({ by: ['type'] })` no longer works: a HomeKrafter's
      // `specialties` is a list, so one account can land in several buckets
      // and the counts deliberately overlap (they sum to more than the
      // headcount). `activeHomeKraftersCount` is the real total.
      this.prisma.seller.findMany({ where: { status: 'approved' }, select: { specialties: true } }),
      this.prisma.user.count(),
      this.prisma.sellerApplication.count({ where: { status: { notIn: ['approved', 'rejected'] } } }),
      this.prisma.payout.aggregate({ where: { status: 'pending' }, _sum: { amount: true } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      // Moderation SLA (M27). A count answers "is there a queue"; the age
      // of the oldest item answers "is anyone being left waiting", which
      // is the question that matters while the platform is recruiting its
      // first kitchens — a five-day-old application is a supply problem,
      // not a backlog statistic.
      this.prisma.sellerApplication.findFirst({
        where: { status: { notIn: ['approved', 'rejected'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      // All three catalogue tables, not just Product (M28). The gate has
      // applied to snacks and meal plans since M22; this card counted
      // products alone, so it read "queue clear" while a snack sat pending
      // and unreachable. A card that reports an empty queue over a full one
      // is worse than no card.
      this.prisma.product.count({ where: { moderationStatus: 'pending' } }),
      this.prisma.product.findFirst({
        where: { moderationStatus: 'pending' },
        // `submittedAt` is when it entered the queue and survives a
        // re-save, so it is the honest age — `updatedAt` would reset every
        // time a HomeKrafter touched a field while waiting.
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true, createdAt: true },
      }),
      this.prisma.snack.count({ where: { moderationStatus: 'pending' } }),
      this.prisma.snack.findFirst({
        where: { moderationStatus: 'pending' },
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true },
      }),
      this.prisma.mealPlan.count({ where: { moderationStatus: 'pending' } }),
      this.prisma.mealPlan.findFirst({
        where: { moderationStatus: 'pending' },
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true, createdAt: true },
      }),
      // The needs-attention queue (M37) — everything waiting on an admin.
      this.support.countAwaitingReply(),
      this.prisma.payout.count({ where: { status: 'pending' } }),
      this.prisma.corporateInquiry.count({ where: { status: 'new' } }),
      this.prisma.product.count({ where: { moderationStatus: 'flagged' } }),
      this.prisma.snack.count({ where: { moderationStatus: 'flagged' } }),
      this.prisma.mealPlan.count({ where: { moderationStatus: 'flagged' } }),
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
      oldestPendingApplicationAt: oldestPendingApplication?.createdAt.toISOString(),
      pendingListingsCount: pendingProductsCount + pendingSnacksCount + pendingMealPlansCount,
      // The oldest across all three, so the age answers "is anyone being
      // left waiting" rather than "is any *product* being left waiting".
      oldestPendingListingAt: [
        oldestPendingProduct?.submittedAt ?? oldestPendingProduct?.createdAt,
        oldestPendingSnack?.submittedAt,
        oldestPendingMealPlan?.submittedAt ?? oldestPendingMealPlan?.createdAt,
      ]
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime())[0]
        ?.toISOString(),
      attention: {
        pendingApplications: pendingApplicationsCount,
        pendingListings: pendingProductsCount + pendingSnacksCount + pendingMealPlansCount,
        supportWaiting,
        payoutRequests: payoutRequestsCount,
        corporateNew,
        flaggedListings: flaggedProducts + flaggedSnacks + flaggedMealPlans,
      },
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

  /**
   * Top revenue-earners across all 3 seller types — makers attributed via
   * their vendor's order-item lines (an order can span more than one
   * vendor), laundry/snack via their own booking/order totals.
   *
   * **Aggregated in SQL, and that is the point (M41).** This used to be
   * `prisma.order.findMany({ include: { items: { include: { product } } } })`
   * with **no `where`, no `take` and no `select`** — every order ever
   * placed, with every one of its items, hydrated into Node heap on every
   * load of `/admin/analytics`. Beside it, `laundryBooking.findMany` with
   * no cap and a bare `snackOrder.findMany()`. Three growing tables read
   * whole, on a 1 vCPU box with a 600 MB process ceiling, to render a
   * leaderboard. It got slower every day the platform worked and would
   * eventually stop being slow and start being an OOM.
   *
   * The three `GROUP BY`s below return one row per earner — a set bounded
   * by how many HomeKrafters exist, not by how much they have sold — so
   * the merge, sort and name lookup stay in Node where they are cheap and
   * readable.
   *
   * Semantics preserved exactly: `revenue` is the sum of line totals, and
   * `orderCount` counts **orders**, not items, which is why the maker
   * query is `COUNT(DISTINCT "orderId")`. The old loop got that by
   * collapsing each order's items into a per-vendor map before
   * incrementing.
   */
  private async computeSellerLeaderboard(): Promise<AnalyticsLeaderboardRow[]> {
    const [makerRows, laundryRows, snackRows] = await Promise.all([
      this.prisma.$queryRaw<{ vendorId: string; revenue: unknown; orderCount: bigint }[]>`
        SELECT p."vendorId"                              AS "vendorId",
               SUM(oi."price" * oi."quantity")           AS "revenue",
               COUNT(DISTINCT oi."orderId")              AS "orderCount"
        FROM "OrderItem" oi
        JOIN "Product" p ON p."id" = oi."productId"
        WHERE oi."productId" IS NOT NULL
        GROUP BY p."vendorId"
      `,
      this.prisma.$queryRaw<{ partnerId: string; revenue: unknown; orderCount: bigint }[]>`
        SELECT "partnerId"              AS "partnerId",
               SUM("estimatedTotal")    AS "revenue",
               COUNT(*)                 AS "orderCount"
        FROM "LaundryBooking"
        WHERE "partnerId" IS NOT NULL
        GROUP BY "partnerId"
      `,
      this.prisma.$queryRaw<{ sellerId: string; revenue: unknown; orderCount: bigint }[]>`
        SELECT "sellerId"   AS "sellerId",
               SUM("total") AS "revenue",
               COUNT(*)     AS "orderCount"
        FROM "SnackOrder"
        GROUP BY "sellerId"
      `,
    ]);

    const vendorIds = makerRows.map((r) => r.vendorId);
    const partnerIds = laundryRows.map((r) => r.partnerId);
    const snackSellerIds = snackRows.map((r) => r.sellerId);
    const sellerIds = [...new Set([...partnerIds, ...snackSellerIds])];

    const [vendors, sellers] = await Promise.all([
      vendorIds.length ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      sellerIds.length ? this.prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, displayName: true } }) : Promise.resolve([]),
    ]);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const sellerNameById = new Map(sellers.map((s) => [s.id, s.displayName]));

    const byKey = new Map<string, AnalyticsLeaderboardRow>();
    const addRevenue = (
      key: string,
      name: string,
      type: 'maker' | 'laundry' | 'snack',
      amount: number,
      orderCount: number,
    ) => {
      const existing = byKey.get(key);
      if (existing) {
        existing.revenue += amount;
        existing.orderCount += orderCount;
      } else {
        byKey.set(key, { key, name, type, revenue: amount, orderCount });
      }
    };

    for (const row of makerRows) {
      const name = vendorNameById.get(row.vendorId);
      if (!name) continue;
      addRevenue(`vendor:${row.vendorId}`, name, 'maker', Number(row.revenue), Number(row.orderCount));
    }

    for (const row of laundryRows) {
      const name = sellerNameById.get(row.partnerId);
      if (!name) continue;
      addRevenue(`seller:${row.partnerId}`, name, 'laundry', Number(row.revenue), Number(row.orderCount));
    }

    for (const row of snackRows) {
      const name = sellerNameById.get(row.sellerId);
      if (!name) continue;
      addRevenue(`seller:${row.sellerId}`, name, 'snack', Number(row.revenue), Number(row.orderCount));
    }

    // Bounded on the way out too. The endpoint used to return every earner
    // and `AnalyticsClient` maps the array straight to rows, so the screen
    // grew a row per HomeKrafter forever; only the mock path capped it
    // (`client/lib/api/admin.ts` slices to 6). A leaderboard has a length.
    return Array.from(byKey.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, LEADERBOARD_LIMIT);
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
