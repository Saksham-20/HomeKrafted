-- Address archiving, and the foreign-key index pass that goes with it
-- (2026-09-06).
--
-- 1. `Address.archivedAt`. Deleting an address raised a foreign-key
--    violation for any address that had ever been in a cart or on an
--    order, because eight tables reference it under `Restrict` — which is
--    the correct relation, since an order has to keep saying where it
--    went. The global exception filter turned that `P2003` into a bare
--    500. Deleting now archives, so the address leaves every list and
--    every picker and the history stays intact.
--
-- 2. Sixteen indexes on foreign-key columns. Postgres indexes a primary
--    key, never the columns that reference one, so each of these meant a
--    DELETE of the parent row sequentially scanned the whole child table
--    to prove nothing pointed at it. `Address` really is deleted — by
--    buyers, from /account/addresses — which is what makes the four
--    address-referencing ones matter today; the rest are the same pass
--    M37 ran over `OrderItem`, finished.
--
-- Both halves are additive and take no data with them: a nullable column
-- and a set of indexes. Existing rows read `archivedAt IS NULL`, which is
-- correct — nothing has been archived yet.

-- DropIndex
DROP INDEX "Address_userId_idx";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Address_userId_archivedAt_idx" ON "Address"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Consignment_addressId_idx" ON "Consignment"("addressId");

-- CreateIndex
CREATE INDEX "CorporateQuote_createdById_idx" ON "CorporateQuote"("createdById");

-- CreateIndex
CREATE INDEX "Hamper_recipientAddressId_idx" ON "Hamper"("recipientAddressId");

-- CreateIndex
CREATE INDEX "LaundryBooking_deliverySlotId_idx" ON "LaundryBooking"("deliverySlotId");

-- CreateIndex
CREATE INDEX "LaundryBooking_pickupSlotId_idx" ON "LaundryBooking"("pickupSlotId");

-- CreateIndex
CREATE INDEX "MealPlan_moderatedById_idx" ON "MealPlan"("moderatedById");

-- CreateIndex
CREATE INDEX "Order_giftRecipientAddressId_idx" ON "Order"("giftRecipientAddressId");

-- CreateIndex
CREATE INDEX "OrderShipment_addressId_idx" ON "OrderShipment"("addressId");

-- CreateIndex
CREATE INDEX "Payout_decidedById_idx" ON "Payout"("decidedById");

-- CreateIndex
CREATE INDEX "Product_moderatedById_idx" ON "Product"("moderatedById");

-- CreateIndex
CREATE INDEX "Referral_refereeUserId_idx" ON "Referral"("refereeUserId");

-- CreateIndex
CREATE INDEX "Snack_moderatedById_idx" ON "Snack"("moderatedById");

-- CreateIndex
CREATE INDEX "TaxonomySuggestion_parentCategoryId_idx" ON "TaxonomySuggestion"("parentCategoryId");

-- CreateIndex
CREATE INDEX "TaxonomySuggestion_reviewedById_idx" ON "TaxonomySuggestion"("reviewedById");

-- CreateIndex
CREATE INDEX "TaxonomySuggestion_vendorId_idx" ON "TaxonomySuggestion"("vendorId");

