-- M37: every payout row explains its own arithmetic. `amount` stays the
-- payable figure (net when commission collection is enabled, gross when
-- not); these columns say which. Null on pre-M37 rows, where amount was
-- always gross.
ALTER TABLE "Payout" ADD COLUMN "grossAmount" DECIMAL(12,2);
ALTER TABLE "Payout" ADD COLUMN "commissionAmount" DECIMAL(12,2);
ALTER TABLE "Payout" ADD COLUMN "commissionPct" DECIMAL(5,2);
