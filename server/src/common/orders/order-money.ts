import { OrderStatus, Prisma } from '@prisma/client';

/**
 * Which orders may be counted, and which may be called money
 * (2026-09-17).
 *
 * **Every order is written before it is paid.** `OrdersService.create`
 * inserts the row at `pending_payment` and empties the cart in the same
 * transaction; only the Razorpay webhook or `POST /orders/:id/pay` moves
 * it to `placed`. So every buyer who opens the payment sheet and closes
 * it — a dismissed modal, a lost connection, a closed tab, which is the
 * ordinary way a checkout ends — leaves a `pending_payment` row behind
 * carrying a full basket total that nobody ever paid.
 *
 * Four figures summed or counted those rows: the kitchen's own
 * "Today's revenue" and "Today's orders" (`SellerService.getDashboard`),
 * the platform's GMV and its daily GMV series
 * (`AdminDashboardService`), and the seller analytics revenue series.
 * Measured on a dev box with one real ₹640 wallet order and one
 * abandoned checkout for the same item: the kitchen's dashboard read
 * **₹1,280**. A home cook deciding what to buy tomorrow reads that
 * number.
 *
 * Two sets, because they answer different questions, and collapsing
 * them is how a cancellation stops being visible at all:
 *
 * - `COUNTED_ORDER_STATUSES` — *did an order happen?* Everything a buyer
 *   actually placed, cancellations included. A cancelled order is a real
 *   event a kitchen should see in its order count.
 * - `REVENUE_ORDER_STATUSES` — *is this money?* The same set less
 *   `cancelled`, because a cancellation refunds the buyer (M15: "a
 *   cancellation *does* refund"), so the kitchen never receives it.
 *   `returned` stays in deliberately: a return request moves no money on
 *   its own — an admin resolves it — so dropping it here would understate
 *   what a kitchen is actually owed.
 *
 * Neither is the payout rule. `SellerPayoutsService` pays on
 * `delivered` alone and stays the authority on money that has actually
 * been earned; these two describe what a *dashboard* may claim, which is
 * a looser and more immediate question ("nothing delivered yet today" is
 * not the same as "you sold nothing today").
 *
 * Prisma and raw SQL both need this, so it ships in both shapes. Never
 * inline the list at a call site: the whole defect was four call sites
 * each deciding for themselves, and three of them deciding nothing.
 */
export const COUNTED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.confirmed,
  OrderStatus.packed,
  OrderStatus.shipped,
  OrderStatus.delivered,
  OrderStatus.cancelled,
  OrderStatus.returned,
];

export const REVENUE_ORDER_STATUSES: OrderStatus[] = COUNTED_ORDER_STATUSES.filter(
  (status) => status !== OrderStatus.cancelled,
);

/** `{ status: { in: [...] } }` for a Prisma `where`. */
export const countedOrderWhere = { status: { in: COUNTED_ORDER_STATUSES } } as const;
export const revenueOrderWhere = { status: { in: REVENUE_ORDER_STATUSES } } as const;

/**
 * The same two sets as SQL fragments, for the `$queryRaw` call sites —
 * `WHERE o."status" IN ${revenueStatusSql}`.
 *
 * Built from the arrays above rather than typed out as SQL text, so a
 * new `OrderStatus` value cannot land in one shape and be forgotten in
 * the other. Each value is cast to the enum type explicitly, which is
 * what a parameterised comparison against a Postgres enum column needs.
 */
function statusListSql(statuses: OrderStatus[]): Prisma.Sql {
  return Prisma.sql`(${Prisma.join(statuses.map((status) => Prisma.sql`${status}::"OrderStatus"`))})`;
}

export const revenueStatusSql = statusListSql(REVENUE_ORDER_STATUSES);
export const countedStatusSql = statusListSql(COUNTED_ORDER_STATUSES);
