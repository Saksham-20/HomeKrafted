-- Veg/non-veg marks, and per-listing notice (2026-09-05).
--
-- Two additions, one owner request: a veg/non-veg filter on the browse
-- pages, and a "Pre-order" badge on listings that need notice.
--
-- 1. `DietaryTag` gains "non-vegetarian" and "contains-egg".
--
--    Absence of "vegetarian" never meant non-veg. A candle carries no
--    dietary tags; so does a curry whose cook left the question blank.
--    Every surface wanting a non-veg filter had to guess, and the guesses
--    are not symmetric: a vegetarian buyer relies on this label, so
--    calling an untagged dish veg is a claim that can be wrong in a way
--    that matters, while calling it non-veg is merely unhelpful.
--
--    Nothing is backfilled. A row written before today carries neither
--    member, which correctly reads as "we never asked", and such a
--    listing appears under neither filter rather than under a guessed
--    one. The listing form asks food makers directly and the gap closes
--    listing by listing — the same shape as M36's pincodes.
--
-- 2. `Product.prepTimeMins` — how much notice *this listing* needs.
--
--    `VendorProfile.prepTimeMins` is the kitchen's default and stays the
--    scheduler's input. This is the per-listing override, and the two are
--    genuinely different questions: a kitchen answering "90 minutes" is
--    describing a thali, and the same kitchen's celebration cake needs
--    two days. It is also what makes the badge mean anything — the
--    platform default is 90 minutes when a kitchen has stated nothing, so
--    a rule reading the kitchen's value would stamp "Pre-order" on
--    essentially every food listing on the site.
--
--    NULL means "not stated", never zero.
ALTER TYPE "DietaryTag" ADD VALUE IF NOT EXISTS 'non-vegetarian';
ALTER TYPE "DietaryTag" ADD VALUE IF NOT EXISTS 'contains-egg';

ALTER TABLE "Product" ADD COLUMN "prepTimeMins" INTEGER;
