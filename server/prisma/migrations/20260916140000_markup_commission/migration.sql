-- The markup commission model (2026-09-16).
--
-- A HomeKrafter names what they want to receive; the buyer pays that plus
-- Homekrafted's fee and the GST on it. Stored catalogue prices are the
-- maker's **base**; the buyer-facing figure is derived on read
-- (`server/src/common/pricing/commission.ts`), so a rate change reprices
-- the catalogue with no backfill.
--
-- This migration is **additive and does not move a single rupee**. It adds
-- the columns an order needs to remember its own split, and one index.
-- Re-interpreting the prices already in `WeightOption` is a separate,
-- reversible data pass (`prisma/migrate-to-markup-prices.ts`) that an
-- operator runs deliberately, after telling the makers — see its header.

-- Every order line records what the buyer paid and what the maker earns,
-- computed once at checkout. A payout sums `sellerAmount`; it never
-- re-derives the split against whatever the rate happens to be on the day
-- it is requested, because an order already placed must not change what it
-- earned when an admin edits the rate.
--
-- Nullable on purpose. Pre-2026-09-16 rows were charged under the
-- deduction model and carry no split; `COALESCE("sellerAmount", "price")`
-- reads those as fully payable, which is what their makers were already
-- promised on the listing form.
ALTER TABLE "OrderItem" ADD COLUMN "sellerAmount" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN "commissionAmount" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN "gstAmount" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN "commissionPct" DECIMAL(5,2);
ALTER TABLE "OrderItem" ADD COLUMN "gstPct" DECIMAL(5,2);

-- The price-range filter and the default browse both read price off a
-- product's weight options. With only `@@index([productId])` Postgres
-- matched the product and sorted the prices by hand on every read.
CREATE INDEX "WeightOption_productId_price_idx" ON "WeightOption"("productId", "price");
