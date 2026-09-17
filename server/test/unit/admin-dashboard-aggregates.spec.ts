import { AdminDashboardService, istDayStart } from '../../src/admin/dashboard.service';

/**
 * `istDayStart` — hand-computed instants, never recorded from a run
 * (docs/TESTS.md rule), same worked-example style as `menu-lock.spec.ts`.
 *
 * IST is UTC+5:30, so 00:00 IST on a given calendar date is 18:30 UTC on
 * the date before.
 */
describe('istDayStart', () => {
  it('resolves to the previous UTC day at 18:30 when it is already past midnight IST', () => {
    // 2026-09-17T02:00:00Z = 2026-09-17T07:30 IST — IST calendar day 17.
    expect(istDayStart(new Date('2026-09-17T02:00:00.000Z')).toISOString()).toBe(
      '2026-09-16T18:30:00.000Z',
    );
  });

  it('stays on the same IST calendar day for an instant just before the next IST midnight', () => {
    // 2026-09-17T18:29:59Z = 2026-09-17T23:59:59 IST — still IST day 17.
    expect(istDayStart(new Date('2026-09-17T18:29:59.000Z')).toISOString()).toBe(
      '2026-09-16T18:30:00.000Z',
    );
  });

  it('rolls over to the next IST calendar day exactly at the boundary', () => {
    // 2026-09-17T18:30:00Z = 2026-09-18T00:00:00 IST — now IST day 18.
    expect(istDayStart(new Date('2026-09-17T18:30:00.000Z')).toISOString()).toBe(
      '2026-09-17T18:30:00.000Z',
    );
  });

  /**
   * The bug this replaces: `new Date(); .setHours(0, 0, 0, 0)` mutates in
   * the *process's local* timezone, which on the production VPS (Etc/UTC)
   * is UTC midnight — 5:30am IST, not 00:00 IST. An order placed at
   * 2026-09-16T20:00:00Z (= 2026-09-17T01:30 IST, well inside IST calendar
   * day 17) falls *before* the old UTC-midnight boundary
   * (2026-09-17T00:00:00Z) computed `if("now" were 2026-09-17T02:00Z, so it
   * was silently excluded from "orders today" although any human reading
   * the dashboard in India would call it today's order. The IST boundary
   * includes it.
   */
  it('includes an order placed in the small hours of the IST day that the old UTC-midnight boundary excluded', () => {
    const now = new Date('2026-09-17T02:00:00.000Z');
    const oldBuggyBoundary = new Date(now);
    oldBuggyBoundary.setUTCHours(0, 0, 0, 0); // stand-in for local-midnight on an Etc/UTC process
    const orderPlacedAt = new Date('2026-09-16T20:00:00.000Z');

    expect(orderPlacedAt.getTime() >= oldBuggyBoundary.getTime()).toBe(false); // old code: miscounted as not-today
    expect(orderPlacedAt.getTime() >= istDayStart(now).getTime()).toBe(true); // fixed: correctly today
  });
});

/**
 * `computeWalletFlow` and `computeNewUsersByMonth` used to be
 * `walletTransaction.findMany({...})`/`user.findMany({...})` with no
 * `where` and no cap — every row, every `/admin/analytics` load. The stub
 * below deliberately does not define either method: if either code path
 * ever reaches for it again, the mock throws instead of silently reading
 * the whole table.
 */
function stubPrisma(opts: {
  walletRows: { direction: string; category: string; total: number }[];
  userRows: { month: string; count: bigint }[];
}) {
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('"WalletTransaction"')) return Promise.resolve(opts.walletRows);
    if (sql.includes('"User"')) return Promise.resolve(opts.userRows);
    if (sql.includes('all_orders')) return Promise.resolve([]); // computeGmvSeries
    if (sql.includes('JOIN "Product" p')) return Promise.resolve([]); // seller leaderboard: makers
    if (sql.includes('"partnerId"')) return Promise.resolve([]); // seller leaderboard: laundry
    if (sql.includes('"SnackOrder"')) return Promise.resolve([]); // seller leaderboard: snacks
    throw new Error(`unexpected $queryRaw call: ${sql}`);
  });

  const prisma = {
    $queryRaw: queryRaw,
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { _all: 0 } }),
      // The marketplace order *count* is its own query since 2026-09-17:
      // GMV sums only revenue-bearing statuses while the count keeps
      // cancellations, so one `aggregate` can no longer answer both.
      count: jest.fn().mockResolvedValue(0),
    },
    laundryBooking: { aggregate: jest.fn().mockResolvedValue({ _sum: { estimatedTotal: 0 }, _count: { _all: 0 } }) },
    snackOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { _all: 0 } }) },
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    // No `vendor.findMany`/`seller.findMany`: the leaderboard queries above
    // return no rows, so `vendorIds`/`sellerIds` are empty and those name
    // lookups are short-circuited before ever reaching Prisma.
  };

  const settings = { get: jest.fn().mockResolvedValue({ commissionPct: 10, commissionEnabled: false, commissionGstPct: 18 }) };
  const support = {};

  const service = new AdminDashboardService(prisma as never, settings as never, support as never);
  return { service, prisma, queryRaw };
}

describe('AdminDashboardService — wallet flow and new-users aggregation', () => {
  it('sums credits, debits and per-category totals from the grouped SQL rows, not a full table read', async () => {
    const { service, queryRaw } = stubPrisma({
      walletRows: [
        { direction: 'credit', category: 'topup', total: 500 },
        { direction: 'credit', category: 'cashback', total: 50 },
        { direction: 'debit', category: 'order_payment', total: 300 },
      ],
      userRows: [],
    });

    const analytics = await service.getAnalytics(7);

    expect(analytics.walletFlow).toEqual({
      creditsTotal: 550,
      debitsTotal: 300,
      netFlow: 250,
      byCategory: { topup: 500, cashback: 50, order_payment: 300 },
    });
    // Grouped in SQL — one row per (direction, category), not one per
    // transaction ever recorded.
    expect(queryRaw).toHaveBeenCalled();
  });

  it('reports one point per month from the grouped SQL rows', async () => {
    const { service } = stubPrisma({
      walletRows: [],
      userRows: [
        { month: '2026-07', count: 3n },
        { month: '2026-08', count: 5n },
      ],
    });

    const analytics = await service.getAnalytics(7);

    expect(analytics.newUsersByMonth).toEqual([
      { month: '2026-07', count: 3 },
      { month: '2026-08', count: 5 },
    ]);
  });
});
