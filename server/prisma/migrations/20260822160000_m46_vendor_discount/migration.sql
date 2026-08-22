-- M46 — a HomeKrafter's own discount on their own listings.
--
-- Both nullable with no default, so every existing storefront reads as
-- "no discount" without a backfill. `discountEndsAt` is deliberately not
-- indexed: nothing queries by it — expiry is computed on read against
-- `now`, per vendor row already being loaded.
ALTER TABLE "Vendor" ADD COLUMN "discountPct" INTEGER;
ALTER TABLE "Vendor" ADD COLUMN "discountEndsAt" TIMESTAMP(3);
