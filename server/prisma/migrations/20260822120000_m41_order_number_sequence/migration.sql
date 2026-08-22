-- M41: order numbers came from COUNT(*) on the whole Order table.
--
-- `generateOrderNumber` ran `tx.order.count()` — no predicate, so a full
-- scan — up to five times, INSIDE the order-create transaction, after the
-- stock-decrement loop had already taken row locks on WeightOption. So
-- every checkout paid a scan that grows with every order ever placed,
-- while holding locks that serialise concurrent checkouts of the same
-- product behind it.
--
-- It was also racy, which matters more. Two concurrent transactions both
-- read count N and both build HK{2100+N}; the findUnique collision check
-- runs inside the transaction and cannot see the other's uncommitted row,
-- so one of them fails the unique constraint on Order.orderNumber. Under
-- load that is a 500 at checkout, not a slow checkout.
--
-- A sequence is O(1), concurrency-safe, and deliberately does NOT roll
-- back: a rolled-back order leaves a gap in the numbering rather than
-- handing its number to somebody else. Gaps are fine. Collisions are not.
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" AS bigint START WITH 2100;

-- Start above every number already issued in the HK#### shape.
--
-- The regexp bound is load-bearing: the old code's last-resort fallback
-- was `HK${Date.now()}`, which produces a 13-digit number. Including one
-- of those in the MAX would jump the sequence to a timestamp and every
-- order number after it would be a 13-digit string forever. The bound
-- keeps those rows unique (they already are) and out of the calculation.
SELECT setval(
  'order_number_seq',
  GREATEST(
    2100,
    COALESCE(
      (
        SELECT MAX(substring("orderNumber" from 3)::bigint)
        FROM "Order"
        WHERE "orderNumber" ~ '^HK[0-9]{1,9}$'
      ),
      2099
    ) + 1
  ),
  false
);
