-- `Product.isSubscribable` shipped in 20260805042146 and nothing ever read
-- or wrote it. `MealPlan.productId` already records that a listing is sold
-- on subscription, and records *which plan* — so the flag was a second,
-- weaker source of truth for one fact.
--
-- Safe to drop: no reader, no writer, and every row still carries the
-- column's default.
DROP INDEX IF EXISTS "Product_isSubscribable_idx";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "isSubscribable";

-- `/gifts` filters on `kind`, so it earns an index the same way `isSnack`
-- and `isHamper` do.
CREATE INDEX IF NOT EXISTS "Product_kind_idx" ON "Product"("kind");
