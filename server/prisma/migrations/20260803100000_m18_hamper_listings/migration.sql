-- M18: a hamper becomes a listing a HomeKrafter creates, rather than a box
-- a buyer assembles.
--
-- One column. A hamper is a Product — it already needed a vendor, photos,
-- price tiers, availability, moderation, reviews, cart, checkout and
-- search, and a parallel entity would have re-derived all of it. Existing
-- rows default to false, so nothing in the catalogue silently becomes a
-- hamper.
--
-- The `Hamper` / `HamperItem` / `HamperBox` tables are deliberately NOT
-- dropped: orders placed before this milestone reference them, and losing
-- that would make a real customer's order history unreadable.
ALTER TABLE "Product" ADD COLUMN "isHamper" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_isHamper_idx" ON "Product"("isHamper");

-- Backfill from the taxonomy that already encoded this.
--
-- A "Hampers" category has existed since M2 and listings sat in it; the
-- flag is a more precise statement of the same fact, so deriving it is
-- strictly better than shipping an empty /hamper page and asking every
-- HomeKrafter to re-tick a box. The category stays — a hamper is still a
-- sweets or pickles hamper, which is exactly why the flag is separate from
-- it.
UPDATE "Product" p
SET "isHamper" = true
FROM "Category" c
WHERE p."categoryId" = c."id" AND c."slug" = 'hampers';
