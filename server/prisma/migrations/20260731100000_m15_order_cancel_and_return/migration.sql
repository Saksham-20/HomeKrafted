-- M15: the buyer's side of cancellation and returns.
--
-- `RefundStatus.requested` had been in the enum since M8 with no path in
-- the product that could reach it: refunds were something an admin
-- started, with no record of what the buyer actually asked for. These
-- three columns are what `POST /orders/:id/cancel` and
-- `POST /orders/:id/return` write.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3);

-- When the HomeKrafter marked it delivered. The return window counts from
-- here rather than `placedAt` — those can be a week apart on a
-- made-to-order item. Null on rows that reached `delivered` before this.
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3);
