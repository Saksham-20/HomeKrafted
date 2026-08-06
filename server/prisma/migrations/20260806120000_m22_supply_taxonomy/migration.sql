-- M22: `SellerSpecialty` covers everything homemade, not only food.
--
-- Five of the eight existing members were food and exactly one —
-- `crafts` — carried the entire non-food half of a marketplace that sells
-- everything homemade. No buyer could filter a candle maker from a potter
-- and no applicant could say which they were.
--
-- **Additive only. No row is rewritten.** Existing `crafts` sellers are
-- deliberately left as `crafts` (relabelled "Other handmade" in the UI):
-- there is no way to know whether a given one pours candles or throws
-- pots, and a guess would print the wrong thing on a real person's
-- storefront. They can re-pick.
--
-- `laundry`/`cleaning` stay untouched — the module is withdrawn (M19) but
-- seeded rows carry the values and the DTO still accepts them, because
-- narrowing an accepted request value breaks the native apps.

ALTER TYPE "SellerSpecialty" ADD VALUE 'beverages' AFTER 'sweets';
ALTER TYPE "SellerSpecialty" ADD VALUE 'candles' AFTER 'beverages';
ALTER TYPE "SellerSpecialty" ADD VALUE 'ceramics' AFTER 'candles';
ALTER TYPE "SellerSpecialty" ADD VALUE 'textiles' AFTER 'ceramics';
ALTER TYPE "SellerSpecialty" ADD VALUE 'jewellery' AFTER 'textiles';
ALTER TYPE "SellerSpecialty" ADD VALUE 'art_prints' AFTER 'jewellery';
ALTER TYPE "SellerSpecialty" ADD VALUE 'bath_body' AFTER 'art_prints';
ALTER TYPE "SellerSpecialty" ADD VALUE 'stationery' AFTER 'bath_body';
ALTER TYPE "SellerSpecialty" ADD VALUE 'home_decor' AFTER 'stationery';
ALTER TYPE "SellerSpecialty" ADD VALUE 'personalised' AFTER 'home_decor';
