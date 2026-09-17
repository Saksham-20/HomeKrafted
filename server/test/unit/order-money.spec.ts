import { OrderStatus } from '@prisma/client';
import {
  COUNTED_ORDER_STATUSES,
  REVENUE_ORDER_STATUSES,
  countedOrderWhere,
  revenueOrderWhere,
  revenueStatusSql,
  countedStatusSql,
} from '../../src/common/orders/order-money';

/**
 * Regression: an abandoned checkout counted as revenue
 * Found by /qa on 2026-09-17
 * Report: .gstack/qa-reports/qa-report-localhost-2026-09-17.md
 *
 * Every order is written at `pending_payment` before it is paid and the
 * cart is emptied in the same transaction, so closing the payment sheet
 * leaves a row carrying a full basket total nobody paid. Four figures
 * summed those rows. Measured on a dev box with one paid ₹640 order and
 * one abandoned checkout for the same item, the kitchen's dashboard read
 * ₹1,280.
 *
 * Expected values are reasoned from the enum, never recorded from a run
 * (docs/TESTS.md).
 */
describe('order money status sets', () => {
  it('never counts an order that was written but never paid', () => {
    expect(COUNTED_ORDER_STATUSES).not.toContain(OrderStatus.pending_payment);
    expect(REVENUE_ORDER_STATUSES).not.toContain(OrderStatus.pending_payment);
  });

  it('counts a cancelled order as an order, but never as money', () => {
    // A cancellation is a real event a kitchen should see in its order
    // count; it also refunds the buyer (M15), so it is not income.
    expect(COUNTED_ORDER_STATUSES).toContain(OrderStatus.cancelled);
    expect(REVENUE_ORDER_STATUSES).not.toContain(OrderStatus.cancelled);
  });

  it('keeps a returned order in revenue, because a return moves no money on its own', () => {
    // M15: a return request is resolved by an admin. Dropping it here
    // would understate what a kitchen is owed.
    expect(REVENUE_ORDER_STATUSES).toContain(OrderStatus.returned);
  });

  it('treats every fulfilment status between placed and delivered as both', () => {
    for (const status of [
      OrderStatus.placed,
      OrderStatus.confirmed,
      OrderStatus.packed,
      OrderStatus.shipped,
      OrderStatus.delivered,
    ]) {
      expect(COUNTED_ORDER_STATUSES).toContain(status);
      expect(REVENUE_ORDER_STATUSES).toContain(status);
    }
  });

  /**
   * A new `OrderStatus` value must not land in the enum and silently
   * default into neither set — that is how `pending_payment` itself went
   * uncounted-for for a year. Every value is accounted for explicitly.
   */
  it('accounts for every OrderStatus value', () => {
    const all = Object.values(OrderStatus);
    const accountedFor = new Set<string>([...COUNTED_ORDER_STATUSES, OrderStatus.pending_payment]);
    expect([...all].sort()).toEqual([...accountedFor].sort());
  });

  it('exposes the same sets as Prisma where clauses', () => {
    expect(countedOrderWhere).toEqual({ status: { in: COUNTED_ORDER_STATUSES } });
    expect(revenueOrderWhere).toEqual({ status: { in: REVENUE_ORDER_STATUSES } });
  });

  /**
   * The raw-SQL call sites (`SellerService.getDashboard`'s today-revenue
   * sum and `computeGmvSeries`) interpolate these fragments, so a value
   * that fell out of the array must fall out of the SQL with it.
   */
  it('builds SQL fragments from the same arrays, parameterised and enum-cast', () => {
    expect(revenueStatusSql.values).toEqual(REVENUE_ORDER_STATUSES);
    expect(countedStatusSql.values).toEqual(COUNTED_ORDER_STATUSES);
    expect(revenueStatusSql.sql).toContain('"OrderStatus"');
    // Parameterised, not pasted: no status name appears in the SQL text.
    expect(revenueStatusSql.sql).not.toContain('delivered');
  });
});
